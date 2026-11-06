import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localDate } from '@fieldwork/contracts';
import { notebookSmokeFlows } from './notebook-smoke-flows';
import { openFixture } from './smoke-fixture';

const { android, flow } = notebookSmokeFlows(process.argv[2]);

const { manager, setAvailable } = await openFixture();
const search = `DraftQA${randomUUID().slice(0, 6)}`;
const create = (title: string) =>
  manager.createOrder({
    title: `${search} ${title}`,
    instructions: 'Synthetic offline draft filter fixture.',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: 'routine',
    dueDate: localDate(),
    priority: 'routine',
  });
const draft = await create('draft');
const blank = await create('untouched');
const variables = {
  APP_ID: android ? 'host.exp.exponent' : 'host.exp.Exponent',
  DRAFT_NAME: `Open ${draft.reference}: ${draft.title}`,
  ORDER_NAME: `Open ${blank.reference}: ${blank.title}`,
  SEARCH: search,
  SUMMARY: `Saved${search}`,
};
await flow(
  android ? 'site-coordinates-cache.android.yaml' : 'site-coordinates-cache.ios.yaml',
  variables,
);
try {
  await setAvailable(false);
  await flow('drafts-filter-offline.yaml', variables);
} finally {
  await setAvailable(true);
}
const saved = await manager.order(draft.id);
assert.equal(saved.status, 'ASSIGNED');
assert.equal((await manager.reportHistory(draft.id)).total, 0);
