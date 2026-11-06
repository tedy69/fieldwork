import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@fieldwork/sdk';
import { notebookSmokeFlows } from './notebook-smoke-flows';
import { openFixture, run } from './smoke-fixture';

const device = process.argv[2] ?? '';
const { android, flow } = notebookSmokeFlows(device);
const { manager, baseUrl, setAvailable } = await openFixture();
const session = await createClient(baseUrl).login('worker@fieldwork.local', 'fieldwork-demo');
const worker = createClient(baseUrl, () => session.token);
const suffix = randomUUID().slice(0, 6);
const template = await manager.createTemplate(`Review clipboard QA ${suffix}`, ['Check valve']);
const order = await manager.createOrder({
  title: `Review clipboard QA ${suffix}`,
  instructions: 'Synthetic review clipboard fixture.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: template.id,
  dueDate: '2026-12-28',
  priority: 'routine',
});
const earlierNote = android ? 'Inspect the older valve' : 'Catatan awal.\nPeriksa katup 東京.';
const currentNote = android ? 'Current valve is safe' : 'Revisi diterima.\nKatup A aman.';
const currentSummary = `Saved valve report ${suffix}`;
const submit = (baseVersion: number, summary: string, value: 'pass' | 'fail') =>
  worker.submitReport(order.id, {
    mutationId: randomUUID(),
    baseVersion,
    summary,
    answers: [{ itemId: template.items[0].id, value, note: '' }],
    photos: [],
  });
const earlier = await submit(order.version, `Initial valve report ${suffix}`, 'fail');
const changes = await manager.review(order.id, earlier.version, 'CHANGES_REQUESTED', earlierNote);
const latest = await submit(changes.version, currentSummary, 'pass');
const approved = await manager.review(order.id, latest.version, 'APPROVED', currentNote);
const variables = {
  APP_ID: android ? 'host.exp.exponent' : 'host.exp.Exponent',
  ORDER_NAME: `Open ${order.reference}: ${order.title}`,
  REVISION: `report-history-version-${earlier.version}`,
};
const test = (name: string) => flow(`review-clipboard-${name}.yaml`, variables);

async function assertClipboard(expected: string) {
  if (!android) {
    const copied = execFileSync('xcrun', ['simctl', 'pbpaste', device], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(copied, expected);
    return;
  }
  await test('android-paste-target');
  await run(
    process.env.ADB ?? 'adb',
    ['-s', device, 'shell', 'input', 'keyevent', 'KEYCODE_PASTE'],
    10_000,
  );
  await flow('assignment-search-paste.android.yaml', { CLIPBOARD_TEXT: expected });
}

await flow(
  android ? 'site-coordinates-cache.android.yaml' : 'site-coordinates-cache.ios.yaml',
  variables,
);
await test('open-history');
try {
  await setAvailable(false);
  await test('copy-note');
  if (android) await test('close-history');
  await assertClipboard(earlierNote);
  await test(android ? 'open-current' : 'close-history');
  await test('copy-note');
  await assertClipboard(currentNote);
  if (android) await test('open-current');
  await test('copy-summary');
  await assertClipboard(currentSummary);
} finally {
  await setAvailable(true);
}
assert.equal((await manager.order(order.id)).version, approved.version);
assert.equal((await manager.reportHistory(order.id)).total, 2);
console.log(`${order.reference} copied both saved notes and the latest summary during an outage.`);
