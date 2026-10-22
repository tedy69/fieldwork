import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import { openStore } from '../apps/api/src/store';
import type { ReportInput, WorkOrder } from '@fieldwork/contracts';

let app: Awaited<ReturnType<typeof buildApp>>['app'];
let store: Awaited<ReturnType<typeof buildApp>>['store'];
let worker: string;
let manager: string;
let other: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
async function login(email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    payload: { email, password: 'fieldwork-demo' },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}
function report(): ReportInput {
  return {
    mutationId: randomUUID(),
    baseVersion: 1,
    summary: 'Site checked; access route clear.',
    photos: [],
    answers: ['access', 'equipment', 'signage', 'area'].map((itemId) => ({
      itemId,
      value: 'pass',
      note: '',
    })),
  };
}
function submit(input = report(), token = worker) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/work-orders/demo-1/reports',
    headers: bearer(token),
    payload: input,
  });
}
beforeEach(async () => {
  ({ app, store } = await buildApp({ databasePath: ':memory:', rateLimits: false }));
  seed(store);
  worker = await login('worker@fieldwork.local');
  manager = await login('manager@fieldwork.local');
  other = await login('jordan@fieldwork.local');
});
afterEach(async () => {
  await app.close();
});

describe('access boundaries', () => {
  it('requires authentication and never returns another worker’s assignments', async () => {
    expect((await app.inject('/api/v1/work-orders')).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/api/v1/work-orders', headers: bearer(other) })).json().data,
    ).toEqual([]);
    expect(
      (await app.inject({ url: '/api/v1/work-orders/demo-1', headers: bearer(other) })).statusCode,
    ).toBe(404);
    expect((await submit(report(), other)).statusCode).toBe(404);
  });
  it('restricts dispatch and review to managers', async () => {
    const payload = {
      title: 'Inspect east gate',
      instructions: '',
      siteId: 'north',
      assigneeId: 'worker',
      templateId: 'routine',
      dueDate: '2026-10-24',
      priority: 'routine',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/work-orders',
          payload,
          headers: bearer(worker),
        })
      ).statusCode,
    ).toBe(403);
    expect((await submit(report(), manager)).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/work-orders',
          payload,
          headers: bearer(manager),
        })
      ).statusCode,
    ).toBe(201);
  });
  it('validates cookie request origins and revokes sessions on logout', async () => {
    const headers = { cookie: `session=${worker}` };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/work-orders/demo-1/reports',
          payload: report(),
          headers: { ...headers, origin: 'https://outside.example' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/sessions/current',
          headers: { ...headers, origin: 'http://localhost:5173' },
        })
      ).statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/api/v1/me', headers: bearer(worker) })).statusCode).toBe(401);
  });
  it('rejects expired sessions and returns safe errors for bad credentials', async () => {
    store.db.prepare('UPDATE sessions SET expires=0').run();
    expect((await app.inject({ url: '/api/v1/me', headers: bearer(worker) })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { email: 'nobody@example.com', password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
describe('inspection lifecycle', () => {
  it('replays concurrent retries exactly once and rejects reusing an ID with different content', async () => {
    const input = report();
    const responses = await Promise.all(Array.from({ length: 8 }, () => submit(input)));
    expect(responses.map((response) => response.statusCode)).toEqual(Array(8).fill(200));
    expect(new Set(responses.map((response) => response.json().report.id)).size).toBe(1);
    expect(store.getOrder('demo-1')!.version).toBe(2);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM audit').get()!.count).toBe(1);
    expect((await submit({ ...input, summary: 'Different payload' })).statusCode).toBe(422);
  });
  it('preserves the existing report on a stale submission', async () => {
    await submit();
    const result = await submit({ ...report(), summary: 'Stale device' });
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('VERSION_CONFLICT');
    expect(store.getOrder('demo-1')!.report!.summary).toBe('Site checked; access route clear.');
  });
  it('requires every checklist answer exactly once', async () => {
    const input = report();
    input.answers[1] = { ...input.answers[0] };
    expect((await submit(input)).statusCode).toBe(422);
    expect(store.getOrder('demo-1')!.status).toBe('ASSIGNED');
  });
  it('supports changes requested, resubmission, and final approval', async () => {
    await submit();
    const review = (baseVersion: number, decision: string, note = '') =>
      app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/demo-1/reviews',
        headers: bearer(manager),
        payload: { baseVersion, decision, note },
      });
    expect((await review(2, 'CHANGES_REQUESTED')).statusCode).toBe(422);
    expect((await review(2, 'CHANGES_REQUESTED', 'Check the gate latch.')).statusCode).toBe(200);
    expect(
      (await submit({ ...report(), baseVersion: 3, summary: 'Gate latch rechecked.' })).statusCode,
    ).toBe(200);
    expect((await review(4, 'APPROVED', 'Checked.')).json().status).toBe('APPROVED');
    expect((await review(4, 'APPROVED')).statusCode).toBe(409);
    expect((await submit({ ...report(), baseVersion: 5 })).statusCode).toBe(409);
    const events = await app.inject({
      url: '/api/v1/work-orders/demo-1/events',
      headers: bearer(manager),
    });
    expect(events.json().data).toHaveLength(4);
  });
  it('stores photo bytes and restricts attachment access', async () => {
    const input = report();
    const id = randomUUID();
    const data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
    input.photos = [{ id, data, mimeType: 'image/png' }];
    expect((await submit(input)).statusCode).toBe(200);
    const response = await app.inject({ url: `/api/v1/photos/${id}`, headers: bearer(manager) });
    expect(response.rawPayload.equals(Buffer.from(data, 'base64'))).toBe(true);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(
      (await app.inject({ url: `/api/v1/photos/${id}`, headers: bearer(other) })).statusCode,
    ).toBe(404);
    expect((await app.inject(`/api/v1/photos/${id}`)).statusCode).toBe(401);
  });
  it('rolls back attachment writes when another attachment is invalid', async () => {
    const input = report();
    input.photos = [
      {
        id: randomUUID(),
        data: Buffer.from([255, 216, 255, 0]).toString('base64'),
        mimeType: 'image/jpeg',
      },
      {
        id: randomUUID(),
        data: Buffer.from('<script>').toString('base64'),
        mimeType: 'image/jpeg',
      },
    ];
    expect((await submit(input)).statusCode).toBe(422);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM photos').get()!.count).toBe(0);
    expect(store.getOrder('demo-1')!.version).toBe(1);
  });
  it('allows managers to add sites and checklist templates', async () => {
    const site = await app.inject({
      method: 'POST',
      url: '/api/v1/sites',
      headers: bearer(manager),
      payload: { name: 'East gate', address: '1 Demo Road' },
    });
    const template = await app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: bearer(manager),
      payload: { name: 'Gate check', items: ['Check latch', 'Check access'] },
    });
    expect(site.statusCode).toBe(201);
    expect(template.json().items).toHaveLength(2);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/sites',
          headers: bearer(worker),
          payload: { name: 'Denied', address: '1 Demo Road' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({ url: '/api/v1/work-orders?limit=1&offset=1', headers: bearer(manager) })
      ).json().data,
    ).toHaveLength(1);
    expect(
      (await app.inject({ url: '/api/v1/work-orders?limit=101', headers: bearer(manager) }))
        .statusCode,
    ).toBe(422);
  });
  it('persists submitted reports after the database is reopened', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'fieldwork-'));
    const path = join(directory, 'test.sqlite');
    try {
      expect((await submit()).statusCode).toBe(200);
      const persistent = openStore(path);
      seed(persistent);
      const order = { ...store.getOrder('demo-1')!, version: 8 } as WorkOrder;
      persistent.writeOrder(order);
      persistent.db.close();
      const reopened = openStore(path);
      expect(reopened.getOrder('demo-1')!.version).toBe(8);
      expect(reopened.getOrder('demo-1')!.report!.summary).toBe(report().summary);
      reopened.db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('assignment rescheduling', () => {
  const schedule = (payload: Record<string, unknown>, token = manager, id = 'demo-1') =>
    app.inject({
      method: 'PATCH',
      url: `/api/v1/work-orders/${id}/schedule`,
      headers: bearer(token),
      payload,
    });

  it('permits PATCH preflight only for configured browser origins', async () => {
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/v1/work-orders/demo-1/schedule',
        headers: { origin, 'access-control-request-method': 'PATCH' },
      });
    const allowed = await preflight('http://localhost:5173');
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-methods']).toContain('PATCH');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(
      (await preflight('https://outside.example')).headers['access-control-allow-origin'],
    ).toBeUndefined();
  });
  it('requires an authenticated manager and an allowed cookie origin', async () => {
    const payload = { baseVersion: 1, dueDate: '2026-10-25' };
    expect(
      (await app.inject({ method: 'PATCH', url: '/api/v1/work-orders/demo-1/schedule', payload }))
        .statusCode,
    ).toBe(401);
    expect((await schedule(payload, worker)).statusCode).toBe(403);
    expect((await schedule(payload, other)).statusCode).toBe(403);
    expect((await schedule(payload, manager, 'missing')).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/work-orders/demo-1/schedule',
          payload,
          headers: { cookie: `session=${manager}`, origin: 'https://outside.example' },
        })
      ).statusCode,
    ).toBe(403);
    expect(store.getOrder('demo-1')!.version).toBe(1);
  });

  it.each([
    { baseVersion: 1, dueDate: '2026-02-29' },
    { baseVersion: 1, dueDate: '2026-10-25T00:00:00Z' },
    { baseVersion: 0, dueDate: '2026-10-25' },
    { dueDate: '2026-10-25' },
    { baseVersion: 1, dueDate: '2026-10-25', assigneeId: 'jordan' },
  ])('rejects invalid schedule input %j without writing', async (payload) => {
    expect((await schedule(payload)).statusCode).toBe(422);
    expect(store.getOrder('demo-1')!.version).toBe(1);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM audit').get()!.count).toBe(0);
  });

  it('changes only the due date/version and records the old and new dates', async () => {
    const before = store.getOrder('demo-1')!;
    const response = await schedule({ baseVersion: before.version, dueDate: '2028-02-29' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...before, dueDate: '2028-02-29', version: 2 });
    expect(store.getOrder('demo-1')).toEqual(response.json());
    const events = await app.inject({
      url: '/api/v1/work-orders/demo-1/events',
      headers: bearer(worker),
    });
    expect(events.json().data).toEqual([
      expect.objectContaining({
        actor: 'Alex Morgan',
        action: `Due date changed from ${before.dueDate} to 2028-02-29`,
      }),
    ]);
  });

  it('does not increment the version or audit an unchanged date', async () => {
    const before = store.getOrder('demo-1')!;
    expect(
      (await schedule({ baseVersion: before.version, dueDate: before.dueDate })).json(),
    ).toEqual(before);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM audit').get()!.count).toBe(0);
  });

  it('preserves the submitted snapshot and feedback when correction work is rescheduled', async () => {
    await submit();
    await app.inject({
      method: 'POST',
      url: '/api/v1/work-orders/demo-1/reviews',
      headers: bearer(manager),
      payload: { baseVersion: 2, decision: 'CHANGES_REQUESTED', note: 'Recheck the latch.' },
    });
    const before = store.getOrder('demo-1')!;
    const response = await schedule({ baseVersion: before.version, dueDate: '2026-10-27' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...before, dueDate: '2026-10-27', version: 4 });
  });

  it.each(['SUBMITTED', 'APPROVED'] as const)('does not reschedule %s work', async (status) => {
    await submit();
    if (status === 'APPROVED')
      await app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/demo-1/reviews',
        headers: bearer(manager),
        payload: { baseVersion: 2, decision: 'APPROVED', note: '' },
      });
    const before = store.getOrder('demo-1')!;
    const result = await schedule({ baseVersion: before.version, dueDate: '2026-10-27' });
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('INVALID_STATE');
    expect(store.getOrder('demo-1')).toEqual(before);
  });

  it('accepts only one concurrent change and rejects stale worker reports without losing the new date', async () => {
    const results = await Promise.all(
      ['2026-10-26', '2026-10-27'].map((dueDate) => schedule({ baseVersion: 1, dueDate })),
    );
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    const confirmed = results.find((result) => result.statusCode === 200)!.json();
    expect(store.getOrder('demo-1')).toEqual(confirmed);
    expect((await submit()).statusCode).toBe(409);
    expect(store.getOrder('demo-1')!.report).toBeNull();
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM audit').get()!.count).toBe(1);
    expect((await schedule({ baseVersion: 1, dueDate: confirmed.dueDate })).statusCode).toBe(409);
  });
});
