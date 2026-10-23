import { afterEach, beforeEach, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorkerAccountSchema, WorkerPageSchema } from '@fieldwork/contracts';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import { openStore, hashPassword } from '../apps/api/src/store';

let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const signin = (email = 'worker@fieldwork.local', password = 'fieldwork-demo') =>
  fixture.app.inject({ method: 'POST', url: '/api/v1/sessions', payload: { email, password } });
const read = (id = 'worker', token = manager) =>
  fixture.app.inject({ url: `/api/v1/workers/${id}`, headers: bearer(token) });
const list = (query = '') =>
  fixture.app.inject({ url: `/api/v1/workers${query}`, headers: bearer(manager) });
const change = (enabled = false, expectedVersion = 0, id = 'worker', token = manager) =>
  fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/workers/${id}/access`,
    headers: bearer(token),
    payload: { enabled, expectedVersion },
  });
const me = (token: string, cookie = false) =>
  fixture.app.inject({
    url: '/api/v1/me',
    headers: cookie ? { cookie: `session=${token}` } : bearer(token),
  });
const workspace = () =>
  [
    'users',
    'catalog',
    'work_orders',
    'mutations',
    'photos',
    'audit',
    'report_revisions',
    'order_series',
    'order_series_members',
    'invitations',
  ].map((table) => fixture.store.db.prepare(`SELECT * FROM ${table}`).all());
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = (await signin('manager@fieldwork.local')).json().token;
  worker = (await signin()).json().token;
});
afterEach(async () => {
  await fixture.app.close();
});

it('defaults existing workers to active without changing their accounts or snapshots', async () => {
  const before = workspace();
  const response = await read();
  expect(response.headers['cache-control']).toBe('no-store');
  expect(WorkerAccountSchema.parse(response.json())).toMatchObject({
    user: { id: 'worker', role: 'worker' },
    enabled: true,
    version: 0,
    updatedAt: null,
    updatedBy: null,
  });
  const page = WorkerPageSchema.parse((await list()).json());
  expect(page.total).toBe(2);
  expect(page.data.every((row) => row.enabled)).toBe(true);
  expect(page.data.some((row) => row.user.role !== 'worker')).toBe(false);
  expect(response.body).not.toContain('password');
  expect(workspace()).toEqual(before);
});
it('requires a current manager before validating input or disclosing worker accounts', async () => {
  for (const request of [
    { url: '/api/v1/workers?limit=invalid' },
    { url: '/api/v1/workers/worker' },
    { method: 'PATCH' as const, url: '/api/v1/workers/worker/access', payload: {} },
  ]) {
    expect((await fixture.app.inject(request)).statusCode).toBe(401);
    expect((await fixture.app.inject({ ...request, headers: bearer(worker) })).statusCode).toBe(
      403,
    );
  }
  fixture.store.db.prepare("UPDATE users SET role='worker' WHERE id='manager'").run();
  expect((await read()).statusCode).toBe(403);
  expect((await change()).statusCode).toBe(403);
});
it.each(['manager', 'missing'])('cannot change or disclose non-worker target %s', async (id) => {
  expect((await read(id)).statusCode).toBe(404);
  expect((await change(false, 0, id)).statusCode).toBe(404);
  expect((await me(manager)).statusCode).toBe(200);
});
it('enforces cookie origin checks on worker access writes', async () => {
  for (const origin of [undefined, 'https://untrusted.example']) {
    expect(
      (
        await fixture.app.inject({
          method: 'PATCH',
          url: '/api/v1/workers/worker/access',
          headers: { cookie: `session=${manager}`, ...(origin ? { origin } : {}) },
          payload: { enabled: false, expectedVersion: 0 },
        })
      ).statusCode,
    ).toBe(403);
  }
  expect(
    (
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/workers/worker/access',
        headers: { cookie: `session=${manager}`, origin: 'http://localhost:5173' },
        payload: { enabled: false, expectedVersion: 0 },
      })
    ).statusCode,
  ).toBe(200);
});
it.each([
  {},
  { enabled: 'false', expectedVersion: 0 },
  { enabled: false, expectedVersion: -1 },
  { enabled: false, expectedVersion: 0.5 },
  { enabled: false, expectedVersion: 0, role: 'manager' },
  { enabled: false, expectedVersion: 0, userId: 'manager' },
])('rejects malformed access input %j without changing sessions', async (payload) => {
  const before = fixture.store.db.prepare('SELECT * FROM sessions').all();
  expect(
    (
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/workers/worker/access',
        headers: bearer(manager),
        payload,
      })
    ).statusCode,
  ).toBe(422);
  expect(fixture.store.db.prepare('SELECT * FROM sessions').all()).toEqual(before);
  expect((await read()).json().version).toBe(0);
});
it('revokes all target sessions, retains other sessions and requires a fresh sign-in after reactivation', async () => {
  const second = (await signin()).json().token;
  const other = (await signin('jordan@fieldwork.local')).json().token;
  const before = workspace();
  const disabled = await change();
  expect(disabled.statusCode).toBe(200);
  expect(disabled.json()).toMatchObject({
    enabled: false,
    version: 1,
    updatedBy: { id: 'manager' },
  });
  for (const token of [worker, second])
    for (const cookie of [true, false]) expect((await me(token, cookie)).statusCode).toBe(401);
  expect((await me(manager)).statusCode).toBe(200);
  expect((await me(other)).statusCode).toBe(200);
  expect((await signin()).statusCode).toBe(403);
  expect((await signin()).json().error.code).toBe('ACCOUNT_DISABLED');
  expect((await signin('worker@fieldwork.local', 'wrong')).statusCode).toBe(401);
  expect(workspace()).toEqual(before);
  const catalog = await fixture.app.inject({ url: '/api/v1/catalog', headers: bearer(manager) });
  expect(catalog.json().users.some((user: { id: string }) => user.id === 'worker')).toBe(false);
  expect((await list()).json().total).toBe(2);
  expect((await change(true, 1)).json()).toMatchObject({ enabled: true, version: 2 });
  expect((await me(worker)).statusCode).toBe(401);
  const fresh = await signin();
  expect(fresh.statusCode).toBe(200);
  expect(fresh.json().user.id).toBe('worker');
  expect((await me(fresh.json().token)).statusCode).toBe(200);
  expect(workspace()).toEqual(before);
  expect(
    fixture.store.db
      .prepare('SELECT worker_id,actor_id,enabled FROM worker_access_events ORDER BY sequence')
      .all(),
  ).toEqual([
    { worker_id: 'worker', actor_id: 'manager', enabled: 0 },
    { worker_id: 'worker', actor_id: 'manager', enabled: 1 },
  ]);
});
it('checks the current access flag even for a valid session inserted after deactivation', async () => {
  await change();
  const token = randomUUID();
  fixture.store.db
    .prepare('INSERT INTO sessions VALUES(?,?,?)')
    .run(createHash('sha256').update(token).digest('hex'), 'worker', Date.now() + 60000);
  expect((await me(token)).statusCode).toBe(401);
  expect(
    (
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/demo-1/reports',
        headers: bearer(token),
        payload: {},
      })
    ).statusCode,
  ).toBe(401);
});

it('defaults newly accepted workers to active and prevents invitations from replacing disabled accounts', async () => {
  const invite = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations',
    headers: bearer(manager),
    payload: { name: 'Synthetic new worker', email: 'new-access@example.com' },
  });
  const accepted = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations/accept',
    payload: { token: invite.json().token, password: 'synthetic-new-worker-password' },
  });
  expect(accepted.statusCode).toBe(200);
  const id = accepted.json().user.id;
  expect((await read(id)).json()).toMatchObject({ enabled: true, version: 0 });
  expect((await signin('new-access@example.com', 'synthetic-new-worker-password')).statusCode).toBe(
    200,
  );
  await change(false, 0, id);
  const duplicate = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations',
    headers: bearer(manager),
    payload: { name: 'Replacement', email: 'new-access@example.com' },
  });
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json().error.code).toBe('ACCOUNT_EXISTS');
});

it('requires restored access before acknowledging an existing report receipt and never duplicates its revision', async () => {
  const order = fixture.store.getOrder('demo-1')!;
  const payload = {
    mutationId: randomUUID(),
    baseVersion: order.version,
    summary: 'Synthetic retained inspection',
    answers: order.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
    photos: [],
  };
  const submit = (token: string) =>
    fixture.app.inject({
      method: 'POST',
      url: '/api/v1/work-orders/demo-1/reports',
      headers: bearer(token),
      payload,
    });
  const acknowledged = await submit(worker);
  expect(acknowledged.statusCode).toBe(200);
  const before = workspace();
  await change();
  expect((await submit(worker)).statusCode).toBe(401);
  await change(true, 1);
  const fresh = (await signin()).json().token;
  expect((await submit(fresh)).json()).toEqual(acknowledged.json());
  expect(workspace()).toEqual(before);
  expect(
    fixture.store.db.prepare('SELECT * FROM report_revisions WHERE order_id=?').all('demo-1'),
  ).toHaveLength(1);
});
it('detects stale and competing changes and makes confirmed no-ops free of writes', async () => {
  const sessions = fixture.store.db.prepare('SELECT * FROM sessions').all();
  expect((await change(true)).json().version).toBe(0);
  expect(fixture.store.db.prepare('SELECT * FROM sessions').all()).toEqual(sessions);
  expect(fixture.store.db.prepare('SELECT * FROM worker_access_events').all()).toEqual([]);
  const results = await Promise.all([change(), change()]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  const current = (await read()).json();
  expect((await change(false, 1)).json()).toEqual(current);
  const stale = await change(true, 0);
  expect(stale.statusCode).toBe(409);
  expect(stale.json().error.code).toBe('ACCOUNT_CHANGED');
  expect(fixture.store.db.prepare('SELECT * FROM worker_access_events').all()).toHaveLength(1);
});
it.each(['worker_access', 'sessions', 'worker_access_events'])(
  'rolls back access, session revocation and audit if %s fails',
  async (table) => {
    const sessions = fixture.store.db.prepare('SELECT * FROM sessions').all();
    fixture.store.db.exec(
      `CREATE TRIGGER fail_access BEFORE ${table === 'sessions' ? 'DELETE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`,
    );
    expect((await change()).statusCode).toBe(500);
    expect((await read()).json()).toMatchObject({ enabled: true, version: 0 });
    expect(fixture.store.db.prepare('SELECT * FROM sessions').all()).toEqual(sessions);
    expect(fixture.store.db.prepare('SELECT * FROM worker_access_events').all()).toEqual([]);
    fixture.store.db.exec('DROP TRIGGER fail_access');
    expect((await change()).statusCode).toBe(200);
  },
);
it('rejects fresh assignments to disabled workers while retaining old series receipts and handover access', async () => {
  const payload = {
    title: 'Synthetic account access inspection',
    instructions: '',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: 'routine',
    dueDate: '2026-10-30',
    priority: 'routine',
  };
  const series = { ...payload, mutationId: randomUUID(), frequency: 'daily', occurrences: 2 };
  const create = (url: string, input: unknown) =>
    fixture.app.inject({ method: 'POST', url, headers: bearer(manager), payload: input as object });
  const original = await create('/api/v1/work-order-series', series);
  expect(original.statusCode).toBe(201);
  const before = workspace();
  await change();
  expect((await create('/api/v1/work-orders', payload)).statusCode).toBe(422);
  expect(
    (await create('/api/v1/work-order-series', { ...series, mutationId: randomUUID() })).statusCode,
  ).toBe(422);
  expect((await create('/api/v1/work-order-series', series)).json()).toEqual(original.json());
  expect(workspace()).toEqual(before);
  const reassign = (id: string, assigneeId: string) =>
    fixture.app.inject({
      method: 'PATCH',
      url: `/api/v1/work-orders/${id}/assignee`,
      headers: bearer(manager),
      payload: { baseVersion: 1, assigneeId },
    });
  expect((await reassign('demo-1', 'worker')).statusCode).toBe(422);
  expect((await reassign('demo-1', 'worker-2')).statusCode).toBe(200);
  expect(fixture.store.getOrder('demo-1')!.assignee.id).toBe('worker-2');
});
it('paginates tied names, retains disabled accounts and validates cursors', async () => {
  for (let index = 0; index < 5; index++)
    fixture.store.db
      .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
      .run(
        `same-${index}`,
        `same-${index}@example.com`,
        'Synthetic same name',
        'worker',
        hashPassword('synthetic-password'),
      );
  await change();
  let cursor: string | null = null;
  const ids: string[] = [];
  do {
    const page = WorkerPageSchema.parse(
      (await list(`?limit=2${cursor ? `&cursor=${cursor}` : ''}`)).json(),
    );
    ids.push(...page.data.map((row) => row.user.id));
    cursor = page.nextCursor;
  } while (cursor);
  expect(ids).toHaveLength(7);
  expect(new Set(ids).size).toBe(7);
  expect(ids).toContain('worker');
  for (const query of [
    '?limit=0',
    '?limit=51',
    '?cursor=',
    '?cursor=missing',
    '?cursor=manager',
    '?unexpected=true',
  ])
    expect((await list(query)).statusCode).toBe(422);
});
it('upgrades schema 4 without changing existing records and persists access, sessions and events through restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fieldwork-worker-access-'));
  const path = join(dir, 'upgrade.sqlite');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  seed(fixture.store);
  manager = (await signin('manager@fieldwork.local')).json().token;
  const before = workspace();
  fixture.store.db.exec(
    'DROP TABLE password_resets; DROP TABLE worker_access_events; DROP TABLE worker_access; DELETE FROM migrations WHERE version>=5',
  );
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  expect(workspace()).toEqual(before);
  expect((await read()).json().enabled).toBe(true);
  expect(
    fixture.store.db
      .prepare('SELECT version FROM migrations ORDER BY version')
      .all()
      .map((r) => r.version),
  ).toEqual([1, 2, 3, 4, 5, 6]);
  await change();
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  try {
    expect((await read()).json()).toMatchObject({ enabled: false, version: 1 });
    expect((await signin()).statusCode).toBe(403);
    expect(fixture.store.db.prepare('SELECT * FROM worker_access_events').all()).toHaveLength(1);
    expect(workspace()).toEqual(before);
  } finally {
    await fixture.app.close();
    rmSync(dir, { recursive: true, force: true });
    fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  }
});
it('rolls back a failed schema 5 and safely retries without touching accounts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fieldwork-access-migration-'));
  const path = join(dir, 'migration.sqlite');
  const original = openStore(path);
  seed(original);
  const before = original.db.prepare('SELECT * FROM users').all();
  original.db.exec(
    'DROP TABLE password_resets; DROP TABLE worker_access_events; DROP TABLE worker_access; DELETE FROM migrations WHERE version>=5; CREATE INDEX worker_access_events_worker ON users(email)',
  );
  original.db.close();
  try {
    expect(() => openStore(path)).toThrow();
    const failed = new DatabaseSync(path);
    expect(failed.prepare('SELECT version FROM migrations WHERE version=5').get()).toBeUndefined();
    expect(
      failed
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('worker_access','worker_access_events')",
        )
        .all(),
    ).toEqual([]);
    expect(failed.prepare('SELECT * FROM users').all()).toEqual(before);
    failed.exec('DROP INDEX worker_access_events_worker');
    failed.close();
    const reopened = openStore(path);
    expect(reopened.workerEnabled('worker')).toBe(true);
    expect(reopened.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    reopened.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
