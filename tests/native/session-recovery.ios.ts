import { createClient } from '@fieldwork/sdk';
import { iosSmokeFlows } from './ios-smoke-flows';
import { openFixture } from './smoke-fixture';

const flow = iosSmokeFlows(process.argv[2], {});
const { manager, baseUrl } = await openFixture();
const template = await manager.createTemplate('Session recovery checklist', [
  { label: 'Check valve', responseType: 'check' },
]);
const order = await manager.createOrder({
  title: 'Session recovery iOS QA',
  instructions: 'Synthetic report for session recovery.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: template.id,
  dueDate: '2026-12-28',
  priority: 'routine',
});
const summary = 'Valve reauth check';
const draft = { ORDER_NAME: `Open ${order.reference}: ${order.title}`, SUMMARY: summary };
await flow('session-recovery-draft.ios.yaml', draft);
const reset = await manager.createPasswordReset('worker', { expectedAccessVersion: 0 });
await createClient(baseUrl).completePasswordReset(reset.token, 'fieldwork-demo');
await flow('session-recovery-queue.ios.yaml', draft);
if ((await manager.reportHistory(order.id)).total !== 0) {
  throw new Error('An expired session unexpectedly saved a report.');
}
await flow('session-recovery-sign-in.ios.yaml', draft);
const [saved, history] = await Promise.all([
  manager.order(order.id),
  manager.reportHistory(order.id),
]);
if (
  saved.version !== 2 ||
  saved.status !== 'SUBMITTED' ||
  saved.report?.summary !== summary ||
  saved.report.answers[0]?.value !== 'pass' ||
  history.total !== 1
) {
  throw new Error('Expected one saved report with the retained inspection after signing in.');
}
