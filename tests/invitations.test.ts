import { afterEach, beforeEach, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { InvitationReceiptSchema, InvitationPageSchema } from '@fieldwork/contracts';
import { buildApp } from '../apps/api/src/app';
import { hashPassword, openStore, verifyPassword } from '../apps/api/src/store';
import { seed } from '../apps/api/src/seed';

let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const password = 'synthetic-worker-password';
const token = () => randomBytes(32).toString('base64url');
const email = () => `invite-${randomUUID()}@example.com`;
async function login(role: string) {
  return (
    await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { email: `${role}@fieldwork.local`, password: 'fieldwork-demo' },
    })
  ).json().token as string;
}
async function issue(address = email()) {
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations',
    headers: bearer(manager),
    payload: { name: 'Synthetic invited worker', email: address },
  });
  expect(response.statusCode).toBe(201);
  expect(response.headers['cache-control']).toBe('no-store');
  return InvitationReceiptSchema.parse(response.json());
}
const preview = (value: string) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations/preview',
    payload: { token: value },
  });
const accept = (value: string, chosen = password) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations/accept',
    payload: { token: value, password: chosen },
  });
const list = (query = '', session = manager) =>
  fixture.app.inject({ url: `/api/v1/invitations${query}`, headers: bearer(session) });
const revoke = (id: string, session = manager) =>
  fixture.app.inject({
    method: 'DELETE',
    url: `/api/v1/invitations/${id}`,
    headers: bearer(session),
  });
const accountRows = () =>
  [
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
  ].map((table) => fixture.store.db.prepare(`SELECT * FROM ${table}`).all());
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
});
afterEach(async () => {
  await fixture.app.close();
});

