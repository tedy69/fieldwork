import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import {
  OrderSeriesPageSchema,
  OrderSeriesDetailSchema,
  type CreateOrderSeries,
} from '@fieldwork/contracts';

let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
async function login(role: string) {
  return (
    await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: {
        email: `${role}@fieldwork.local`,
        password: 'fieldwork-demo',
      },
    })
  ).json().token as string;
}
const input = (): CreateOrderSeries => ({
  mutationId: randomUUID(),
  title: 'Recurring overview fixture',
  instructions: 'Synthetic batch.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: 'routine',
  dueDate: '2026-12-28',
  priority: 'routine',
  frequency: 'weekly',
  occurrences: 3,
});
const create = async () =>
  (
    await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/work-order-series',
      headers: bearer(manager),
      payload: input(),
    })
  ).json();
const read = (suffix = '', token = manager) =>
  fixture.app.inject({ url: `/api/v1/work-order-series${suffix}`, headers: bearer(token) });
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
});
afterEach(async () => {
  await fixture.app.close();
});

it('requires a current manager before cursor or batch lookup and returns a real empty list', async () => {
  expect((await fixture.app.inject('/api/v1/work-order-series')).statusCode).toBe(401);
  expect((await read('?cursor=bad', worker)).statusCode).toBe(403);
  expect((await read('/bad', worker)).statusCode).toBe(403);
  expect((await read()).json()).toEqual({ data: [], total: 0, nextCursor: null });
  expect((await read(`/${randomUUID()}`)).statusCode).toBe(404);
});

it('lists original assignment metadata without exposing mutation IDs, input bodies, or receipts', async () => {
  const batch = await create();
  fixture.store.db.prepare("UPDATE users SET name='Renamed manager' WHERE id='manager'").run();
  const page = OrderSeriesPageSchema.parse((await read()).json());
  expect(page).toMatchObject({
    total: 1,
    nextCursor: null,
    data: [
      {
        id: batch.id,
        title: 'Recurring overview fixture',
        frequency: 'weekly',
        occurrences: 3,
        firstDueDate: '2026-12-28',
        lastDueDate: '2027-01-11',
        assignee: { id: 'worker', name: 'Sam Rivera' },
        createdBy: { id: 'manager', name: 'Renamed manager' },
      },
    ],
  });
  expect(Object.keys((await read()).json().data[0]).sort()).toEqual([
    'assignee',
    'createdAt',
    'createdBy',
    'firstDueDate',
    'frequency',
    'id',
    'lastDueDate',
    'occurrences',
    'title',
  ]);
});

it('compares planned dates to current orders after independent rescheduling, handover, and submission', async () => {
  const batch = await create();
  const first = batch.orders[0];
  const second = batch.orders[1];
  await fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/work-orders/${first.id}/schedule`,
    headers: bearer(manager),
    payload: { baseVersion: 1, dueDate: '2027-02-01' },
  });
  await fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/work-orders/${first.id}/assignee`,
    headers: bearer(manager),
    payload: { baseVersion: 2, assigneeId: 'worker-2' },
  });
  const report = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/work-orders/${second.id}/reports`,
    headers: bearer(worker),
    payload: {
      mutationId: randomUUID(),
      baseVersion: 1,
      summary: 'Submitted occurrence.',
      photos: [],
      answers: second.template.items.map((item: { id: string }) => ({
        itemId: item.id,
        value: 'pass',
        note: '',
      })),
    },
  });
  expect(report.statusCode).toBe(200);
  const detail = OrderSeriesDetailSchema.parse((await read(`/${batch.id}`)).json());
  expect(detail.orders.map((member) => member.occurrence)).toEqual([1, 2, 3]);
  expect(detail.orders.map((member) => member.plannedDueDate)).toEqual([
    '2026-12-28',
    '2027-01-04',
    '2027-01-11',
  ]);
  expect(detail.orders[0].order).toMatchObject({
    version: 3,
    dueDate: '2027-02-01',
    assignee: { id: 'worker-2' },
  });
  expect(detail.orders[1].order.status).toBe('SUBMITTED');
  expect(detail.orders[2].order).toEqual(batch.orders[2]);
  expect(detail.assignee).toEqual({ id: 'worker', name: 'Sam Rivera' });
  expect((await read(`/${batch.id}`, worker)).statusCode).toBe(403);
});

it('paginates timestamp ties by ID and does not shift older pages when another batch arrives', async () => {
  const batches = [];
  for (let index = 0; index < 4; index++) batches.push(await create());
  fixture.store.db
    .prepare(
      "UPDATE order_series SET receipt=json_set(receipt,'$.createdAt','2026-10-20T01:00:00Z')",
    )
    .run();
  const sorted = batches
    .map((batch) => batch.id)
    .sort()
    .reverse();
  const first = (await read('?limit=2')).json();
  expect(first.data.map((batch: { id: string }) => batch.id)).toEqual(sorted.slice(0, 2));
  expect(first.nextCursor).toBe(sorted[1]);
  await create();
  const second = (await read(`?limit=2&cursor=${first.nextCursor}`)).json();
  expect(second.data.map((batch: { id: string }) => batch.id)).toEqual(sorted.slice(2));
  expect(second.total).toBe(5);
  expect(second.nextCursor).toBeNull();
  expect((await read(`?cursor=${sorted[3]}`)).json().data).toEqual([]);
  expect((await read(`?cursor=${randomUUID()}`)).json().error.code).toBe('INVALID_CURSOR');
});

it.each(['?limit=0', '?limit=51', '?limit=2.5', '?cursor=', '?cursor=bad', '?offset=0', '?q=gate'])(
  'rejects invalid pagination %s',
  async (suffix) => {
    expect((await read(suffix)).statusCode).toBe(422);
  },
);

it('reads batches created by another current manager without changing any saved records', async () => {
  const batch = await create();
  fixture.store.db.prepare("UPDATE users SET role='manager' WHERE id='worker-2'").run();
  const other = await login('jordan');
  const tables = [
    'users',
    'sessions',
    'catalog',
    'work_orders',
    'mutations',
    'photos',
    'audit',
    'report_revisions',
    'order_series',
    'order_series_members',
    'migrations',
  ];
  const snapshot = () =>
    tables.map((table) => fixture.store.db.prepare(`SELECT * FROM ${table}`).all());
  const before = snapshot();
  expect((await read('', other)).json().data[0].id).toBe(batch.id);
  expect((await read(`/${batch.id}`, other)).json().orders).toHaveLength(3);
  expect(snapshot()).toEqual(before);
  fixture.store.db.prepare("UPDATE users SET role='worker' WHERE id='worker-2'").run();
  expect((await read(`/${batch.id}`, other)).statusCode).toBe(403);
});

it('fails visibly on incomplete membership instead of presenting a partial successful batch', async () => {
  const batch = await create();
  fixture.store.db
    .prepare('DELETE FROM order_series_members WHERE series_id=? AND occurrence=2')
    .run(batch.id);
  const response = await read(`/${batch.id}`);
  expect(response.statusCode).toBe(500);
  expect(response.json().error.code).toBe('INTERNAL');
  expect(response.json()).not.toHaveProperty('orders');
});
