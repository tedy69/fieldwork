import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nextSevenDaysEnd } from '@fieldwork/contracts';
import { createClient } from '@fieldwork/sdk';
import { openFixture, run } from './smoke-fixture';

const device = process.argv[2] ?? '';
if (!/^emulator-\d+$/.test(device)) throw new Error('Pass a dedicated Android emulator ID.');
const adb = process.env.ADB ?? 'adb';
const shell = (...args: string[]) =>
  execFileSync(adb, ['-s', device, 'shell', ...args], { encoding: 'utf8', timeout: 10000 }).trim();
if (shell('getprop', 'ro.kernel.qemu') !== '1') throw new Error('Use a booted Android emulator.');
const today = shell('date', '+%F');
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('Could not read the emulator date.');
const through = nextSevenDaysEnd(today);
const dayAfterRange = new Date(through);
dayAfterRange.setUTCDate(dayAfterRange.getUTCDate() + 1);

const { manager, baseUrl, setAvailable } = await openFixture();
const template = await manager.createTemplate('Upcoming filter checklist', [
  { label: 'Check valve', responseType: 'check' },
]);
const search = `ScheduleQA${randomUUID().slice(0, 6)}`;
const create = (title: string, dueDate: string) =>
  manager.createOrder({
    title,
    instructions: 'Synthetic schedule fixture.',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: template.id,
    dueDate,
    priority: 'routine',
  });
const [first, last, beyond, approved] = await Promise.all([
  create(`${search} today`, today),
  create(`${search} last day`, through),
  create(`${search} outside range`, dayAfterRange.toISOString().slice(0, 10)),
  create(`${search} approved`, today),
  create('Unrelated schedule QA', today),
]);
const session = await createClient(baseUrl).login('worker@fieldwork.local', 'fieldwork-demo');
const worker = createClient(baseUrl, () => session.token);
const report = await worker.submitReport(approved.id, {
  mutationId: randomUUID(),
  baseVersion: approved.version,
  answers: [{ itemId: template.items[0].id, value: 'pass', note: '' }],
  summary: 'Synthetic approved visit.',
  photos: [],
});
await manager.review(approved.id, report.version, 'APPROVED', 'Synthetic approval.');

const flow = (name: string, variables: Record<string, string> = {}) =>
  run(
    'maestro',
    [
      '--device',
      device,
      'test',
      ...Object.entries(variables).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
      fileURLToPath(new URL(name, import.meta.url)),
    ],
    180_000,
  );
const open = (order: typeof first) => `Open ${order.reference}: ${order.title}`;
await flow('upcoming-filter-cache.android.yaml', { SEARCH: search, BEYOND: open(beyond) });
try {
  await setAvailable(false);
  await flow('upcoming-filter-offline.android.yaml', {
    SEARCH: search,
    FIRST: open(first),
    LAST: open(last),
  });
} finally {
  await setAvailable(true);
}
await flow('upcoming-filter-reconnected.android.yaml');
