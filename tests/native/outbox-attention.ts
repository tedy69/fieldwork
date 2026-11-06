import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localDate } from '@fieldwork/contracts';
import { notebookSmokeFlows } from './notebook-smoke-flows';
import { openFixture } from './smoke-fixture';

const { android, flow } = notebookSmokeFlows(process.argv[2]);
const { manager, setAvailable } = await openFixture();
const prefix = `OutboxQA${randomUUID().slice(0, 6)}`;
const template = await manager.createTemplate(`${prefix} checklist`, [
  { label: 'Check valve', responseType: 'check' },
]);
const create = (title: string) =>
  manager.createOrder({
    title: `${prefix} ${title}`,
    instructions: 'Synthetic outbox attention fixture.',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: template.id,
    dueDate: localDate(),
    priority: 'routine',
  });
const first = await create('Pump');
const second = await create('Gate');
const app = { APP_ID: android ? 'host.exp.exponent' : 'host.exp.Exponent' };
const firstName = `Open ${first.reference}: ${first.title}`;
const secondName = `Open ${second.reference}: ${second.title}`;
await flow('outbox-attention-cache.yaml', {
  ...app,
  FIRST: firstName,
  SECOND: secondName,
  PREFIX: prefix,
});
const moved = await manager.rescheduleOrder(first.id, {
  baseVersion: first.version,
  dueDate: first.dueDate === '2030-01-10' ? '2030-01-11' : '2030-01-10',
});
try {
  await setAvailable(false);
  await flow('outbox-attention-queue.yaml', { ...app, ORDER: firstName, SUMMARY: 'ValveSearchQA' });
  await flow('outbox-attention-queue.yaml', { ...app, ORDER: secondName, SUMMARY: 'GateSearchQA' });
  await flow('outbox-attention-offline.yaml', {
    ...app,
    FIRST_TITLE: first.title,
    SECOND_TITLE: second.title,
  });
} finally {
  await setAvailable(true);
}
await flow('outbox-attention-reconnect.yaml', app);
const [blocked, saved, blockedHistory, savedHistory] = await Promise.all([
  manager.order(first.id),
  manager.order(second.id),
  manager.reportHistory(first.id),
  manager.reportHistory(second.id),
]);
assert.equal(blocked.version, moved.version);
assert.equal(blocked.status, 'ASSIGNED');
assert.equal(blockedHistory.total, 0);
assert.equal(saved.status, 'SUBMITTED');
assert.equal(saved.report?.summary, 'GateSearchQA');
assert.equal(savedHistory.total, 1);
console.log(`${first.reference} stayed blocked on the device and ${second.reference} synced once.`);
