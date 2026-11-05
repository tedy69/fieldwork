import { randomUUID } from 'node:crypto';
import { localDate, nextSevenDaysEnd } from '@fieldwork/contracts';
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
const today = await create('today', localDate());
const approvedToday = await create('approved today', today.dueDate);
const through = nextSevenDaysEnd(today.dueDate);
const edge = await create('last day in range', through);
const beyond = new Date(through);
beyond.setUTCDate(beyond.getUTCDate() + 1);
const future = await create('future', beyond.toISOString().slice(0, 10));
const session = await createClient(baseUrl).login('worker@fieldwork.local', 'fieldwork-demo');
const worker = createClient(baseUrl, () => session.token);
for (const order of [approved, approvedToday]) {
  const report = await worker.submitReport(order.id, {
    mutationId: randomUUID(),
    baseVersion: order.version,
    answers: [{ itemId: template.items[0].id, value: 'pass', note: '' }],
    summary: 'Synthetic approved visit.',
    photos: [],
  });
  await manager.review(order.id, report.version, 'APPROVED', 'Synthetic approval.');
}
await flow('overdue-filter-cache.ios.yaml', {
  FUTURE: `Open ${future.reference}: ${future.title}`,
});
try {
  await setAvailable(false);
  await flow('overdue-filter-offline.ios.yaml', {
    LATE: `Open ${late.reference}: ${late.title}`,
    LATE_ID: `Buka ${late.reference}: ${late.title}`,
    TODAY: `Open ${today.reference}: ${today.title}`,
    EDGE: `Open ${edge.reference}: ${edge.title}`,
  });
} finally {
  await setAvailable(true);
}
await flow('overdue-filter-reconnected.ios.yaml');
