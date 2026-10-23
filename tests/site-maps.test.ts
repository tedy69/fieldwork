import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  CoordinatesSchema,
  MapProviderSchema,
  MapSettingsSchema,
  WorkOrderSchema,
} from '@fieldwork/contracts';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import { defaultMapProvider, mapProviderFromEnv } from '../apps/api/src/map-settings';

let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const coordinates = { latitude: 51.5, longitude: -0.1 };
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
const create = (patch: object = {}, token = manager) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/sites',
    headers: bearer(token),
    payload: {
      name: 'Synthetic map site',
      address: 'Synthetic site address',
      coordinates,
      ...patch,
    },
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

it('keeps coordinates optional, validates both geographic axes, and restricts site creation to managers', async () => {
  expect((await create({}, worker)).statusCode).toBe(403);
  expect(
    (await fixture.app.inject({ method: 'POST', url: '/api/v1/sites', payload: {} })).statusCode,
  ).toBe(401);
  const response = await create();
  expect(response.statusCode).toBe(201);
  expect(response.json().coordinates).toEqual(coordinates);
  expect(fixture.store.catalog().sites.at(-1)!.coordinates).toEqual(coordinates);
  const without = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/sites',
    headers: bearer(manager),
    payload: { name: 'No map site', address: 'No coordinates saved' },
  });
  expect(without.statusCode).toBe(201);
  expect(without.json()).not.toHaveProperty('coordinates');
  for (const value of [
    { latitude: 0, longitude: 0 },
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
  ])
    expect((await create({ coordinates: value })).statusCode).toBe(201);
});

it.each([
  { latitude: 90.1, longitude: 0 },
  { latitude: -90.1, longitude: 0 },
  { latitude: 0, longitude: 180.1 },
  { latitude: 0, longitude: -180.1 },
  { latitude: '51.5', longitude: 0 },
  { latitude: 0 },
  { longitude: 0 },
  { latitude: 0, longitude: 0, altitude: 20 },
  {},
  null,
])('rejects malformed coordinates %j without changing the catalog', async (value) => {
  const before = fixture.store.catalog();
  expect((await create({ coordinates: value })).statusCode).toBe(422);
  expect(fixture.store.catalog()).toEqual(before);
});

it('rejects non-finite coordinates and rolls back failed catalog writes', async () => {
  for (const latitude of [NaN, Infinity, -Infinity])
    expect(CoordinatesSchema.safeParse({ latitude, longitude: 0 }).success).toBe(false);
  const before = fixture.store.catalog();
  fixture.store.db.exec(
    "CREATE TRIGGER fail_site BEFORE UPDATE ON catalog BEGIN SELECT RAISE(ABORT,'test failure'); END",
  );
  expect((await create()).statusCode).toBe(500);
  expect(fixture.store.catalog()).toEqual(before);
});

