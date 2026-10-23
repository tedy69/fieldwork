import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import { OrderSearchPageSchema, type OrderSearchQuery, type WorkOrder } from '@fieldwork/contracts';

let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
let other: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
async function login(email: string) {
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    payload: { email: `${email}@fieldwork.local`, password: 'fieldwork-demo' },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}
function search(query: OrderSearchQuery = {}, token = manager) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  return fixture.app.inject({
    url: `/api/v1/work-orders/search?${params}`,
    headers: bearer(token),
  });
}
const ids = (result: { json(): { data: WorkOrder[] } }) =>
  result.json().data.map((order) => order.id);
async function submit(id: string, token: string) {
  const order = fixture.store.getOrder(id)!;
  const response = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/work-orders/${id}/reports`,
    headers: bearer(token),
    payload: {
      mutationId: randomUUID(),
      baseVersion: order.version,
      summary: 'Synthetic search report.',
      photos: [],
      answers: order.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as WorkOrder;
}
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
  other = await login('jordan');
  const base = fixture.store.getOrder('demo-1')!;
  for (const [id, title, dueDate, priority, assignee, createdAt] of [
    [
      'search-a',
      'Search QA CAFÉ 100%_ops',
      '2026-10-20',
      'urgent',
      'worker',
      '2026-10-20T12:00:00Z',
    ],
    ['search-b', 'Search QA routine', '2026-10-25', 'routine', 'worker', '2026-10-21T12:00:00Z'],
    [
      'search-c',
      'Search QA replacement',
      '2026-10-21',
      'urgent',
      'worker-2',
      '2026-10-21T12:00:00Z',
    ],
    ['search-d', 'Search QA latest', '2026-10-31', 'routine', 'worker', '2026-10-22T12:00:00Z'],
  ] as const)
    fixture.store.writeOrder({
      ...base,
      id,
      reference: `FW-QA-${id}`,
      title,
      dueDate,
      priority,
      assignee: fixture.store.getUser(assignee)!,
      site: { ...base.site, name: 'East Depot' },
      createdAt,
    });
});
afterEach(async () => {
  await fixture.app.close();
});

it('requires a session and applies worker boundaries before every filter and cursor', async () => {
  expect((await fixture.app.inject('/api/v1/work-orders/search')).statusCode).toBe(401);
  expect(ids(await search({ q: 'Search QA' }))).toEqual([
    'search-d',
    'search-c',
    'search-b',
    'search-a',
  ]);
  expect(ids(await search({ q: 'Search QA' }, worker))).toEqual([
    'search-d',
    'search-b',
    'search-a',
  ]);
  expect(ids(await search({ q: 'Search QA' }, other))).toEqual(['search-c']);
  expect((await search({ q: 'Search QA', assigneeId: 'worker-2' }, worker)).json().total).toBe(0);
  expect((await search({ q: 'Jordan Lee' }, worker)).json().total).toBe(0);
  expect((await search({ cursor: 'search-c' }, worker)).json().error.code).toBe('INVALID_CURSOR');
  expect((await search({ cursor: 'missing' }, worker)).json().error.code).toBe('INVALID_CURSOR');
});

it('combines status, worker, priority and inclusive date bounds', async () => {
  expect(
    ids(
      await search({
        q: 'Search QA',
        status: 'ASSIGNED',
        assigneeId: 'worker',
        priority: 'routine',
        dueFrom: '2026-10-25',
        dueThrough: '2026-10-31',
      }),
    ),
  ).toEqual(['search-d', 'search-b']);
  expect(
    ids(await search({ q: 'Search QA', dueFrom: '2026-10-25', dueThrough: '2026-10-25' })),
  ).toEqual(['search-b']);
  expect(ids(await search({ q: 'Search QA', dueThrough: '2026-10-21' }))).toEqual([
    'search-c',
    'search-a',
  ]);
  await submit('search-b', worker);
  expect(ids(await search({ q: 'Search QA', status: 'SUBMITTED' }))).toEqual(['search-b']);
});

it('uses an explicit local date for overdue work and excludes approved reports', async () => {
  const submitted = await submit('search-a', worker);
  const reviewed = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/work-orders/search-a/reviews',
    headers: bearer(manager),
    payload: { baseVersion: submitted.version, decision: 'APPROVED', note: 'Checked.' },
  });
  expect(reviewed.statusCode).toBe(200);
  expect(ids(await search({ q: 'Search QA', overdueBefore: '2026-10-25' }))).toEqual(['search-c']);
  expect(
    ids(await search({ q: 'Search QA', overdueBefore: '2026-10-26', status: 'APPROVED' })),
  ).toEqual([]);
  expect(ids(await search({ q: 'Search QA', overdueBefore: '2026-10-26' }, worker))).toEqual([
    'search-b',
  ]);
});

it.each([
  ['cafe\u0301', ['search-a']],
  ['fW-qA-search-b', ['search-b']],
  ['east depot', ['search-d', 'search-c', 'search-b', 'search-a']],
  ['Jordan Lee', ['search-c']],
  ['100%_', ['search-a']],
  ['100XXops', []],
  ["%' OR 1=1 --", []],
  [' Search QA routine ', ['search-b']],
] as const)('matches literal normalized text %s across supported fields', async (q, expected) => {
  expect(ids(await search({ q }))).toEqual(expected);
});

it('pages tied creation times without duplication when new work arrives', async () => {
  const first = OrderSearchPageSchema.parse((await search({ q: 'Search QA', limit: 2 })).json());
  expect(first.data.map((order) => order.id)).toEqual(['search-d', 'search-c']);
  expect(first.nextCursor).toBe('search-c');
  fixture.store.writeOrder({
    ...fixture.store.getOrder('search-d')!,
    id: 'search-e',
    createdAt: '2026-10-23T12:00:00Z',
  });
  const next = OrderSearchPageSchema.parse(
    (await search({ q: 'Search QA', limit: 2, cursor: first.nextCursor! })).json(),
  );
  expect(next.total).toBe(5);
  expect(next.data.map((order) => order.id)).toEqual(['search-b', 'search-a']);
  expect(next.nextCursor).toBeNull();
  expect((await search({ q: 'Search QA', cursor: 'search-a' })).json().data).toEqual([]);
  expect((await search({ q: 'No saved matches' })).json()).toEqual({
    data: [],
    total: 0,
    nextCursor: null,
  });
});

it('rejects a cursor that no longer matches after a submission or reassignment', async () => {
  await submit('search-c', other);
  expect(
    (await search({ q: 'Search QA', status: 'ASSIGNED', cursor: 'search-c' })).json().error.code,
  ).toBe('INVALID_CURSOR');
  const reassigned = await fixture.app.inject({
    method: 'PATCH',
    url: '/api/v1/work-orders/search-b/assignee',
    headers: bearer(manager),
    payload: { baseVersion: 1, assigneeId: 'worker-2' },
  });
  expect(reassigned.statusCode).toBe(200);
  expect((await search({ q: 'Search QA', cursor: 'search-b' }, worker)).json().error.code).toBe(
    'INVALID_CURSOR',
  );
  expect(ids(await search({ q: 'Search QA', assigneeId: 'worker' }))).not.toContain('search-b');
});

it.each([
  'limit=0',
  'limit=101',
  'limit=1.5',
  'cursor=',
  'status=ALL',
  'priority=high',
  'assigneeId=',
  'dueFrom=2026-02-29',
  'dueThrough=tomorrow',
  'overdueBefore=2026-10-23T00:00:00Z',
  'dueFrom=2026-10-31&dueThrough=2026-10-01',
  'offset=1',
  `q=${'a'.repeat(201)}`,
])('rejects malformed search input %s', async (query) => {
  expect(
    (
      await fixture.app.inject({
        url: `/api/v1/work-orders/search?${query}`,
        headers: bearer(manager),
      })
    ).statusCode,
  ).toBe(422);
});

it('keeps the old offset endpoint and all persisted records unchanged', async () => {
  const before = fixture.store.db.prepare('SELECT * FROM work_orders ORDER BY id').all();
  const page = await search({ q: 'Search QA', limit: 1 });
  expect(page.statusCode).toBe(200);
  expect(fixture.store.db.prepare('SELECT * FROM work_orders ORDER BY id').all()).toEqual(before);
  const old = await fixture.app.inject({
    url: '/api/v1/work-orders?limit=2&offset=2',
    headers: bearer(worker),
  });
  expect(old.statusCode).toBe(200);
  expect(old.json()).toMatchObject({ limit: 2, offset: 2, total: 6 });
  expect(old.json().data).toHaveLength(2);
  expect(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM mutations').get()!.count).toBe(0);
});
