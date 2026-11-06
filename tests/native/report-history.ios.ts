import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@fieldwork/sdk';
import { iosSmokeFlows } from './ios-smoke-flows';
import { openFixture } from './smoke-fixture';

const device = process.argv[2]?.toUpperCase() ?? '';
const flow = iosSmokeFlows(device, {});
const { manager, baseUrl, setAvailable } = await openFixture();
const session = await createClient(baseUrl).login('worker@fieldwork.local', 'fieldwork-demo');
const worker = createClient(baseUrl, () => session.token);
const template = await manager.createTemplate('Native history checklist', [
  { label: 'Check gauge', responseType: 'check' },
]);
let order = await manager.createOrder({
  title: 'Native report history QA',
  instructions: 'Synthetic report revision fixture.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: template.id,
  dueDate: '2026-12-28',
  priority: 'routine',
});
const olderSummary = `Gauge visit 10 for ${order.reference}`;
for (let number = 1; number <= 11; number++) {
  const submitted = await worker.submitReport(order.id, {
    mutationId: randomUUID(),
    baseVersion: order.version,
    answers: [{ itemId: template.items[0].id, value: 'pass', note: '' }],
    summary: number === 10 ? olderSummary : `Gauge visit ${number}`,
    photos: [],
  });
  order = await manager.review(order.id, submitted.version, 'CHANGES_REQUESTED', `Check ${number}`);
}
await flow('report-history-open.ios.yaml', {
  ORDER_NAME: `Buka ${order.reference}: ${order.title}`,
});
try {
  await setAvailable(false);
  await flow('report-history-outage.ios.yaml', { OLDER_SUMMARY: olderSummary });
  const pasted = execFileSync('xcrun', ['simctl', 'pbpaste', device], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (pasted !== olderSummary) throw new Error('The clipboard did not match the older revision.');
} finally {
  await setAvailable(true);
}
await flow('report-history-retry.ios.yaml');
const saved = await manager.order(order.id);
if (saved.version !== order.version || saved.report?.summary !== 'Gauge visit 11') {
  throw new Error('Reading history changed the current report.');
}
