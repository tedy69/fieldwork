import { randomUUID } from 'node:crypto';
import { createClient } from '@fieldwork/sdk';
import { iosSmokeFlows } from './ios-smoke-flows';
import { openFixture } from './smoke-fixture';

const flow = iosSmokeFlows(process.argv[2], {});
const { manager, baseUrl, setAvailable } = await openFixture();
const template = await manager.createTemplate('Overdue filter checklist', [
  { label: 'Check valve', responseType: 'check' },
]);
const create = (title: string, dueDate: string) =>
  manager.createOrder({
    title: `Overdue QA ${title}`,
    instructions: 'Synthetic overdue fixture.',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: template.id,
    dueDate,
    priority: 'routine',
  });
const late = await create('past', '2026-01-01');
const approved = await create('approved', '2026-01-01');
const future = await create('future', '2099-01-01');
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
await flow('overdue-filter-cache.ios.yaml', {
  FUTURE: `Open ${future.reference}: ${future.title}`,
});
try {
  await setAvailable(false);
  await flow('overdue-filter-offline.ios.yaml', { LATE: `Open ${late.reference}: ${late.title}` });
} finally {
  await setAvailable(true);
}
