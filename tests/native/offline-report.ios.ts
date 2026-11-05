import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openFixture, run } from './smoke-fixture';

const device = process.argv[2]?.toUpperCase() ?? '';
const booted = JSON.parse(
  execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], {
    encoding: 'utf8',
    timeout: 10000,
  }),
) as { devices: Record<string, { udid: string }[]> };
const iosDevices = Object.entries(booted.devices)
  .filter(([runtime]) => runtime.startsWith('com.apple.CoreSimulator.SimRuntime.iOS-'))
  .flatMap(([, devices]) => devices);
if (!device || !iosDevices.some(({ udid }) => udid === device))
  throw new Error('Pass the ID of a dedicated booted iOS simulator.');

const metro = process.env.METRO_URL ?? 'exp://127.0.0.1:8082';
const { manager, setAvailable } = await openFixture();
const template = await manager.createTemplate('Offline iOS checklist', [
  { label: 'Check valve', responseType: 'check' },
]);
const order = await manager.createOrder({
  title: 'Offline iOS smoke visit',
  instructions: 'Synthetic draft and sync fixture.',
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
      '-e',
      `SUMMARY=${summary}`,
      fileURLToPath(new URL(name, import.meta.url)),
    ],
    180_000,
  );
}
await flow('offline-report-draft.ios.yaml');
try {
  await setAvailable(false);
  await flow('offline-report-queue.ios.yaml');
} finally {
  await setAvailable(true);
}
await flow('offline-report-reconnect.ios.yaml');

const [saved, history] = await Promise.all([
  manager.order(order.id),
  manager.reportHistory(order.id),
]);
const answer = saved.report?.answers[0];
if (
  saved.status !== 'SUBMITTED' ||
  saved.version !== 2 ||
  saved.report?.summary !== summary ||
  answer?.itemId !== template.items[0].id ||
  answer.value !== 'pass' ||
  history.total !== 1 ||
  history.data[0]?.snapshot.report.summary !== summary
)
  throw new Error('Expected exactly one saved revision with the retained draft.');
console.log(`${order.reference} synced once after two iOS restarts.`);
