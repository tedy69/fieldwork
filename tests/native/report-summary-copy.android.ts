import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@fieldwork/sdk';
import { openFixture, run } from './smoke-fixture';

const device = process.argv[2] ?? '';
if (!/^emulator-\d+$/.test(device)) throw new Error('Pass a dedicated Android emulator ID.');
const adb = process.env.ADB ?? 'adb';
const emulator = execFileSync(adb, ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu'], {
  encoding: 'utf8',
  timeout: 10_000,
}).trim();
if (emulator !== '1') throw new Error('Use a booted Android emulator.');

const { manager, baseUrl, setAvailable } = await openFixture();
const order = await manager.createOrder({
  title: 'Saved report summary Android QA',
  instructions: 'Synthetic saved report fixture.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: 'routine',
  dueDate: '2026-12-28',
  priority: 'routine',
});
const summary = `Valve checked for ${order.reference}`;
const session = await createClient(baseUrl).login('worker@fieldwork.local', 'fieldwork-demo');
await createClient(baseUrl, () => session.token).submitReport(order.id, {
  mutationId: randomUUID(),
  baseVersion: order.version,
  answers: order.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
  summary,
  photos: [],
});

const flow = (name: string) =>
  run(
    'maestro',
    [
      '--device',
      device,
      'test',
      '-e',
      `ORDER_NAME=Open ${order.reference}: ${order.title}`,
      '-e',
      `CLIPBOARD_TEXT=${summary}`,
      fileURLToPath(new URL(name, import.meta.url)),
    ],
    180_000,
  );

await flow('site-coordinates-cache.android.yaml');
try {
  await setAvailable(false);
  await flow('report-summary-copy.android.yaml');
  await run(adb, ['-s', device, 'shell', 'input', 'keyevent', 'KEYCODE_PASTE'], 10_000);
  await flow('assignment-search-paste.android.yaml');
} finally {
  await setAvailable(true);
}
