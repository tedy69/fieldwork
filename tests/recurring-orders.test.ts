import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import { openStore } from '../apps/api/src/store';
import {
  recurrenceDates,
  recurrenceDatesThrough,
  type CreateOrderSeries,
  OrderSeriesReceiptSchema,
} from '@fieldwork/contracts';

const input = (): CreateOrderSeries => ({
  mutationId: randomUUID(),
  title: 'Weekly gate inspection',
  instructions: 'Check the latch.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: 'routine',
  dueDate: '2026-12-28',
  priority: 'routine',
  frequency: 'weekly',
  occurrences: 3,
});
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
let other: string;
async function login(email: string) {
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    payload: { email: `${email}@fieldwork.local`, password: 'fieldwork-demo' },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}
const create = (payload: unknown, token = manager) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/work-order-series',
    headers: bearer(token),
    payload: payload as object,
  });
const counts = () =>
  ['work_orders', 'audit', 'order_series', 'order_series_members'].map(
    (table) => fixture.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
  );
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = await login('manager');
  worker = await login('worker');
  other = await login('jordan');
});
afterEach(async () => {
  await fixture.app.close();
});

describe('calendar recurrence', () => {
  it('crosses leap days and year boundaries without local time arithmetic', () => {
    expect(recurrenceDates({ dueDate: '2028-02-28', frequency: 'daily', occurrences: 3 })).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    expect(recurrenceDates({ dueDate: '2026-12-28', frequency: 'weekly', occurrences: 3 })).toEqual(
      ['2026-12-28', '2027-01-04', '2027-01-11'],
    );
    expect(
      recurrenceDates({ dueDate: '2026-01-01', frequency: 'weekly', occurrences: 52 }).at(-1),
    ).toBe('2026-12-24');
    expect(() =>
      recurrenceDates({ dueDate: '9999-12-31', frequency: 'daily', occurrences: 2 }),
    ).toThrow();
  });
  it('ends on an inclusive date without extending past a skipped visit', () => {
    const schedule = {
      dueDate: '2028-01-31',
      frequency: 'monthly' as const,
      skipDates: ['2028-03-31'],
    };
    expect(recurrenceDatesThrough(schedule, '2028-04-30')).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-04-30',
    ]);
    expect(recurrenceDatesThrough(schedule, '2028-04-29')).toEqual(['2028-01-31', '2028-02-29']);
    expect(recurrenceDatesThrough(schedule, '2028-02-28')).toEqual([]);
  });

  it('bounds count-by-date previews and handles the last supported year', () => {
    const daily = { dueDate: '2028-01-01', frequency: 'daily' as const };
    expect(recurrenceDatesThrough(daily, '2028-02-21')).toHaveLength(52);
    expect(recurrenceDatesThrough(daily, '2028-02-22')).toEqual([]);
    expect(recurrenceDatesThrough(daily, '2027-12-31')).toEqual([]);
    expect(() => recurrenceDatesThrough(daily, '2028-02-30')).toThrow();
    expect(recurrenceDatesThrough({ ...daily, dueDate: '9999-12-30' }, '9999-12-31')).toEqual([
      '9999-12-30',
      '9999-12-31',
    ]);
  });
});

