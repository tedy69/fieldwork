import { fileURLToPath } from 'node:url';
import { openFixture, run } from './smoke-fixture';

const device = process.argv[2] ?? '';
if (!device.startsWith('emulator-')) throw new Error('Pass a dedicated Android emulator ID.');
const adb = process.env.ADB ?? 'adb';
const metro = process.env.METRO_URL ?? 'exp://127.0.0.1:8082';
const { manager, setAvailable } = await openFixture();
const template = await manager.createTemplate('Item evidence smoke checklist', [
  { label: 'Check valve', responseType: 'check', requiresPhoto: true },
]);
const order = await manager.createOrder({
  title: 'Item evidence smoke visit',
  instructions: 'Synthetic photo evidence fixture.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: template.id,
  dueDate: '2026-12-28',
  priority: 'routine',
});
const summary = 'Valve checked';
function flow(name: string) {
  return run(
    'maestro',
    [
      '--device',
      device,
      'test',
      '-e',
      `ORDER_NAME=Open ${order.reference}: ${order.title}`,
      '-e',
      `METRO_URL=${metro}`,
      fileURLToPath(new URL(name, import.meta.url)),
    ],
    180_000,
  );
}
await flow('item-evidence-attach.android.yaml');
// Use Android keyboard input around Maestro's Android typing issue.
await run(adb, ['-s', device, 'shell', 'input', 'text', summary.replaceAll(' ', '%s')], 30000);
try {
  await setAvailable(false);
  await flow('item-evidence-outage.android.yaml');
} finally {
  await setAvailable(true);
}
await flow('item-evidence-reconnect.android.yaml');
const [saved, history] = await Promise.all([
  manager.order(order.id),
  manager.reportHistory(order.id),
]);
const itemId = template.items[0].id;
if (
  saved.status !== 'SUBMITTED' ||
  saved.version !== 2 ||
  saved.report?.summary !== summary ||
  saved.report.photos.length !== 1 ||
  saved.report.photos[0].itemId !== itemId ||
  history.total !== 1 ||
  history.data[0]?.snapshot.report.photos[0]?.itemId !== itemId
)
  throw new Error('Expected one saved revision with the photo linked to its question.');
console.log(`${order.reference} synced once with its item photo.`);
