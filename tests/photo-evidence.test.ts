import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TemplateSchema,
  WorkOrderSchema,
  type ReportInput,
  type WorkOrder,
} from '@fieldwork/contracts';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';

let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
async function login(role: string) {
  return (
    await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { email: `${role}@fieldwork.local`, password: 'fieldwork-demo' },
    })
  ).json().token as string;
}
async function template(requiresPhoto?: boolean) {
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/templates',
    headers: bearer(manager),
    payload: {
      name: 'Synthetic evidence checklist',
      items: ['Check access'],
      ...(requiresPhoto === undefined ? {} : { requiresPhoto }),
    },
  });
  expect(response.statusCode).toBe(201);
  return TemplateSchema.parse(response.json());
}
async function assignment(templateId: string) {
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/work-orders',
    headers: bearer(manager),
    payload: {
      title: 'Synthetic evidence inspection',
      instructions: '',
      siteId: 'north',
      templateId,
      assigneeId: 'worker',
      dueDate: '2026-12-28',
      priority: 'routine',
    },
  });
  expect(response.statusCode).toBe(201);
  return WorkOrderSchema.parse(response.json());
}
const photo = () => ({
  id: randomUUID(),
  mimeType: 'image/png' as const,
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
});
const input = (order: WorkOrder): ReportInput => ({
  mutationId: randomUUID(),
  baseVersion: order.version,
  summary: 'Synthetic evidence report.',
  answers: order.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
  photos: [],
});
const submit = (order: WorkOrder, payload: ReportInput, token = worker) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/work-orders/${order.id}/reports`,
    headers: bearer(token),
    payload,
  });
const records = () =>
  ['work_orders', 'photos', 'audit', 'mutations', 'report_revisions'].map((table) =>
    fixture.store.db.prepare(`SELECT * FROM ${table}`).all(),
  );
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
});
afterEach(async () => {
  await fixture.app.close();
});

it('requires manager and allowed cookie origin before accepting a photo policy', async () => {
  const payload = { name: 'Evidence checks', items: ['Check access'], requiresPhoto: true };
  expect(
    (await fixture.app.inject({ method: 'POST', url: '/api/v1/templates', payload })).statusCode,
  ).toBe(401);
  expect(
    (
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: bearer(worker),
        payload,
      })
    ).statusCode,
  ).toBe(403);
  for (const origin of [undefined, 'https://untrusted.example'])
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/templates',
          headers: { cookie: `session=${manager}`, ...(origin ? { origin } : {}) },
          payload,
        })
      ).statusCode,
    ).toBe(403);
  expect(
    (
      await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { cookie: `session=${manager}`, origin: 'http://localhost:5173' },
        payload,
      })
    ).statusCode,
  ).toBe(201);
});
it.each(['true', 1, null, {}, []])(
  'rejects malformed photo policy %j without changing the catalog',
  async (requiresPhoto) => {
    const before = fixture.store.catalog();
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: bearer(manager),
      payload: { name: 'Evidence checks', items: ['Check access'], requiresPhoto },
    });
    expect(response.statusCode).toBe(422);
    expect(fixture.store.catalog()).toEqual(before);
  },
);
it.each([undefined, false])(
  'keeps omitted/optional policy %s compatible with photo-free reports',
  async (requiresPhoto) => {
    const saved = await template(requiresPhoto);
    expect(saved.requiresPhoto).toBe(requiresPhoto);
    const order = await assignment(saved.id);
    expect((await submit(order, input(order))).statusCode).toBe(200);
  },
);
it('rejects missing or invalid evidence atomically and retries the same mutation after adding a valid photo', async () => {
  const saved = await template(true);
  const order = await assignment(saved.id);
  const payload = input(order);
  const before = records();
  const missing = await submit(order, payload);
  expect(missing.statusCode).toBe(422);
  expect(missing.json().error).toEqual({
    code: 'PHOTO_REQUIRED',
    message: 'Attach at least one site photo before submitting this checklist.',
  });
  expect(records()).toEqual(before);
  const invalid = await submit(order, { ...payload, photos: [{ ...photo(), data: 'invalid' }] });
  expect(invalid.statusCode).toBe(422);
  expect(invalid.json().error.code).toBe('PHOTO');
  expect(records()).toEqual(before);
  const withPhoto = { ...payload, photos: [photo()] };
  const accepted = await submit(order, withPhoto);
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json().template.requiresPhoto).toBe(true);
  expect(accepted.json().report.photos).toEqual(
    withPhoto.photos.map(({ id, mimeType }) => ({ id, mimeType })),
  );
  const after = records();
  expect((await submit(order, withPhoto)).json()).toEqual(accepted.json());
  expect(records()).toEqual(after);
});
it('carries the requirement into every recurring occurrence', async () => {
  const saved = await template(true);
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/work-order-series',
    headers: bearer(manager),
    payload: {
      mutationId: randomUUID(),
      title: 'Synthetic required evidence batch',
      instructions: '',
      siteId: 'north',
      templateId: saved.id,
      assigneeId: 'worker',
      dueDate: '2026-12-28',
      priority: 'routine',
      frequency: 'daily',
      occurrences: 2,
    },
  });
  expect(response.statusCode).toBe(201);
  const orders = response
    .json()
    .orders.map((value: unknown) => WorkOrderSchema.parse(value)) as WorkOrder[];
  expect(orders).toHaveLength(2);
  for (const order of orders) {
    expect(order.template.requiresPhoto).toBe(true);
    expect((await submit(order, input(order))).json().error.code).toBe('PHOTO_REQUIRED');
  }
});
it('checks current authorization and version before revealing a missing-photo error', async () => {
  const order = await assignment((await template(true)).id);
  expect((await submit(order, input(order), manager)).statusCode).toBe(403);
  expect((await submit(order, input(order), await login('jordan'))).statusCode).toBe(404);
  expect((await submit(order, { ...input(order), baseVersion: 99 })).json().error.code).toBe(
    'VERSION_CONFLICT',
  );
});
it('requires evidence for every correction and preserves the saved report and history when it is missing', async () => {
  const order = await assignment((await template(true)).id);
  const submitted = (await submit(order, { ...input(order), photos: [photo()] })).json();
  const review = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/work-orders/${order.id}/reviews`,
    headers: bearer(manager),
    payload: {
      baseVersion: submitted.version,
      decision: 'CHANGES_REQUESTED',
      note: 'Add follow-up evidence.',
    },
  });
  expect(review.statusCode).toBe(200);
  const correction = WorkOrderSchema.parse(review.json());
  const before = records();
  expect((await submit(correction, input(correction))).json().error.code).toBe('PHOTO_REQUIRED');
  expect(records()).toEqual(before);
  const accepted = await submit(correction, { ...input(correction), photos: [photo()] });
  expect(accepted.statusCode).toBe(200);
  const history = fixture.store.reportHistory(order.id, 10)!;
  expect(history.data).toHaveLength(2);
  expect(
    history.data.every(
      (revision) =>
        revision.snapshot.template.requiresPhoto && revision.snapshot.report.photos.length === 1,
    ),
  ).toBe(true);
});
it('enforces the assignment snapshot independently of later catalog policy changes', async () => {
  const saved = await template(true);
  const required = await assignment(saved.id);
  const catalog = fixture.store.catalog();
  catalog.templates = catalog.templates.map((value) => ({
    ...value,
    requiresPhoto: value.id !== saved.id,
  }));
  fixture.store.db
    .prepare('UPDATE catalog SET data=? WHERE id=1')
    .run(JSON.stringify({ sites: catalog.sites, templates: catalog.templates }));
  expect((await submit(required, input(required))).json().error.code).toBe('PHOTO_REQUIRED');
  const optional = await assignment(saved.id);
  expect(optional.template.requiresPhoto).toBe(false);
  expect((await submit(optional, input(optional))).statusCode).toBe(200);
  const oldOrder = fixture.store.getOrder('demo-1')!;
  expect(oldOrder.template.requiresPhoto).toBeUndefined();
  expect((await submit(oldOrder, input(oldOrder))).statusCode).toBe(200);
});
it('persists the requirement across restart without rewriting older orders or adding a migration', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fieldwork-evidence-'));
  await fixture.app.close();
  fixture = await buildApp({ databasePath: join(directory, 'evidence.sqlite'), rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
  const old = fixture.store.getOrder('demo-1');
  const saved = await template(true);
  const order = await assignment(saved.id);
  await fixture.app.close();
  fixture = await buildApp({ databasePath: join(directory, 'evidence.sqlite'), rateLimits: false });
  try {
    expect(
      fixture.store.catalog().templates.find((value) => value.id === saved.id)?.requiresPhoto,
    ).toBe(true);
    expect(fixture.store.getOrder('demo-1')).toEqual(old);
    expect((await submit(order, input(order))).json().error.code).toBe('PHOTO_REQUIRED');
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