describe('recurring assignments', () => {
  it('filters all saved batches before pagination and keeps search manager-only', async () => {
    const receipts = [];
    for (const [title, assigneeId] of [
      ['Café gate rounds', 'worker'],
      ['Café pump rounds', 'worker'],
      ['Reservoir inspection', 'worker-2'],
    ]) {
      const created = await create({ ...input(), title, assigneeId });
      expect(created.statusCode).toBe(201);
      receipts.push(OrderSeriesReceiptSchema.parse(created.json()));
    }
    const before = counts();
    const list = (q: string, cursor?: string, token = manager) => {
      const params = new URLSearchParams({ q, limit: '1' });
      if (cursor) params.set('cursor', cursor);
      return fixture.app.inject({
        url: `/api/v1/work-order-series?${params}`,
        headers: bearer(token),
      });
    };
    const first = (await list(' CAFE\u0301 ')).json();
    const second = (await list('café', first.nextCursor)).json();
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect(second.nextCursor).toBeNull();
    expect([first.data[0].id, second.data[0].id].sort()).toEqual(
      receipts
        .slice(0, 2)
        .map((receipt) => receipt.id)
        .sort(),
    );
    expect((await list('Jordan Lee')).json().data[0].id).toBe(receipts[2].id);
    expect((await list(receipts[0].id.slice(0, 8))).json().data[0].id).toBe(receipts[0].id);
    expect((await list('%')).json()).toEqual({ data: [], total: 0, nextCursor: null });
    expect((await list('Jordan Lee', first.nextCursor)).statusCode).toBe(422);
    expect((await list('café', undefined, worker)).statusCode).toBe(403);
    expect(counts()).toEqual(before);
  });

  it('creates and browses excluded dates through the SDK, replaying their set without duplicate work', async () => {
    const { createClient } = await import('@fieldwork/sdk');
    const fetcher: typeof fetch = async (url, init) => {
      const response = await fixture.app.inject({
        method: init?.method === 'POST' ? 'POST' : 'GET',
        url: new URL(String(url)).pathname,
        headers: init?.headers as Record<string, string>,
        payload: init?.body as string | undefined,
      });
      return new Response(response.body, { status: response.statusCode });
    };
    const client = createClient('https://fieldwork.example', () => manager, fetcher);
    const skipDates = ['2027-01-01', '2026-12-30', '2026-12-29'];
    const payload = { ...input(), frequency: 'daily' as const, occurrences: 4, skipDates };
    const receipt = await client.createOrderSeries(payload);
    expect(receipt.orders.map((order) => order.dueDate)).toEqual([
      '2026-12-28',
      '2026-12-31',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(receipt.skipDates).toEqual([...skipDates].sort());
    expect(
      await client.createOrderSeries({ ...payload, skipDates: [...skipDates].reverse() }),
    ).toEqual(receipt);
    expect((await client.orderSeries()).data[0].skipDates).toEqual(receipt.skipDates);
    const detail = await client.orderSeriesDetail(receipt.id);
    expect(detail.skipDates).toEqual(receipt.skipDates);
    expect(detail.lastDueDate).toBe('2027-01-03');
    const changed = await create({ ...payload, skipDates: ['2026-12-29'] });
    expect(changed.statusCode).toBe(422);
    expect(changed.json().error.code).toBe('MUTATION_REUSED');
    const first = receipt.orders[0];
    fixture.store.writeOrder({ ...first, dueDate: '2026-12-29', version: 2 });
    expect(await client.createOrderSeries(payload)).toEqual(receipt);
    const updated = await client.orderSeriesDetail(receipt.id);
    expect(updated.orders[0]).toMatchObject({
      plannedDueDate: '2026-12-28',
      order: { version: 2, dueDate: '2026-12-29' },
    });
    const stale = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/work-orders/${first.id}/reports`,
      headers: bearer(worker),
      payload: {
        mutationId: randomUUID(),
        baseVersion: 1,
        summary: 'Stale synthetic report',
        photos: [],
        answers: first.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('VERSION_CONFLICT');
    expect(counts()).toEqual([7, 4, 1, 4]);
    expect((await create({ ...payload, mutationId: randomUUID() }, worker)).statusCode).toBe(403);
    expect(
      (await fixture.app.inject({ method: 'POST', url: '/api/v1/work-order-series', payload }))
        .statusCode,
    ).toBe(401);
    expect(counts()).toEqual([7, 4, 1, 4]);
  });

  it('keeps legacy receipt hashes and shapes when exclusions are omitted or empty', async () => {
    const payload = input();
    const receipt = (await create(payload)).json();
    expect(receipt).not.toHaveProperty('skipDates');
    const before = fixture.store.db.prepare('SELECT hash,input FROM order_series').get();
    expect((await create({ ...payload, skipDates: [] })).json()).toEqual(receipt);
    expect(fixture.store.db.prepare('SELECT hash,input FROM order_series').get()).toEqual(before);
  });

  it.each([
    ['2026-12-28'],
    ['2026-12-27'],
    ['invalid'],
    ['2027-02-29'],
    ['2026-12-29', '2026-12-29'],
    Array.from({ length: 53 }, () => '2027-01-01'),
  ])('rejects invalid skipped dates %j without partial writes', async (...skipDates) => {
    expect((await create({ ...input(), skipDates })).statusCode).toBe(422);
    expect(counts()).toEqual([3, 0, 0, 0]);
  });

  it('retains skipped dates and their original receipt after SQLite restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'fieldwork-skipped-dates-'));
    await fixture.app.close();
    fixture = await buildApp({ databasePath: join(directory, 'test.sqlite'), rateLimits: false });
    seed(fixture.store);
    manager = await login('manager');
    const payload = { ...input(), skipDates: ['2027-01-04'] };
    const receipt = (await create(payload)).json();
    await fixture.app.close();
    fixture = await buildApp({ databasePath: join(directory, 'test.sqlite'), rateLimits: false });
    try {
      expect((await create(payload)).json()).toEqual(receipt);
      const detail = await fixture.app.inject({
        url: `/api/v1/work-order-series/${receipt.id}`,
        headers: bearer(manager),
      });
      expect(detail.json().skipDates).toEqual(payload.skipDates);
      expect(counts()).toEqual([6, 3, 1, 3]);
    } finally {
      await fixture.app.close();
      rmSync(directory, { recursive: true, force: true });
      fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
    }
  });
  it.each([
    [
      'weekdays',
      [
        '2026-12-25',
        '2026-12-28',
        '2026-12-29',
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-04',
      ],
    ],
    [
      'monthly',
      [
        '2026-12-31',
        '2027-01-31',
        '2027-02-28',
        '2027-03-31',
        '2027-04-30',
        '2027-05-31',
        '2027-06-30',
      ],
    ],
  ] as const)(
    'creates %s batches with stable receipts, browsing, worker visibility, and unchanged old schedules',
    async (frequency, expectedDates) => {
      const legacy = { ...input(), dueDate: '2026-12-25', frequency: 'daily' as const };
      const oldReceipt = (await create(legacy)).json();
      const payload = {
        ...input(),
        dueDate: expectedDates[0],
        frequency,
        occurrences: 7,
      };
      const response = await create(payload);
      expect(response.statusCode).toBe(201);
      const receipt = OrderSeriesReceiptSchema.parse(response.json());
      expect(receipt.frequency).toBe(frequency);
      expect(receipt.orders.map((order) => order.dueDate)).toEqual(expectedDates);
      expect((await create(payload)).json()).toEqual(receipt);
      const changed = await create({ ...payload, frequency: 'daily' });
      expect(changed.statusCode).toBe(422);
      expect(changed.json().error.code).toBe('MUTATION_REUSED');
      const detail = await fixture.app.inject({
        url: `/api/v1/work-order-series/${receipt.id}`,
        headers: bearer(manager),
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().frequency).toBe(frequency);
      expect(
        detail.json().orders.map((order: { plannedDueDate: string }) => order.plannedDueDate),
      ).toEqual(receipt.orders.map((order) => order.dueDate));
      const list = await fixture.app.inject({
        url: '/api/v1/work-order-series',
        headers: bearer(manager),
      });
      expect(
        list.json().data.find((batch: { id: string }) => batch.id === receipt.id).frequency,
      ).toBe(frequency);
      for (const order of receipt.orders)
        expect(
          (
            await fixture.app.inject({
              url: `/api/v1/work-orders/${order.id}`,
              headers: bearer(worker),
            })
          ).statusCode,
        ).toBe(200);
      expect((await create(legacy)).json()).toEqual(oldReceipt);
      expect(oldReceipt.orders.map((order: { dueDate: string }) => order.dueDate)).toEqual([
        '2026-12-25',
        '2026-12-26',
        '2026-12-27',
      ]);
    },
  );
  it.each(['2026-12-26', '2026-12-27', '9999-12-31'])(
    'rejects unsupported weekday start %s atomically',
    async (dueDate) => {
      const before = counts();
      expect((await create({ ...input(), frequency: 'weekdays', dueDate })).statusCode).toBe(422);
      expect(counts()).toEqual(before);
    },
  );
  it('schedules weekend visits across a year, skips a closure, and replays one saved batch', async () => {
    const payload = {
      ...input(),
      dueDate: '2026-12-26',
      frequency: 'weekends',
      occurrences: 4,
      skipDates: ['2027-01-03'],
    };
    const before = counts();
    expect((await create({ ...payload, dueDate: '2026-12-25' })).statusCode).toBe(422);
    expect(counts()).toEqual(before);
    const created = await create(payload);
    expect(created.statusCode).toBe(201);
    const receipt = OrderSeriesReceiptSchema.parse(created.json());
    expect(receipt.orders.map((order) => order.dueDate)).toEqual([
      '2026-12-26',
      '2026-12-27',
      '2027-01-02',
      '2027-01-09',
    ]);
    expect(receipt.frequency).toBe('weekends');
    const retry = await create(payload);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(receipt);
    expect(counts()).toEqual([7, 4, 1, 4]);
  });
  it('stores selected days once and treats a reordered retry as the same request', async () => {
    const payload = {
      ...input(),
      frequency: 'selected-days',
      repeatDays: ['thu', 'mon'],
      skipDates: ['2026-12-31'],
    };
    const before = counts();
    for (const repeatDays of [undefined, ['thu'], ['mon', 'mon']])
      expect((await create({ ...payload, repeatDays })).statusCode).toBe(422);
    expect(counts()).toEqual(before);
    const created = await create(payload);
    expect(created.statusCode).toBe(201);
    const receipt = OrderSeriesReceiptSchema.parse(created.json());
    expect(receipt.repeatDays).toEqual(['mon', 'thu']);
    expect(receipt.orders.map((order) => order.dueDate)).toEqual([
      '2026-12-28',
      '2027-01-04',
      '2027-01-07',
    ]);
    const retry = await create({ ...payload, repeatDays: ['mon', 'thu'] });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(receipt);
    const conflict = await create({ ...payload, repeatDays: ['mon', 'fri'] });
    expect(conflict.statusCode).toBe(422);
    expect(conflict.json().error.code).toBe('MUTATION_REUSED');
    expect(counts()).toEqual([6, 3, 1, 3]);
  });
  it('rejects a changed session account before creating or replaying a batch', async () => {
    const payload = { ...input(), expectedActorId: 'manager' };
    expect((await create(payload)).statusCode).toBe(201);
    fixture.store.db.prepare("UPDATE users SET role='manager' WHERE id='worker-2'").run();
    const rejected = await create(payload, other);
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe('ACTOR_CHANGED');
    expect(counts()).toEqual([6, 3, 1, 3]);
    expect((await create({ ...payload, expectedActorId: 'another-account' })).statusCode).toBe(403);
    expect((await create(payload)).statusCode).toBe(200);
  });
  it('requires a manager before validating the request', async () => {
    expect(
      (await fixture.app.inject({ method: 'POST', url: '/api/v1/work-order-series', payload: {} }))
        .statusCode,
    ).toBe(401);
    expect((await create({}, worker)).statusCode).toBe(403);
    expect((await create(input(), other)).statusCode).toBe(403);
    expect(counts()).toEqual([3, 0, 0, 0]);
  });

  it('protects cookie writes against missing and foreign origins', async () => {
    for (const origin of [undefined, 'https://untrusted.example']) {
      const response = await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/work-order-series',
        headers: { cookie: `session=${manager}`, ...(origin ? { origin } : {}) },
        payload: input(),
      });
      expect(response.statusCode).toBe(403);
    }
    expect(counts()).toEqual([3, 0, 0, 0]);
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: '/api/v1/work-order-series',
          headers: { cookie: `session=${manager}`, origin: 'http://localhost:5173' },
          payload: input(),
        })
      ).statusCode,
    ).toBe(201);
  });

  it.each([
    ['daily', '2027-02-17'],
    ['weekdays', '2027-03-09'],
    ['biweekly', '2028-12-11'],
    ['monthly', '2031-03-28'],
    ['quarterly', '2039-09-28'],
  ] as const)(
    'accepts the maximum %s batch through the SDK and replays its validated receipt',
    async (frequency, lastDate) => {
      const { createClient } = await import('@fieldwork/sdk');
      const fetcher: typeof fetch = async (url, init) => {
        const response = await fixture.app.inject({
          method: 'POST',
          url: new URL(String(url)).pathname,
          headers: init!.headers as Record<string, string>,
          payload: init!.body as string,
        });
        return new Response(response.body, { status: response.statusCode });
      };
      const client = createClient('https://fieldwork.example', () => manager, fetcher);
      const payload = { ...input(), frequency, occurrences: 52 };
      const receipt = await client.createOrderSeries(payload);
      expect(receipt.orders).toHaveLength(52);
      expect(receipt.orders.at(-1)!.dueDate).toBe(lastDate);
      expect(await client.createOrderSeries(payload)).toEqual(receipt);
      expect(counts()).toEqual([55, 52, 1, 52]);
    },
  );

  it('scopes retry identity to the creating manager account', async () => {
    fixture.store.db.prepare("UPDATE users SET role='manager' WHERE id='worker-2'").run();
    const payload = input();
    const first = (await create(payload)).json();
    const second = await create(payload, other);
    expect(second.statusCode).toBe(201);
    expect(second.json().id).not.toBe(first.id);
    expect(counts()).toEqual([9, 6, 2, 6]);
    expect((await create(payload, other)).json()).toEqual(second.json());
  });

  it('creates independent dated snapshots and exposes them through ordinary sync and history', async () => {
    const response = await create(input());
    expect(response.statusCode).toBe(201);
    const receipt = OrderSeriesReceiptSchema.parse(response.json());
    expect(receipt.orders.map((order) => order.dueDate)).toEqual([
      '2026-12-28',
      '2027-01-04',
      '2027-01-11',
    ]);
    expect(new Set(receipt.orders.map((order) => order.id)).size).toBe(3);
    for (const order of receipt.orders) {
      expect(order).toMatchObject({
        status: 'ASSIGNED',
        version: 1,
        report: null,
        review: null,
        site: { id: 'north' },
        assignee: { id: 'worker' },
        template: { id: 'routine' },
      });
      const events = await fixture.app.inject({
        url: `/api/v1/work-orders/${order.id}/events`,
        headers: bearer(worker),
      });
      expect(events.json().data[0].action).toContain('Recurring assignment');
      expect(
        (
          await fixture.app.inject({
            url: `/api/v1/work-orders/${order.id}`,
            headers: bearer(other),
          })
        ).statusCode,
      ).toBe(404);
    }
    const list = await fixture.app.inject({ url: '/api/v1/work-orders', headers: bearer(worker) });
    expect(list.json().total).toBe(6);
    const first = receipt.orders[0];
    await fixture.app.inject({
      method: 'PATCH',
      url: `/api/v1/work-orders/${first.id}/schedule`,
      headers: bearer(manager),
      payload: { baseVersion: 1, dueDate: '2027-02-01' },
    });
    expect(fixture.store.getOrder(receipt.orders[1].id)).toEqual(receipt.orders[1]);
    const catalog = fixture.store.catalog();
    catalog.templates[0].items[0].label = 'Updated catalog item';
    fixture.store.db.prepare('UPDATE catalog SET data=?').run(JSON.stringify(catalog));
    expect(fixture.store.getOrder(first.id)!.template).toEqual(first.template);
    expect(counts()).toEqual([6, 4, 1, 3]);
  });

  it('deduplicates concurrent and reordered retries and preserves the original receipt after later edits', async () => {
    const payload = input();
    const results = await Promise.all(Array.from({ length: 4 }, () => create(payload)));
    expect(results.map((response) => response.statusCode)).toEqual([201, 200, 200, 200]);
    const receipt = results[0].json();
    expect(results.every((response) => response.body === results[0].body)).toBe(true);
    const order = fixture.store.getOrder(receipt.orders[0].id)!;
    fixture.store.writeOrder({ ...order, version: 2, dueDate: '2027-03-01' });
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    expect((await create(reordered)).json()).toEqual(receipt);
    expect((await create({ ...payload, occurrences: 4 })).statusCode).toBe(422);
    expect(counts()).toEqual([6, 3, 1, 3]);
    expect((await create({ ...payload, mutationId: randomUUID() })).statusCode).toBe(201);
    expect(counts()).toEqual([9, 6, 2, 6]);
  });

  it.each([
    { frequency: 'semiweekly' },
    { frequency: 'monthly', dueDate: '9999-12-01' },
    { frequency: 'biweekly', dueDate: '9999-12-25' },
    { frequency: 'quarterly', dueDate: '9999-10-01' },
    { occurrences: 0 },
    { occurrences: 1 },
    { occurrences: 53 },
    { occurrences: 2.5 },
    { occurrences: '3' },
    { mutationId: 'bad' },
    { dueDate: '2027-02-29' },
    { dueDate: '9999-12-25' },
    { unknown: true },
    { siteId: 'missing' },
    { templateId: 'missing' },
    { assigneeId: 'missing' },
    { assigneeId: 'manager' },
  ])('rejects invalid assignment or recurrence %j without partial writes', async (patch) => {
    expect((await create({ ...input(), ...patch })).statusCode).toBe(422);
    expect(counts()).toEqual([3, 0, 0, 0]);
  });

  it.each(['order_series', 'order_series_members', 'audit', 'work_orders'])(
    'rolls back the series and earlier occurrences when %s fails',
    async (table) => {
      fixture.store.db.exec(`CREATE TRIGGER fail_series BEFORE INSERT ON ${table}
        ${table === 'work_orders' ? 'WHEN (SELECT COUNT(*) FROM work_orders)=4' : ''}
        BEGIN SELECT RAISE(ABORT,'test failure'); END`);
      const payload = input();
      expect((await create(payload)).statusCode).toBe(500);
      expect(counts()).toEqual([3, 0, 0, 0]);
      fixture.store.db.exec('DROP TRIGGER fail_series');
      expect((await create(payload)).statusCode).toBe(201);
      expect(counts()).toEqual([6, 3, 1, 3]);
    },
  );

  it.each(['weekly', 'monthly'] as const)(
    'retains %s receipts through restart and upgrades schema 2 without changing existing data',
    async (frequency) => {
      const directory = mkdtempSync(join(tmpdir(), 'fieldwork-series-'));
      const path = join(directory, 'upgrade.sqlite');
      await fixture.app.close();
      fixture = await buildApp({ databasePath: path, rateLimits: false });
      seed(fixture.store);
      const tables = ['users', 'catalog', 'work_orders', 'mutations', 'report_revisions', 'audit'];
      const before = tables.map((table) =>
        fixture.store.db.prepare(`SELECT * FROM ${table}`).all(),
      );
      fixture.store.db.exec(
        'DROP TABLE password_resets; DROP TABLE worker_access_events; DROP TABLE worker_access; DROP TABLE invitations; DROP TABLE order_series_members; DROP TABLE order_series; DELETE FROM migrations WHERE version>=3;',
      );
      await fixture.app.close();
      fixture = await buildApp({ databasePath: path, rateLimits: false });
      expect(
        tables.map((table) => fixture.store.db.prepare(`SELECT * FROM ${table}`).all()),
      ).toEqual(before);
      expect(
        fixture.store.db
          .prepare('SELECT version FROM migrations ORDER BY version')
          .all()
          .map((row) => row.version),
      ).toEqual([1, 2, 3, 4, 5, 6]);
      manager = await login('manager');
      const payload = { ...input(), frequency };
      const receipt = (await create(payload)).json();
      await fixture.app.close();
      fixture = await buildApp({ databasePath: path, rateLimits: false });
      try {
        expect((await create(payload)).json()).toEqual(receipt);
        expect(counts()).toEqual([6, 3, 1, 3]);
        expect(fixture.store.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      } finally {
        await fixture.app.close();
        rmSync(directory, { recursive: true, force: true });
        fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
      }
    },
  );

  it('rolls back an interrupted migration and can retry it on the next open', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fieldwork-series-failure-'));
    const path = join(directory, 'upgrade.sqlite');
    const store = openStore(path);
    store.db.exec(
      'DROP TABLE password_resets; DROP TABLE worker_access_events; DROP TABLE worker_access; DROP TABLE invitations; DROP TABLE order_series_members; DROP TABLE order_series; DELETE FROM migrations WHERE version>=3; CREATE TABLE order_series_members(blocker TEXT);',
    );
    store.db.close();
    try {
      expect(() => openStore(path)).toThrow();
      const db = new DatabaseSync(path);
      expect(db.prepare('SELECT version FROM migrations WHERE version=3').get()).toBeUndefined();
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE name='order_series'").get(),
      ).toBeUndefined();
      db.exec('DROP TABLE order_series_members');
      db.close();
      const reopened = openStore(path);
      expect(
        reopened.db.prepare('SELECT version FROM migrations WHERE version=3').get(),
      ).toBeDefined();
      reopened.db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
