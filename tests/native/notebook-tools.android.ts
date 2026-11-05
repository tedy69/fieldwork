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
  timeout: 10000,
}).trim();
if (emulator !== '1') throw new Error('Use a booted Android emulator.');

const { manager, baseUrl } = await openFixture();
const account = createClient(baseUrl);
const session = await account.login('worker@fieldwork.local', 'fieldwork-demo');
const worker = createClient(baseUrl, () => session.token);
const site = await manager.createSite('Android notebook QA site', 'Synthetic site', {
  latitude: 0,
  longitude: -106.8,
});
const template = await manager.createTemplate('Android notebook QA checklist', [
  { label: 'Check gate', responseType: 'check' },
]);
let order = await manager.createOrder({
  title: 'Android notebook QA visit',
  instructions: 'Synthetic report history fixture.',
  siteId: site.id,
  assigneeId: session.user.id,
  templateId: template.id,
  dueDate: '2026-12-28',
  priority: 'routine',
});
for (let number = 1; number <= 2; number++) {
  const submitted = await worker.submitReport(order.id, {
    mutationId: randomUUID(),
    baseVersion: order.version,
    answers: [{ itemId: template.items[0].id, value: 'pass', note: '' }],
    summary: `Android gate report ${number}`,
    photos: [],
  });
  order = await manager.review(
    order.id,
    submitted.version,
    number === 1 ? 'CHANGES_REQUESTED' : 'APPROVED',
    `Android review ${number}`,
  );
}
const reset = await manager.createPasswordReset(session.user.id, { expectedAccessVersion: 0 });
await account.completePasswordReset(reset.token, 'fieldwork-demo');
await run(
  'maestro',
  [
    '--device',
    device,
    'test',
    '-e',
    `ORDER_NAME=Open ${order.reference}: ${order.title}`,
    fileURLToPath(new URL('notebook-tools.android.yaml', import.meta.url)),
  ],
  180_000,
);

const [saved, history] = await Promise.all([
  manager.order(order.id),
  manager.reportHistory(order.id),
]);
if (saved.version !== order.version || saved.status !== 'APPROVED' || history.total !== 2) {
  throw new Error('Expected reading tools to leave both saved revisions unchanged.');
}