it('requires a current manager for creation, listing and revocation before input validation', async () => {
  const created = await issue();
  for (const request of [
    { method: 'POST' as const, url: '/api/v1/invitations', payload: {} },
    { method: 'GET' as const, url: '/api/v1/invitations?limit=invalid' },
    { method: 'DELETE' as const, url: '/api/v1/invitations/invalid' },
  ]) {
    expect((await fixture.app.inject(request)).statusCode).toBe(401);
    expect((await fixture.app.inject({ ...request, headers: bearer(worker) })).statusCode).toBe(
      403,
    );
  }
  fixture.store.db.prepare("UPDATE users SET role='worker' WHERE id='manager'").run();
  expect((await list()).statusCode).toBe(403);
  expect((await revoke(created.invitation.id)).statusCode).toBe(403);
  expect((await accept(created.token)).statusCode).toBe(410);
});
it('enforces cookie-origin checks on manager writes while public acceptance leaves existing sessions unchanged', async () => {
  const created = await issue();
  for (const origin of [undefined, 'https://untrusted.example']) {
    const headers = { cookie: `session=${manager}`, ...(origin ? { origin } : {}) };
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/invitations',
          headers,
          payload: { name: 'Synthetic person', email: email() },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: 'DELETE',
          url: `/api/v1/invitations/${created.invitation.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(403);
  }
  const sessions = fixture.store.db.prepare('SELECT * FROM sessions').all();
  const accepted = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations/accept',
    headers: { cookie: `session=${manager}`, origin: 'http://localhost:5173' },
    payload: { token: created.token, password },
  });
  expect(accepted.statusCode).toBe(200);
  expect(accepted.headers['set-cookie']).toBeUndefined();
  expect(fixture.store.db.prepare('SELECT * FROM sessions').all()).toEqual(sessions);
});
it('issues a 72-hour token once, stores only its hash, and exposes no token in previews or manager lists', async () => {
  const before = accountRows();
  const created = await issue('UPPERCASE-INVITE@example.com');
  expect(created.invitation).toMatchObject({
    email: 'uppercase-invite@example.com',
    status: 'pending',
    createdBy: { id: 'manager' },
    acceptedAt: null,
    acceptedUserId: null,
    revokedAt: null,
  });
  expect(Date.parse(created.invitation.expiresAt) - Date.parse(created.invitation.createdAt)).toBe(
    72 * 60 * 60 * 1000,
  );
  const row = fixture.store.db
    .prepare('SELECT * FROM invitations WHERE id=?')
    .get(created.invitation.id)!;
  expect(row.token_hash).toBe(createHash('sha256').update(created.token).digest('hex'));
  expect(JSON.stringify(row)).not.toContain(created.token);
  expect(accountRows()).toEqual(before);
  const read = await preview(created.token);
  expect(read.statusCode).toBe(200);
  expect(read.headers['cache-control']).toBe('no-store');
  expect(read.json()).toEqual({
    name: created.invitation.name,
    email: created.invitation.email,
    expiresAt: created.invitation.expiresAt,
  });
  const page = await list();
  expect(page.headers['cache-control']).toBe('no-store');
  expect(InvitationPageSchema.parse(page.json()).data).toEqual([created.invitation]);
  expect(page.body).not.toContain(created.token);
  expect(page.body).not.toContain(String(row.token_hash));
});
it.each([
  {},
  { name: '', email: 'worker@example.com' },
  { name: 'Worker', email: 'invalid' },
  { name: 'Worker', email: 'worker@example.com', role: 'manager' },
  { name: 'Worker', email: 'worker@example.com', token: 'chosen-token' },
])('rejects malformed invitation creation %j without creating records', async (payload) => {
  const before = accountRows();
  expect(
    (
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/invitations',
        headers: bearer(manager),
        payload,
      })
    ).statusCode,
  ).toBe(422);
  expect(fixture.store.db.prepare('SELECT COUNT(*) AS n FROM invitations').get()!.n).toBe(0);
  expect(accountRows()).toEqual(before);
});
it('rejects existing accounts and competing active invitations without replacing an issued link', async () => {
  const payload = { name: 'Synthetic person', email: 'WORKER@fieldwork.local' };
  const exists = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations',
    headers: bearer(manager),
    payload,
  });
  expect(exists.statusCode).toBe(409);
  expect(exists.json().error.code).toBe('ACCOUNT_EXISTS');
  const address = email();
  const responses = await Promise.all(
    [1, 2].map(() =>
      fixture.app.inject({
        method: 'POST',
        url: '/api/v1/invitations',
        headers: bearer(manager),
        payload: { name: 'Synthetic person', email: address },
      }),
    ),
  );
  expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
  expect(
    (await preview(responses.find((response) => response.statusCode === 201)!.json().token))
      .statusCode,
  ).toBe(200);
  expect(fixture.store.db.prepare('SELECT COUNT(*) AS n FROM invitations').get()!.n).toBe(1);
});
it('activates exactly one worker, hashes the chosen password, and requires normal sign-in', async () => {
  const created = await issue();
  const before = fixture.store.db.prepare('SELECT * FROM sessions').all();
  const response = await accept(created.token);
  expect(response.statusCode).toBe(200);
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.json()).toMatchObject({
    user: { name: created.invitation.name, email: created.invitation.email, role: 'worker' },
  });
  expect(response.json().token).toBeUndefined();
  const row = fixture.store.db
    .prepare('SELECT * FROM users WHERE id=?')
    .get(response.json().user.id)!;
  expect(row.password).not.toBe(password);
  expect(verifyPassword(password, String(row.password))).toBe(true);
  expect(response.body).not.toContain(String(row.password));
  expect(fixture.store.db.prepare('SELECT * FROM sessions').all()).toEqual(before);
  const signedIn = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    payload: { email: created.invitation.email.toUpperCase(), password },
  });
  expect(signedIn.statusCode).toBe(200);
  expect(signedIn.json().user.role).toBe('worker');
  expect(
    (
      await fixture.app.inject({
        url: '/api/v1/invitations',
        headers: bearer(signedIn.json().token),
      })
    ).statusCode,
  ).toBe(403);
  expect((await preview(created.token)).statusCode).toBe(410);
  expect((await accept(created.token)).statusCode).toBe(410);
  const listed = (await list()).json().data[0];
  expect(listed).toMatchObject({ status: 'accepted', acceptedUserId: row.id });
  expect(listed.acceptedAt).not.toBeNull();
  expect((await revoke(created.invitation.id)).statusCode).toBe(409);
});
it('keeps acceptance and revocation mutually exclusive when they race', async () => {
  const created = await issue();
  const results = await Promise.all([accept(created.token), revoke(created.invitation.id)]);
  expect(results.filter((result) => result.statusCode === 200)).toHaveLength(1);
  const row = fixture.store.db
    .prepare('SELECT accepted_at,revoked_at FROM invitations WHERE id=?')
    .get(created.invitation.id)!;
  expect(Boolean(row.accepted_at)).not.toBe(Boolean(row.revoked_at));
  expect(
    fixture.store.db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE email=?')
      .get(created.invitation.email)!.n,
  ).toBe(row.accepted_at ? 1 : 0);
  expect((await preview(created.token)).statusCode).toBe(410);
});
it.each(['preview', 'accept'])(
  'bounds the public %s payload before account changes',
  async (endpoint) => {
    const before = accountRows();
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/invitations/${endpoint}`,
          payload: { token: token(), password: 'x'.repeat(5000) },
        })
      ).statusCode,
    ).toBe(413);
    expect(accountRows()).toEqual(before);
  },
);
it('allows only one concurrent acceptance and cannot use a token to change an existing account', async () => {
  const created = await issue();
  const results = await Promise.all([
    accept(created.token),
    accept(created.token, 'different-synthetic-password'),
  ]);
  expect(results.map((response) => response.statusCode).sort()).toEqual([200, 410]);
  expect(
    fixture.store.db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE email=?')
      .get(created.invitation.email)!.n,
  ).toBe(1);
  const conflicting = await issue();
  fixture.store.db
    .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
    .run(
      randomUUID(),
      conflicting.invitation.email,
      'Existing synthetic worker',
      'worker',
      hashPassword('existing-synthetic-password'),
    );
  const before = accountRows();
  expect((await accept(conflicting.token)).statusCode).toBe(410);
  expect(accountRows()).toEqual(before);
});
it('revokes idempotently and issues a distinct link for a new invitation', async () => {
  const created = await issue();
  const revoked = await revoke(created.invitation.id);
  expect(revoked.statusCode).toBe(200);
  expect(revoked.json().status).toBe('revoked');
  expect((await revoke(created.invitation.id)).json()).toEqual(revoked.json());
  expect((await preview(created.token)).statusCode).toBe(410);
  expect((await accept(created.token)).statusCode).toBe(410);
  const replacement = await issue(created.invitation.email);
  expect(replacement.token).not.toBe(created.token);
  expect((await accept(replacement.token)).statusCode).toBe(200);
  expect((await revoke(randomUUID())).statusCode).toBe(404);
});
it('treats unknown, expired, revoked, and used links consistently and allows renewal after expiry', async () => {
  const unknown = await preview(token());
  expect(unknown.statusCode).toBe(410);
  const expired = await issue();
  fixture.store.db
    .prepare('UPDATE invitations SET expires=? WHERE id=?')
    .run(Date.now() - 1, expired.invitation.id);
  const revoked = await issue();
  await revoke(revoked.invitation.id);
  const used = await issue();
  await accept(used.token);
  for (const value of [expired.token, revoked.token, used.token, token()]) {
    const response = await preview(value);
    expect(response.statusCode).toBe(410);
    expect(response.json()).toEqual(unknown.json());
    expect((await accept(value)).statusCode).toBe(410);
  }
  expect(
    (await list()).json().data.find((row: { id: string }) => row.id === expired.invitation.id)
      .status,
  ).toBe('expired');
  expect((await issue(expired.invitation.email)).invitation.status).toBe('pending');
});
it.each([
  { token: 'invalid', password },
  { token: token(), password: 'short' },
  { token: token(), password: password.repeat(20) },
  { token: token(), password, role: 'manager' },
  { token: token(), password, email: 'changed@example.com' },
])('rejects malformed acceptance %j without creating users', async (payload) => {
  const before = accountRows();
  expect(
    (await fixture.app.inject({ method: 'POST', url: '/api/v1/invitations/accept', payload }))
      .statusCode,
  ).toBe(422);
  expect(accountRows()).toEqual(before);
});
it('rolls back failed creation and revocation without changing account data', async () => {
  const before = accountRows();
  fixture.store.db.exec(
    "CREATE TRIGGER fail_invite BEFORE INSERT ON invitations BEGIN SELECT RAISE(ABORT,'synthetic create failure'); END",
  );
  const failed = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/invitations',
    headers: bearer(manager),
    payload: { name: 'Synthetic worker', email: email() },
  });
  expect(failed.statusCode).toBe(500);
  expect(fixture.store.db.prepare('SELECT COUNT(*) AS n FROM invitations').get()!.n).toBe(0);
  fixture.store.db.exec('DROP TRIGGER fail_invite');
  const created = await issue();
  fixture.store.db.exec(
    "CREATE TRIGGER fail_revoke BEFORE UPDATE ON invitations BEGIN SELECT RAISE(ABORT,'synthetic revoke failure'); END",
  );
  expect((await revoke(created.invitation.id)).statusCode).toBe(500);
  expect((await preview(created.token)).statusCode).toBe(200);
  expect(accountRows()).toEqual(before);
  fixture.store.db.exec('DROP TRIGGER fail_revoke');
  expect((await revoke(created.invitation.id)).statusCode).toBe(200);
});
it.each([{}, { token: 'invalid' }, { token: token(), role: 'manager' }])(
  'validates public preview input %j',
  async (payload) => {
    expect(
      (await fixture.app.inject({ method: 'POST', url: '/api/v1/invitations/preview', payload }))
        .statusCode,
    ).toBe(422);
  },
);
it('rate-limits both public token endpoints', async () => {
  await fixture.app.close();
  fixture = await buildApp({ databasePath: ':memory:' });
  seed(fixture.store);
  for (let index = 0; index < 30; index++) expect((await preview(token())).statusCode).toBe(410);
  const limited = await preview(token());
  expect(limited.statusCode).toBe(429);
  expect(limited.headers['cache-control']).toBe('no-store');
  for (let index = 0; index < 10; index++) expect((await accept(token())).statusCode).toBe(410);
  expect((await accept(token())).statusCode).toBe(429);
});
it('rolls back acceptance after a failed token-consumption write and keeps the link usable', async () => {
  const created = await issue();
  const before = accountRows();
  fixture.store.db.exec(
    "CREATE TRIGGER fail_accept BEFORE UPDATE ON invitations BEGIN SELECT RAISE(ABORT,'synthetic acceptance failure'); END",
  );
  expect((await accept(created.token)).statusCode).toBe(500);
  expect(accountRows()).toEqual(before);
  expect((await preview(created.token)).statusCode).toBe(200);
  fixture.store.db.exec('DROP TRIGGER fail_accept');
  expect((await accept(created.token)).statusCode).toBe(200);
});
it('pages tied creation timestamps without exposing token material or losing rows after a new arrival', async () => {
  const receipts = [];
  for (let index = 0; index < 6; index++) receipts.push(await issue());
  fixture.store.db.prepare('UPDATE invitations SET created_at=?').run('2026-10-23T00:00:00Z');
  const first = InvitationPageSchema.parse((await list('?limit=2')).json());
  const newest = await issue();
  const second = InvitationPageSchema.parse(
    (await list(`?limit=2&cursor=${first.nextCursor}`)).json(),
  );
  const third = InvitationPageSchema.parse(
    (await list(`?limit=2&cursor=${second.nextCursor}`)).json(),
  );
  expect([...first.data, ...second.data, ...third.data].map((row) => row.id).sort()).toEqual(
    receipts.map((row) => row.invitation.id).sort(),
  );
  expect(third.nextCursor).toBeNull();
  expect((await list()).json().data[0].id).toBe(newest.invitation.id);
  for (const query of [
    '?limit=0',
    '?limit=51',
    '?limit=not-a-number',
    '?cursor=invalid',
    `?cursor=${randomUUID()}`,
    '?unexpected=true',
  ])
    expect((await list(query)).statusCode).toBe(422);
});
it('persists links across restart and upgrades schema 3 without altering existing workspace records', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fieldwork-invitations-'));
  const path = join(directory, 'upgrade.sqlite');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  const before = accountRows();
  fixture.store.db.exec('DROP TABLE invitations; DELETE FROM migrations WHERE version=4');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  expect(accountRows()).toEqual(before);
  expect(
    fixture.store.db
      .prepare('SELECT version FROM migrations ORDER BY version')
      .all()
      .map((row) => row.version),
  ).toEqual([1, 2, 3, 4]);
  const created = await issue();
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  try {
    expect((await accept(created.token)).statusCode).toBe(200);
  } finally {
    await fixture.app.close();
    rmSync(directory, { recursive: true, force: true });
    fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  }
});
it('rolls back schema 4 if an index creation fails, then completes a clean retry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fieldwork-invitation-migration-'));
  const path = join(directory, 'migration.sqlite');
  const original = openStore(path);
  seed(original);
  const before = original.db.prepare('SELECT * FROM users').all();
  original.db.exec(
    'DROP TABLE invitations; DELETE FROM migrations WHERE version=4; CREATE INDEX invitations_email ON users(email)',
  );
  original.db.close();
  try {
    expect(() => openStore(path)).toThrow();
    const failed = new DatabaseSync(path);
    expect(failed.prepare('SELECT version FROM migrations WHERE version=4').get()).toBeUndefined();
    expect(
      failed
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invitations'")
        .get(),
    ).toBeUndefined();
    expect(failed.prepare('SELECT * FROM users').all()).toEqual(before);
    failed.exec('DROP INDEX invitations_email');
    failed.close();
    const reopened = openStore(path);
    expect(reopened.db.prepare('SELECT version FROM migrations WHERE version=4').get()).toEqual({
      version: 4,
    });
    expect(reopened.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    reopened.db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
