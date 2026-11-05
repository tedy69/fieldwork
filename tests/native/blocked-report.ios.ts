import { iosSmokeFlows } from './ios-smoke-flows';
import { openFixture } from './smoke-fixture';

const flow = iosSmokeFlows(process.argv[2], {
  METRO_URL: process.env.METRO_URL ?? 'exp://127.0.0.1:8082',
});
const { manager, setAvailable } = await openFixture();
const template = await manager.createTemplate('Blocked iOS checklist', [
  { label: 'Check valve', responseType: 'check' },
]);
const order = await manager.createOrder({
  title: 'Blocked iOS smoke visit',
  instructions: 'Synthetic conflict and recovery fixture.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: template.id,
  dueDate: '2026-12-28',
  priority: 'routine',
});
const summary = 'Valve needs review';
const draft = { ORDER_NAME: `Open ${order.reference}: ${order.title}`, SUMMARY: summary };
await flow('offline-report-draft.ios.yaml', draft);

const updated = await manager.rescheduleOrder(order.id, {
  baseVersion: order.version,
  dueDate: '2026-12-29',
});
await flow('blocked-report-queue.ios.yaml', draft);
try {
  await setAvailable(false);
  await flow('blocked-report-retained.ios.yaml', {
    ...draft,
    ERROR: 'Could not reopen this assignment.*Your queued report is kept on this device.*',
  });
} finally {
  await setAvailable(true);
}

const moved = await manager.reassignOrder(order.id, {
  baseVersion: updated.version,
  assigneeId: 'worker-2',
});
await flow('blocked-report-retained.ios.yaml', {
  ...draft,
  ERROR: 'This assignment is no longer available.*Your queued report is kept on this device.*',
});
const returned = await manager.reassignOrder(order.id, {
  baseVersion: moved.version,
  assigneeId: 'worker',
});
const before = await manager.reportHistory(order.id);
if (before.total !== 0) throw new Error('A blocked attempt unexpectedly wrote a report.');

await flow('blocked-report-reopen.ios.yaml', draft);
const [saved, history] = await Promise.all([
  manager.order(order.id),
  manager.reportHistory(order.id),
]);
const answer = saved.report?.answers[0];
if (
  saved.status !== 'SUBMITTED' ||
  saved.version !== returned.version + 1 ||
  saved.dueDate !== returned.dueDate ||
  saved.report?.summary !== summary ||
  answer?.itemId !== template.items[0].id ||
  answer.value !== 'pass' ||
  history.total !== 1 ||
  history.data[0]?.snapshot.report.summary !== summary
)
  throw new Error('Expected one report with the retained answers on the current assignment.');
console.log(
  `${order.reference} kept the blocked report through outage and reassignment, then synced once.`,
);