it('preserves old site snapshots and persists coordinates only on newly assigned orders', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fieldwork-sites-'));
  const path = join(directory, 'sites.sqlite');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
  const original = fixture.store.getOrder('demo-1')!;
  const site = (await create()).json();
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/work-orders',
    headers: bearer(manager),
    payload: {
      title: 'Inspection with coordinates',
      instructions: '',
      siteId: site.id,
      templateId: 'routine',
      assigneeId: 'worker',
      priority: 'routine',
      dueDate: '2026-12-28',
    },
  });
  expect(response.statusCode).toBe(201);
  const assigned = WorkOrderSchema.parse(response.json());
  expect(assigned.site.coordinates).toEqual(coordinates);
  const catalog = fixture.store.catalog();
  catalog.sites.find((saved) => saved.id === site.id)!.coordinates = { latitude: 1, longitude: 1 };
  fixture.store.db
    .prepare('UPDATE catalog SET data=? WHERE id=1')
    .run(JSON.stringify({ sites: catalog.sites, templates: catalog.templates }));
  expect(fixture.store.getOrder(assigned.id)!.site.coordinates).toEqual(coordinates);
  const submitted = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/work-orders/${assigned.id}/reports`,
    headers: bearer(worker),
    payload: {
      mutationId: randomUUID(),
      baseVersion: 1,
      summary: 'Snapshot coordinate check.',
      photos: [],
      answers: assigned.template.items.map((item) => ({
        itemId: item.id,
        value: 'pass',
        note: '',
      })),
    },
  });
  expect(submitted.statusCode).toBe(200);
  expect(fixture.store.reportHistory(assigned.id, 10)!.data[0].snapshot.site.coordinates).toEqual(
    coordinates,
  );
  expect(fixture.store.getOrder('demo-1')).toEqual(original);
  expect(original.site).not.toHaveProperty('coordinates');
  await fixture.app.close();
  fixture = await buildApp({ databasePath: path, rateLimits: false });
  try {
    expect(WorkOrderSchema.parse(fixture.store.getOrder(assigned.id)).site.coordinates).toEqual(
      coordinates,
    );
    expect(fixture.store.getOrder('demo-1')).toEqual(original);
    expect(
      fixture.store.catalog().sites.find((saved) => saved.id === site.id)!.coordinates,
    ).toEqual({ latitude: 1, longitude: 1 });
    expect(
      fixture.store.db
        .prepare('SELECT version FROM migrations ORDER BY version')
        .all()
        .map((row) => row.version),
    ).toEqual([1, 2, 3]);
  } finally {
    await fixture.app.close();
    rmSync(directory, { recursive: true, force: true });
    fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  }
});

it('exposes only validated provider settings to authenticated managers and workers', async () => {
  expect((await fixture.app.inject('/api/v1/map-settings')).statusCode).toBe(401);
  for (const token of [manager, worker]) {
    const response = await fixture.app.inject({
      url: '/api/v1/map-settings',
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(200);
    expect(MapSettingsSchema.parse(response.json())).toEqual({ provider: defaultMapProvider });
    expect(response.headers['cache-control']).toBe('no-store');
  }
});

it('supports a disabled provider and explicit custom provider settings', async () => {
  await fixture.app.close();
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false, mapProvider: null });
  seed(fixture.store);
  manager = await login('manager');
  expect(
    (await fixture.app.inject({ url: '/api/v1/map-settings', headers: bearer(manager) })).json(),
  ).toEqual({ provider: null });
  expect(mapProviderFromEnv({ MAPS_ENABLED: 'false' })).toBeNull();
  expect(mapProviderFromEnv({})).toEqual(defaultMapProvider);
  const configured = mapProviderFromEnv({
    MAP_PROVIDER_NAME: 'Synthetic provider',
    MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png',
    MAP_ATTRIBUTION_TEXT: 'Synthetic test tiles',
    MAP_ATTRIBUTION_URL: 'https://example.test/attribution',
    MAP_MAX_ZOOM: '17',
  });
  expect(configured).toMatchObject({ name: 'Synthetic provider', maxZoom: 17 });
  expect(() => mapProviderFromEnv({ MAPS_ENABLED: 'yes' })).toThrow();
  expect(() => mapProviderFromEnv({ MAP_TILE_URL: defaultMapProvider.tileUrlTemplate })).toThrow();
  expect(() => mapProviderFromEnv({ MAP_MAX_ZOOM: '20' })).toThrow();
});

it.each([
  'http://tiles.example.test/{z}/{x}/{y}.png',
  'javascript:alert(1)',
  'https://user:secret@tiles.example.test/{z}/{x}/{y}.png',
  'https://tiles.example.test/{z}/{x}.png',
  'https://tiles.example.test/{z}/{x}/{y}/{s}.png',
  'https://tiles.example.test/{z}/{x}/{y}.png#fragment',
  'https://tiles.example.test/{z}/{x}/{y}/{z}.png',
])('rejects unsafe or incomplete tile configuration %s', (tileUrlTemplate) => {
  expect(MapProviderSchema.safeParse({ ...defaultMapProvider, tileUrlTemplate }).success).toBe(
    false,
  );
});
