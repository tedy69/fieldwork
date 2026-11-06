import { execFileSync } from 'node:child_process';
import { iosSmokeFlows } from './ios-smoke-flows';
import { openFixture } from './smoke-fixture';

const device = process.argv[2] ?? '';
const flow = iosSmokeFlows(device, {
  METRO_URL: process.env.METRO_URL ?? 'exp://127.0.0.1:8082',
});
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
const summary = `Valve checked for ${order.reference}`;
const draft = { ORDER_NAME: `Open ${order.reference}: ${order.title}`, SUMMARY: summary };
await flow('offline-report-draft.ios.yaml', draft);
try {
  await setAvailable(false);
  await flow('offline-report-queue.ios.yaml', draft);
} finally {
  await setAvailable(true);
}
await flow('offline-report-reconnect.ios.yaml', draft);

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

try {
  await setAvailable(false);
  await flow('offline-report-copy.ios.yaml');
  const pasted = execFileSync('xcrun', ['simctl', 'pbpaste', device], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (pasted !== summary)
    throw new Error('Expected the exact saved summary in the iOS pasteboard.');
  console.log(`${order.reference} copied the exact saved summary while offline on iOS.`);
} finally {
  await setAvailable(true);
}
