import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkerAccessHistoryPageSchema } from '@fieldwork/contracts';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const read = (id = 'worker', query = '', token = manager) =>
  fixture.app.inject({
    url: `/api/v1/workers/${id}/access-history${query}`,
    headers: bearer(token),
  });
const change = (enabled: boolean, expectedVersion: number, id = 'worker') =>
  fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/workers/${id}/access`,
    headers: bearer(manager),
    payload: { enabled, expectedVersion },
  });
async function login(email: string) {
  return (
    await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { email: `${email}@fieldwork.local`, password: 'fieldwork-demo' },
    })
  ).json().token as string;
}
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
});
afterEach(async () => {
  await fixture.app.close();
});
it('requires a current manager before lookup or query validation', async () => {
  const url = '/api/v1/workers/missing/access-history?limit=invalid';
  expect((await fixture.app.inject(url)).statusCode).toBe(401);
  expect((await fixture.app.inject({ url, headers: bearer(worker) })).statusCode).toBe(403);
  fixture.store.db.prepare("UPDATE users SET role='worker' WHERE id='manager'").run();
  expect((await read()).statusCode).toBe(403);
});
it('returns an honest empty page and protects non-worker targets', async () => {
  const response = await read();
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(WorkerAccessHistoryPageSchema.parse(response.json())).toEqual({
    data: [],
    total: 0,
    nextCursor: null,
  });
  expect((await read('manager')).statusCode).toBe(404);
  expect((await read('missing')).statusCode).toBe(404);
});
it('shows only committed access changes in newest-first order with actor identity and no credentials', async () => {
  await change(true, 0);
  await change(false, 0);
  await change(false, 1);
  await change(true, 1);
  await change(false, 0, 'worker-2');
  const before = ['users', 'sessions', 'work_orders', 'worker_access', 'worker_access_events'].map(
    (table) => fixture.store.db.prepare(`SELECT * FROM ${table}`).all(),
  );
  const response = await read();
  const page = WorkerAccessHistoryPageSchema.parse(response.json());
  expect(page.total).toBe(2);
  expect(page.data.map((event) => event.enabled)).toEqual([true, false]);
  expect(
    page.data.every((event) => event.workerId === 'worker' && event.actor.id === 'manager'),
  ).toBe(true);
  expect(page.data[0].id).toBeGreaterThan(page.data[1].id);
  expect(page.nextCursor).toBeNull();
  expect(response.body).not.toMatch(/password|token_hash|session|fieldwork-demo/);
  expect(
    ['users', 'sessions', 'work_orders', 'worker_access', 'worker_access_events'].map((table) =>
      fixture.store.db.prepare(`SELECT * FROM ${table}`).all(),
    ),
  ).toEqual(before);
  fixture.store.db
    .prepare("UPDATE users SET name='Renamed synthetic manager' WHERE id='manager'")
    .run();
  expect((await read()).json().data[0].actor.name).toBe('Renamed synthetic manager');
});
it('pages tied timestamps without duplicates when newer events arrive and scopes cursors to the target worker', async () => {
  for (let version = 0; version < 6; version++)
    expect((await change(version % 2 === 1, version)).statusCode).toBe(200);
  fixture.store.db.prepare('UPDATE worker_access_events SET at=?').run('2026-10-23T00:00:00Z');
  const original = WorkerAccessHistoryPageSchema.parse((await read()).json());
  const first = WorkerAccessHistoryPageSchema.parse((await read('worker', '?limit=2')).json());
  await change(false, 6);
  const second = WorkerAccessHistoryPageSchema.parse(
    (await read('worker', `?limit=2&cursor=${first.nextCursor}`)).json(),
  );
  const third = WorkerAccessHistoryPageSchema.parse(
    (await read('worker', `?limit=2&cursor=${second.nextCursor}`)).json(),
  );
  expect([...first.data, ...second.data, ...third.data]).toEqual(original.data);
  expect(third.nextCursor).toBeNull();
  expect((await read()).json().total).toBe(7);
  await change(false, 0, 'worker-2');
  const foreign = (await read('worker-2')).json().data[0].id;
  const rejected = await read('worker', `?cursor=${foreign}`);
  expect(rejected.statusCode).toBe(422);
  expect(rejected.json().error.code).toBe('CURSOR');
});
it.each([
  '?limit=0',
  '?limit=51',
  '?limit=invalid',
  '?cursor=0',
  '?cursor=-1',
  '?cursor=1.5',
  '?cursor=invalid',
  '?cursor=999999',
  '?cursor=9007199254740992',
  '?unexpected=true',
])('rejects malformed or unavailable history query %s', async (query) => {
  expect((await read('worker', query)).statusCode).toBe(422);
});
it('retains the event stream through restart without a new schema migration', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fieldwork-access-history-'));
  const path = join(dir, 'history.sqlite');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  await change(false, 0);
  await change(true, 1);
  const before = (await read()).json();
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  try {
    expect((await read()).json()).toEqual(before);
    expect(
      fixture.store.db
        .prepare('SELECT version FROM migrations ORDER BY version')
        .all()
        .map((row) => row.version),
    ).toEqual([1, 2, 3, 4, 5]);
  } finally {
    await fixture.app.close();
    rmSync(dir, { recursive: true, force: true });
    fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  }
});
