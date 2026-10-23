import { afterEach, beforeEach, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { PasswordResetReceiptSchema, PasswordResetCurrentSchema } from '@fieldwork/contracts';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import { openStore, verifyPassword } from '../apps/api/src/store';
let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
const chosen = 'synthetic-recovered-worker-password';
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const unknown = () => randomBytes(32).toString('base64url');
const signin = (email = 'worker@fieldwork.local', password = 'fieldwork-demo') =>
  fixture.app.inject({ method: 'POST', url: '/api/v1/sessions', payload: { email, password } });
const metadata = (id = 'worker') =>
  fixture.app.inject({ url: `/api/v1/workers/${id}/password-reset`, headers: bearer(manager) });
const create = (expectedAccessVersion = 0, id = 'worker') =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/workers/${id}/password-reset`,
    headers: bearer(manager),
    payload: { expectedAccessVersion },
  });
async function issue(expected = 0) {
  const response = await create(expected);
  expect(response.statusCode).toBe(201);
  return PasswordResetReceiptSchema.parse(response.json());
}
const preview = (token: string) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/password-resets/preview',
    payload: { token },
  });
const complete = (token: string, password = chosen) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/password-resets/complete',
    payload: { token, password },
  });
const revoke = (id: string, workerId = 'worker') =>
  fixture.app.inject({
    method: 'DELETE',
    url: `/api/v1/workers/${workerId}/password-reset/${id}`,
    headers: bearer(manager),
  });
const change = (enabled: boolean, expectedVersion: number) =>
  fixture.app.inject({
    method: 'PATCH',
    url: '/api/v1/workers/worker/access',
    headers: bearer(manager),
    payload: { enabled, expectedVersion },
  });
const inspections = () =>
  [
    'catalog',
    'work_orders',
    'mutations',
    'photos',
    'audit',
    'report_revisions',
    'order_series',
    'order_series_members',
    'worker_access',
    'worker_access_events',
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
it('requires a current manager before revealing targets or validating reset creation and revocation', async () => {
  for (const request of [
    { url: '/api/v1/workers/missing/password-reset' },
    { method: 'POST' as const, url: '/api/v1/workers/worker/password-reset', payload: {} },
    { method: 'DELETE' as const, url: '/api/v1/workers/worker/password-reset/invalid' },
  ]) {
    expect((await fixture.app.inject(request)).statusCode).toBe(401);
    expect((await fixture.app.inject({ ...request, headers: bearer(worker) })).statusCode).toBe(
      403,
    );
  }
  const receipt = await issue();
  fixture.store.db.prepare("UPDATE users SET role='worker' WHERE id='manager'").run();
  expect((await metadata()).statusCode).toBe(403);
  expect((await create()).statusCode).toBe(403);
  expect((await preview(receipt.token)).statusCode).toBe(410);
});
it('enforces cookie origins on manager writes and preserves an unrelated current session during public completion', async () => {
  const receipt = await issue();
  for (const origin of [undefined, 'https://untrusted.example']) {
    const headers = { cookie: `session=${manager}`, ...(origin ? { origin } : {}) };
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/workers/worker/password-reset',
          headers,
          payload: { expectedAccessVersion: 0 },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: 'DELETE',
          url: `/api/v1/workers/worker/password-reset/${receipt.reset.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(403);
  }
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/password-resets/complete',
    headers: { cookie: `session=${manager}`, origin: 'http://localhost:5173' },
    payload: { token: receipt.token, password: chosen },
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(
    (await fixture.app.inject({ url: '/api/v1/me', headers: bearer(manager) })).statusCode,
  ).toBe(200);
});
it.each(['manager', 'missing'])(
  'cannot issue or disclose password recovery for non-worker %s',
  async (id) => {
    expect((await create(0, id)).statusCode).toBe(404);
    expect((await metadata(id)).statusCode).toBe(404);
  },
);
it.each([
  {},
  { expectedAccessVersion: -1 },
  { expectedAccessVersion: 0.5 },
  { expectedAccessVersion: 0, role: 'manager' },
  { expectedAccessVersion: 0, password: chosen },
  { expectedAccessVersion: 0, token: unknown() },
])('rejects malformed reset creation %j', async (payload) => {
  expect(
    (
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/workers/worker/password-reset',
        headers: bearer(manager),
        payload,
      })
    ).statusCode,
  ).toBe(422);
  expect(fixture.store.db.prepare('SELECT * FROM password_resets').all()).toEqual([]);
});
it('stores only a hash for a one-hour link and returns no token in metadata or public previews', async () => {
  expect(PasswordResetCurrentSchema.parse((await metadata()).json()).reset).toBeNull();
  const before = inspections();
  const users = fixture.store.db.prepare('SELECT * FROM users').all();
  const sessions = fixture.store.db.prepare('SELECT * FROM sessions').all();
  const receipt = await issue();
  expect(Date.parse(receipt.reset.expiresAt) - Date.parse(receipt.reset.createdAt)).toBe(
    60 * 60 * 1000,
  );
  const row = fixture.store.db.prepare('SELECT * FROM password_resets').get()!;
  expect(row.token_hash).toBe(createHash('sha256').update(receipt.token).digest('hex'));
  expect(JSON.stringify(row)).not.toContain(receipt.token);
  const info = await metadata();
  expect(info.headers['cache-control']).toBe('no-store');
  expect(info.json()).toEqual({ reset: receipt.reset });
  expect(info.body).not.toContain(receipt.token);
  expect(info.body).not.toContain(String(row.token_hash));
  expect((await preview(receipt.token)).json()).toEqual({
    name: 'Sam Rivera',
    email: 'worker@fieldwork.local',
    expiresAt: receipt.reset.expiresAt,
  });
  expect(inspections()).toEqual(before);
  expect(fixture.store.db.prepare('SELECT * FROM users').all()).toEqual(users);
  expect(fixture.store.db.prepare('SELECT * FROM sessions').all()).toEqual(sessions);
});
it('changes only the worker password, revokes every target session and requires normal sign-in', async () => {
  const second = (await signin()).json().token;
  const other = (await signin('jordan@fieldwork.local')).json().token;
  const receipt = await issue();
  const before = inspections();
  const response = await complete(receipt.token);
  expect(response.statusCode).toBe(200);
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.json()).toEqual({ user: fixture.store.getUser('worker') });
  expect(response.json().token).toBeUndefined();
  const hash = String(
    fixture.store.db.prepare("SELECT password FROM users WHERE id='worker'").get()!.password,
  );
  expect(verifyPassword(chosen, hash)).toBe(true);
  expect(hash).not.toBe(chosen);
  for (const token of [worker, second])
    expect(
      (await fixture.app.inject({ url: '/api/v1/me', headers: bearer(token) })).statusCode,
    ).toBe(401);
  for (const token of [manager, other])
    expect(
      (await fixture.app.inject({ url: '/api/v1/me', headers: bearer(token) })).statusCode,
    ).toBe(200);
  expect((await signin()).statusCode).toBe(401);
  const login = await signin('worker@fieldwork.local', chosen);
  expect(login.statusCode).toBe(200);
  expect(login.json().user.id).toBe('worker');
  expect(inspections()).toEqual(before);
  expect((await metadata()).json().reset.status).toBe('used');
  expect((await preview(receipt.token)).statusCode).toBe(410);
  expect((await complete(receipt.token)).statusCode).toBe(410);
});
it('replaces earlier links without changing credentials or sessions until completion', async () => {
  const first = await issue();
  const sessions = fixture.store.db.prepare('SELECT * FROM sessions').all();
  const second = await issue();
  expect(second.token).not.toBe(first.token);
  expect((await preview(first.token)).statusCode).toBe(410);
  expect((await preview(second.token)).statusCode).toBe(200);
  expect((await metadata()).json().reset.id).toBe(second.reset.id);
  expect(fixture.store.db.prepare('SELECT * FROM sessions').all()).toEqual(sessions);
  const row = fixture.store.db
    .prepare('SELECT revoked_at FROM password_resets WHERE id=?')
    .get(first.reset.id)!;
  expect(row.revoked_at).not.toBeNull();
  expect((await complete(first.token)).statusCode).toBe(410);
  expect((await complete(second.token)).statusCode).toBe(200);
});
it('keeps only one usable link when managers issue concurrently and only one completion can change the password', async () => {
  const responses = await Promise.all([create(), create()]);
  expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
  const tokens = responses.map((r) => r.json().token as string);
  const states = await Promise.all(tokens.map(preview));
  expect(states.map((r) => r.statusCode).sort()).toEqual([200, 410]);
  const token = tokens[states.findIndex((r) => r.statusCode === 200)];
  const completed = await Promise.all([
    complete(token),
    complete(token, 'other-synthetic-password'),
  ]);
  expect(completed.map((r) => r.statusCode).sort()).toEqual([200, 410]);
  expect(
    fixture.store.db.prepare('SELECT * FROM password_resets WHERE used_at IS NOT NULL').all(),
  ).toHaveLength(1);
});
it('does not revive a reset link when a worker is disabled and later reactivated', async () => {
  const receipt = await issue();
  expect((await change(false, 0)).statusCode).toBe(200);
  expect((await create()).statusCode).toBe(409);
  expect((await create(1)).json().error.code).toBe('WORKER_DISABLED');
  expect((await preview(receipt.token)).statusCode).toBe(410);
  await change(true, 1);
  expect((await preview(receipt.token)).statusCode).toBe(410);
  expect((await complete(receipt.token)).statusCode).toBe(410);
  expect((await metadata()).json().reset.status).toBe('unavailable');
  const replacement = await issue(2);
  expect((await complete(replacement.token)).statusCode).toBe(200);
});
it('revokes idempotently, scopes revocation to its worker, and preserves a used link', async () => {
  const receipt = await issue();
  expect((await revoke(receipt.reset.id, 'worker-2')).statusCode).toBe(404);
  const revoked = await revoke(receipt.reset.id);
  expect(revoked.json().status).toBe('revoked');
  expect((await revoke(receipt.reset.id)).json()).toEqual(revoked.json());
  expect((await complete(receipt.token)).statusCode).toBe(410);
  const used = await issue();
  await complete(used.token);
  expect((await revoke(used.reset.id)).statusCode).toBe(409);
  expect((await revoke(randomUUID())).statusCode).toBe(404);
});
it('treats unknown, expired, replaced, revoked, used and unavailable links consistently', async () => {
  const expired = await issue();
  fixture.store.db.prepare('UPDATE password_resets SET expires=0 WHERE id=?').run(expired.reset.id);
  expect((await metadata()).json().reset.status).toBe('expired');
  const replaced = await issue();
  const revoked = await issue();
  await revoke(revoked.reset.id);
  const used = await issue();
  await complete(used.token);
  const disabled = await issue();
  await change(false, 0);
  const generic = await preview(unknown());
  for (const token of [
    expired.token,
    replaced.token,
    revoked.token,
    used.token,
    disabled.token,
    unknown(),
  ]) {
    expect((await preview(token)).json()).toEqual(generic.json());
    expect((await complete(token)).statusCode).toBe(410);
  }
});
it.each([
  { token: 'invalid', password: chosen },
  { token: unknown(), password: 'short' },
  { token: unknown(), password: 'x'.repeat(257) },
  { token: unknown(), password: chosen, role: 'manager' },
])('rejects malformed completion %j without account changes', async (payload) => {
  const before = fixture.store.db.prepare('SELECT * FROM users').all();
  expect(
    (await fixture.app.inject({ method: 'POST', url: '/api/v1/password-resets/complete', payload }))
      .statusCode,
  ).toBe(422);
  expect(fixture.store.db.prepare('SELECT * FROM users').all()).toEqual(before);
});
it.each(['preview', 'complete'])('bounds public %s input', async (endpoint) => {
  expect(
    (
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/password-resets/${endpoint}`,
        payload: { token: unknown(), password: 'x'.repeat(5000) },
      })
    ).statusCode,
  ).toBe(413);
});
it.each(['users', 'sessions', 'password_resets'])(
  'rolls back password, revocation and token consumption if %s fails',
  async (table) => {
    const receipt = await issue();
    const before = ['users', 'sessions', 'password_resets'].map((t) =>
      fixture.store.db.prepare(`SELECT * FROM ${t}`).all(),
    );
    fixture.store.db.exec(
      `CREATE TRIGGER fail_reset BEFORE ${table === 'sessions' ? 'DELETE' : 'UPDATE'} ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`,
    );
    expect((await complete(receipt.token)).statusCode).toBe(500);
    expect(
      ['users', 'sessions', 'password_resets'].map((t) =>
        fixture.store.db.prepare(`SELECT * FROM ${t}`).all(),
      ),
    ).toEqual(before);
    expect((await preview(receipt.token)).statusCode).toBe(200);
    fixture.store.db.exec('DROP TRIGGER fail_reset');
    expect((await complete(receipt.token)).statusCode).toBe(200);
  },
);
it('rolls back replacement revocation when creation fails and rolls back failed revocation', async () => {
  const receipt = await issue();
  fixture.store.db.exec(
    "CREATE TRIGGER fail_reset BEFORE INSERT ON password_resets BEGIN SELECT RAISE(ABORT,'synthetic insert failure'); END",
  );
  expect((await create()).statusCode).toBe(500);
  expect((await preview(receipt.token)).statusCode).toBe(200);
  fixture.store.db.exec('DROP TRIGGER fail_reset');
  fixture.store.db.exec(
    "CREATE TRIGGER fail_reset BEFORE UPDATE ON password_resets BEGIN SELECT RAISE(ABORT,'synthetic update failure'); END",
  );
  expect((await revoke(receipt.reset.id)).statusCode).toBe(500);
  expect((await preview(receipt.token)).statusCode).toBe(200);
});
it('keeps reset completion and revocation mutually exclusive when they race', async () => {
  const receipt = await issue();
  const results = await Promise.all([complete(receipt.token), revoke(receipt.reset.id)]);
  expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
  const row = fixture.store.db
    .prepare('SELECT used_at,revoked_at FROM password_resets WHERE id=?')
    .get(receipt.reset.id)!;
  expect(Boolean(row.used_at)).not.toBe(Boolean(row.revoked_at));
});

it('leaves the latest link usable when an older replaced link is revoked', async () => {
  const older = await issue();
  const newer = await issue();
  expect((await revoke(older.reset.id)).json().status).toBe('revoked');
  expect((await metadata()).json().reset.id).toBe(newer.reset.id);
  expect((await preview(newer.token)).statusCode).toBe(200);
});

it('never restores access when reset completion races with worker deactivation', async () => {
  const receipt = await issue();
  const [completed, disabled] = await Promise.all([complete(receipt.token), change(false, 0)]);
  expect(disabled.statusCode).toBe(200);
  expect([200, 410]).toContain(completed.statusCode);
  expect(
    (
      await signin(
        'worker@fieldwork.local',
        completed.statusCode === 200 ? chosen : 'fieldwork-demo',
      )
    ).statusCode,
  ).toBe(403);
  expect(fixture.store.workerEnabled('worker')).toBe(false);
  expect(fixture.store.db.prepare("SELECT * FROM sessions WHERE user_id='worker'").all()).toEqual(
    [],
  );
});
it('rate-limits both public reset endpoints and manager issuance', async () => {
  await fixture.app.close();
  fixture = await buildApp({ databasePath: ':memory:' });
  seed(fixture.store);
  manager = (await signin('manager@fieldwork.local')).json().token;
  for (let i = 0; i < 30; i++) expect((await preview(unknown())).statusCode).toBe(410);
  expect((await preview(unknown())).statusCode).toBe(429);
  for (let i = 0; i < 10; i++) expect((await complete(unknown())).statusCode).toBe(410);
  expect((await complete(unknown())).statusCode).toBe(429);
  for (let i = 0; i < 10; i++) expect((await create()).statusCode).toBe(201);
  expect((await create()).statusCode).toBe(429);
});
it('upgrades schema 5, preserves existing data and reopens a usable reset link', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fieldwork-password-reset-'));
  const path = join(dir, 'upgrade.sqlite');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  seed(fixture.store);
  manager = (await signin('manager@fieldwork.local')).json().token;
  const before = inspections();
  fixture.store.db.exec('DROP TABLE password_resets; DELETE FROM migrations WHERE version=6');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  expect(inspections()).toEqual(before);
  const receipt = await issue();
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  try {
    expect((await preview(receipt.token)).statusCode).toBe(200);
    expect((await complete(receipt.token)).statusCode).toBe(200);
    expect(inspections()).toEqual(before);
    expect(fixture.store.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    await fixture.app.close();
    rmSync(dir, { recursive: true, force: true });
    fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  }
});
it('rolls back failed schema 6 and safely retries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fieldwork-reset-migration-'));
  const path = join(dir, 'migration.sqlite');
  const original = openStore(path);
  seed(original);
  const before = original.db.prepare('SELECT * FROM users').all();
  original.db.exec(
    'DROP TABLE password_resets; DELETE FROM migrations WHERE version=6; CREATE INDEX password_resets_worker ON users(email)',
  );
  original.db.close();
  try {
    expect(() => openStore(path)).toThrow();
    const failed = new DatabaseSync(path);
    expect(failed.prepare('SELECT version FROM migrations WHERE version=6').get()).toBeUndefined();
    expect(
      failed
        .prepare("SELECT name FROM sqlite_master WHERE name='password_resets' AND type='table'")
        .get(),
    ).toBeUndefined();
    expect(failed.prepare('SELECT * FROM users').all()).toEqual(before);
    failed.exec('DROP INDEX password_resets_worker');
    failed.close();
    const reopened = openStore(path);
    expect(reopened.db.prepare('SELECT version FROM migrations WHERE version=6').get()).toEqual({
      version: 6,
    });
    reopened.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
