import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import type { Coordinates } from '@fieldwork/contracts';

let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
const point = { latitude: 51.5, longitude: -0.1 };
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
const update = (
  coordinates: Coordinates | null,
  expectedCoordinates: Coordinates | null = null,
  id = 'north',
  token = manager,
) =>
  fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/sites/${id}/location`,
    headers: bearer(token),
    payload: { coordinates, expectedCoordinates },
  });
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
});
afterEach(async () => {
  await fixture.app.close();
});

it('keeps site reads consistent with catalog visibility and restricts edits to managers', async () => {
  expect((await fixture.app.inject('/api/v1/sites/north')).statusCode).toBe(401);
  expect(
    (
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/sites/north/location',
        payload: {},
      })
    ).statusCode,
  ).toBe(401);
  expect((await update(point, null, 'north', worker)).statusCode).toBe(403);
  const read = await fixture.app.inject({ url: '/api/v1/sites/north', headers: bearer(worker) });
  expect(read.statusCode).toBe(200);
  expect(read.json().id).toBe('north');
  expect(
    (await fixture.app.inject({ url: '/api/v1/sites/missing', headers: bearer(manager) }))
      .statusCode,
  ).toBe(404);
  expect((await update(point, null, 'missing')).statusCode).toBe(404);
});

it('requires an allowed origin for cookie-authenticated coordinate changes', async () => {
  for (const origin of [undefined, 'https://untrusted.example']) {
    const result = await fixture.app.inject({
      method: 'PATCH',
      url: '/api/v1/sites/north/location',
      headers: { cookie: `session=${manager}`, ...(origin ? { origin } : {}) },
      payload: { coordinates: point, expectedCoordinates: null },
    });
    expect(result.statusCode).toBe(403);
  }
  expect(
    (
      await fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/sites/north/location',
        headers: { cookie: `session=${manager}`, origin: 'http://localhost:5173' },
        payload: { coordinates: point, expectedCoordinates: null },
      })
    ).statusCode,
  ).toBe(200);
});

it('adds, changes, and removes only the chosen catalog coordinates', async () => {
  const original = fixture.store.catalog();
  const saved = await update(point);
  expect(saved.statusCode).toBe(200);
  expect(saved.json()).toEqual({ ...original.sites[0], coordinates: point });
  const zero = { latitude: 0, longitude: 0 };
  expect((await update(zero, point)).json().coordinates).toEqual(zero);
  const cleared = await update(null, zero);
  expect(cleared.statusCode).toBe(200);
  expect(cleared.json()).toEqual(original.sites[0]);
  expect(fixture.store.catalog()).toEqual(original);
});

it('rejects a stale pair and concurrent competing writes without overwriting the winner', async () => {
  const proposed = [
    { latitude: 1, longitude: 2 },
    { latitude: 3, longitude: 4 },
  ];
  const results = await Promise.all(proposed.map((value) => update(value)));
  expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  const winner = results.find((result) => result.statusCode === 200)!.json();
  expect(fixture.store.catalog().sites[0]).toEqual(winner);
  expect((await update(point)).json().error.code).toBe('LOCATION_CONFLICT');
  const reordered = {
    longitude: winner.coordinates.longitude,
    latitude: winner.coordinates.latitude,
  };
  expect((await update(point, reordered)).statusCode).toBe(200);
});

it('requires reload after an uncertain save, then accepts a current no-op without writing', async () => {
  expect((await update(point)).statusCode).toBe(200);
  expect((await update(point)).statusCode).toBe(409);
  const current = (
    await fixture.app.inject({ url: '/api/v1/sites/north', headers: bearer(manager) })
  ).json();
  fixture.store.db.exec(
    "CREATE TRIGGER no_site_write BEFORE UPDATE ON catalog BEGIN SELECT RAISE(ABORT,'no-op must not write'); END",
  );
  expect((await update(point, current.coordinates)).statusCode).toBe(200);
});

it.each([
  {},
  { coordinates: point },
  { expectedCoordinates: null },
  { coordinates: { latitude: 91, longitude: 0 }, expectedCoordinates: null },
  { coordinates: { latitude: 0, longitude: -181 }, expectedCoordinates: null },
  { coordinates: { latitude: '0', longitude: 0 }, expectedCoordinates: null },
  { coordinates: { latitude: 0 }, expectedCoordinates: null },
  { coordinates: point, expectedCoordinates: {} },
  { coordinates: point, expectedCoordinates: { ...point, altitude: 1 } },
  { coordinates: point, expectedCoordinates: null, name: 'Unexpected rename' },
])('rejects malformed location patches %j without changing catalog data', async (payload) => {
  const original = fixture.store.catalog();
  const result = await fixture.app.inject({
    method: 'PATCH',
    url: '/api/v1/sites/north/location',
    headers: bearer(manager),
    payload,
  });
  expect(result.statusCode).toBe(422);
  expect(fixture.store.catalog()).toEqual(original);
});

it('rolls back catalog errors without touching assignments, reports, templates, or other sites', async () => {
  const tables = ['catalog', 'work_orders', 'report_revisions', 'photos', 'audit', 'mutations'];
  const before = tables.map((table) => fixture.store.db.prepare(`SELECT * FROM ${table}`).all());
  fixture.store.db.exec(
    "CREATE TRIGGER fail_location BEFORE UPDATE ON catalog BEGIN SELECT RAISE(ABORT,'test failure'); END",
  );
  expect((await update(point)).statusCode).toBe(500);
  expect(tables.map((table) => fixture.store.db.prepare(`SELECT * FROM ${table}`).all())).toEqual(
    before,
  );
  fixture.store.db.exec('DROP TRIGGER fail_location');
  expect((await update(point)).statusCode).toBe(200);
});

it('keeps existing inspection snapshots and versions fixed while new assignments use the edited point', async () => {
  const original = fixture.store.getOrder('demo-1')!;
  await update(point);
  const create = async () =>
    (
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/work-orders',
        headers: bearer(manager),
        payload: {
          title: 'Coordinate snapshot fixture',
          instructions: '',
          siteId: 'north',
          templateId: 'routine',
          assigneeId: 'worker',
          dueDate: '2026-12-28',
          priority: 'routine',
        },
      })
    ).json();
  const first = await create();
  await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/work-orders/${first.id}/reports`,
    headers: bearer(worker),
    payload: {
      mutationId: randomUUID(),
      baseVersion: 1,
      summary: 'Original point snapshot.',
      photos: [],
      answers: first.template.items.map((item: { id: string }) => ({
        itemId: item.id,
        value: 'pass',
        note: '',
      })),
    },
  });
  const submitted = fixture.store.getOrder(first.id);
  const history = fixture.store.reportHistory(first.id, 10);
  await update({ latitude: 1, longitude: 1 }, point);
  const second = await create();
  expect(second.site.coordinates).toEqual({ latitude: 1, longitude: 1 });
  expect(fixture.store.getOrder('demo-1')).toEqual(original);
  expect(fixture.store.getOrder(first.id)).toEqual(submitted);
  expect(fixture.store.reportHistory(first.id, 10)).toEqual(history);
  await update(null, { latitude: 1, longitude: 1 });
  expect((await create()).site).not.toHaveProperty('coordinates');
  expect(fixture.store.getOrder(second.id)!.site.coordinates).toEqual({
    latitude: 1,
    longitude: 1,
  });
});

it('persists location edits and clears across restart without a new migration', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fieldwork-site-edits-'));
  const path = join(directory, 'sites.sqlite');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  await update(point);
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  try {
    expect(fixture.store.catalog().sites[0].coordinates).toEqual(point);
    expect((await update(null, point)).statusCode).toBe(200);
    await fixture.app.close();
    fixture = await buildApp({ databasePath: path, rateLimits: false });
    expect(fixture.store.catalog().sites[0]).not.toHaveProperty('coordinates');
    expect(
      fixture.store.db
        .prepare('SELECT version FROM migrations ORDER BY version')
        .all()
        .map((row) => row.version),
    ).toEqual([1, 2, 3, 4, 5]);
  } finally {
    await fixture.app.close();
    rmSync(directory, { recursive: true, force: true });
    fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  }
});
