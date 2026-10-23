import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import { openStore } from '../apps/api/src/store';
import { ReportHistoryPageSchema, type ReportInput, type WorkOrder } from '@fieldwork/contracts';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
let fixture: Awaited<ReturnType<typeof buildApp>>;
let manager: string;
let worker: string;
let other: string;
const input = (version: number, summary = 'Original inspection.'): ReportInput => ({
  mutationId: randomUUID(),
  baseVersion: version,
  summary,
  answers: ['access', 'equipment', 'signage', 'area'].map((itemId) => ({
    itemId,
    value: 'pass',
    note: `Saved ${itemId} note.`,
  })),
  photos: [{ id: randomUUID(), mimeType: 'image/png', data: png }],
});
async function login(email: string) {
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/sessions',
    payload: { email: `${email}@fieldwork.local`, password: 'fieldwork-demo' },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}
const read = (suffix = '', token = worker, id = 'demo-1') =>
  fixture.app.inject({ url: `/api/v1/work-orders/${id}/history${suffix}`, headers: bearer(token) });
const submit = (payload: ReportInput, token = worker) =>
  fixture.app.inject({
    method: 'POST',
    url: '/api/v1/work-orders/demo-1/reports',
    headers: bearer(token),
    payload,
  });
async function review(version: number, note: string, decision = 'CHANGES_REQUESTED') {
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/work-orders/demo-1/reviews',
    headers: bearer(manager),
    payload: { baseVersion: version, decision, note },
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
});
afterEach(async () => {
  await fixture.app.close();
});

describe('report history', () => {
  it('requires current order access, and returns an honest empty result', async () => {
    expect((await fixture.app.inject('/api/v1/work-orders/demo-1/history')).statusCode).toBe(401);
    expect((await read('', other)).statusCode).toBe(404);
    expect((await read('?cursor=missing', other)).statusCode).toBe(404);
    expect((await read('', manager, 'missing')).statusCode).toBe(404);
    expect((await read()).json()).toEqual({ data: [], total: 0, nextCursor: null });
  });

  it('retains original answers, assignment, photos and each review through correction and approval', async () => {
    const original = input(1);
    const first = (await submit(original)).json() as WorkOrder;
    expect(ReportHistoryPageSchema.parse((await read()).json()).data[0].reviewStatus).toBe(
      'awaiting_review',
    );
    const requested = await review(2, 'Recheck the gate latch.');
    await fixture.app.inject({
      method: 'PATCH',
      url: '/api/v1/work-orders/demo-1/schedule',
      headers: bearer(manager),
      payload: { baseVersion: 3, dueDate: '2026-12-31' },
    });
    const corrected = (await submit(input(4, 'Gate latch corrected.'))).json() as WorkOrder;
    const approved = await review(5, 'Latch checked.', 'APPROVED');
    const page = ReportHistoryPageSchema.parse((await read('', manager)).json());
    expect(page.total).toBe(2);
    expect(page.data.map((revision) => revision.submissionVersion)).toEqual([5, 2]);
    expect(page.data.map((revision) => revision.review)).toEqual([
      approved.review,
      requested.review,
    ]);
    expect(page.data[1].snapshot.report).toEqual(first.report);
    expect(page.data[1].snapshot.dueDate).toBe(first.dueDate);
    expect(page.data[0].snapshot.dueDate).toBe('2026-12-31');
    expect(page.data[0].snapshot.report).toEqual(corrected.report);
    expect(page.data[1].snapshot.assignee).toEqual({ id: 'worker', name: 'Sam Rivera' });
    expect(page.data[1].snapshot).not.toHaveProperty('version');
    const bytes = await fixture.app.inject({
      url: `/api/v1/photos/${original.photos[0].id}`,
      headers: bearer(worker),
    });
    expect(bytes.statusCode).toBe(200);
    expect(bytes.rawPayload).toEqual(Buffer.from(png, 'base64'));
  });

  it('records one revision for concurrent retries and no revision for stale/conflicting input', async () => {
    const payload = input(1);
    const responses = await Promise.all(Array.from({ length: 4 }, () => submit(payload)));
    expect(responses.map((result) => result.statusCode)).toEqual([200, 200, 200, 200]);
    expect((await submit(input(1))).statusCode).toBe(409);
    expect((await submit({ ...payload, summary: 'Changed payload.' })).statusCode).toBe(422);
    expect((await read()).json().total).toBe(1);
    await review(2, 'Recheck.');
    await submit(input(3, 'Corrected.'));
    expect((await submit(payload)).json()).toEqual(responses[0].json());
    expect((await read()).json().total).toBe(2);
  });

  it('pages by stable order-scoped cursors even when another submission arrives', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index++) {
      const submitted = (
        await submit(input(index * 2 + 1, `Report ${index}.`))
      ).json() as WorkOrder;
      ids.push(submitted.report!.id);
      await review(submitted.version, `Feedback ${index}.`);
    }
    const first = (await read('?limit=2')).json();
    expect(first.data.map((entry: { snapshot: WorkOrder }) => entry.snapshot.report!.id)).toEqual([
      ids[3],
      ids[2],
    ]);
    expect(first.nextCursor).toBe(ids[2]);
    await submit(input(9, 'New submission between pages.'));
    const next = (await read(`?limit=2&cursor=${first.nextCursor}`)).json();
    expect(next.data.map((entry: { snapshot: WorkOrder }) => entry.snapshot.report!.id)).toEqual([
      ids[1],
      ids[0],
    ]);
    expect(next.total).toBe(5);
    expect(next.nextCursor).toBeNull();
    expect((await read(`?limit=2&cursor=${ids[0]}`)).json().data).toEqual([]);
    expect((await read(`?cursor=${ids[0]}`, manager, 'demo-2')).statusCode).toBe(422);
  });

  it.each(['?limit=0', '?limit=51', '?limit=1.5', '?cursor=', '?cursor=missing', '?offset=1'])(
    'rejects invalid pagination %s',
    async (query) => {
      expect((await read(query)).statusCode).toBe(422);
    },
  );

  it('moves all historical access with reassignment without rewriting the original worker snapshot', async () => {
    const payload = input(1);
    await submit(payload);
    await review(2, 'Recheck.');
    const moved = await fixture.app.inject({
      method: 'PATCH',
      url: '/api/v1/work-orders/demo-1/assignee',
      headers: bearer(manager),
      payload: { baseVersion: 3, assigneeId: 'worker-2' },
    });
    expect(moved.statusCode).toBe(200);
    expect((await read()).statusCode).toBe(404);
    const page = (await read('', other)).json();
    expect(page.data[0].snapshot.assignee.id).toBe('worker');
    const photo = `/api/v1/photos/${payload.photos[0].id}`;
    expect((await fixture.app.inject({ url: photo, headers: bearer(worker) })).statusCode).toBe(
      404,
    );
    expect((await fixture.app.inject({ url: photo, headers: bearer(other) })).statusCode).toBe(200);
    await submit(input(4, 'Replacement inspection.'), other);
    expect(
      (await read('', other))
        .json()
        .data.map((revision: { snapshot: WorkOrder }) => revision.snapshot.report!.submittedBy),
    ).toEqual(['worker-2', 'worker']);
  });

  it.each(['report_revisions', 'mutations'])(
    'rolls back the whole submission if inserting %s fails',
    async (failedTable) => {
      const before = fixture.store.getOrder('demo-1');
      fixture.store.db.exec(
        `CREATE TRIGGER fail_revision BEFORE INSERT ON ${failedTable} BEGIN SELECT RAISE(ABORT,'test failure'); END`,
      );
      const payload = input(1);
      expect((await submit(payload)).statusCode).toBe(500);
      expect(fixture.store.getOrder('demo-1')).toEqual(before);
      for (const table of ['photos', 'mutations', 'audit', 'report_revisions'])
        expect(
          fixture.store.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count,
        ).toBe(0);
      fixture.store.db.exec('DROP TRIGGER fail_revision');
      expect((await submit(payload)).statusCode).toBe(200);
      expect((await read()).json().total).toBe(1);
    },
  );

  it('rolls back a review if its revision or action history cannot be updated', async () => {
    await submit(input(1));
    const before = fixture.store.getOrder('demo-1');
    for (const trigger of [
      "CREATE TRIGGER fail_review BEFORE UPDATE ON report_revisions BEGIN SELECT RAISE(ABORT,'test failure'); END",
      "CREATE TRIGGER fail_review BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'test failure'); END",
    ]) {
      fixture.store.db.exec(trigger);
      const response = await fixture.app.inject({
        method: 'POST',
        url: '/api/v1/work-orders/demo-1/reviews',
        headers: bearer(manager),
        payload: { baseVersion: 2, decision: 'APPROVED', note: 'Checked.' },
      });
      expect(response.statusCode).toBe(500);
      expect(fixture.store.getOrder('demo-1')).toEqual(before);
      expect((await read()).json().data[0].reviewStatus).toBe('awaiting_review');
      expect(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM audit').get()!.count).toBe(1);
      fixture.store.db.exec('DROP TRIGGER fail_review');
    }
  });
});

describe('schema 2 upgrades', () => {
  it('backfills original acknowledgments, keeps only available feedback, and is persistent and repeatable', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'fieldwork-history-'));
    const path = join(directory, 'upgrade.sqlite');
    await fixture.app.close();
    fixture = await buildApp({ databasePath: path, rateLimits: false });
    seed(fixture.store);
    manager = await login('manager');
    worker = await login('worker');
    const first = (await submit(input(1))).json() as WorkOrder;
    await review(2, 'Old feedback overwritten in schema 1.');
    const second = (await submit(input(3, 'Corrected report.'))).json() as WorkOrder;
    const current = await review(4, 'Current feedback.', 'APPROVED');
    const fallback = {
      ...first,
      id: 'demo-2',
      assignee: fixture.store.getUser('worker-2')!,
      report: { ...first.report!, id: randomUUID() },
    };
    fixture.store.writeOrder(fallback);
    const tables = ['users', 'sessions', 'catalog', 'work_orders', 'mutations', 'photos', 'audit'];
    const before = tables.map((table) => fixture.store.db.prepare(`SELECT * FROM ${table}`).all());
    fixture.store.db.exec(
      'DROP TABLE password_resets; DROP TABLE worker_access_events; DROP TABLE worker_access; DROP TABLE invitations; DROP TABLE order_series_members; DROP TABLE order_series; DROP TABLE report_revisions; DELETE FROM migrations WHERE version>1;',
    );
    await fixture.app.close();
    const upgraded = openStore(path);
    try {
      const page = upgraded.reportHistory('demo-1', 10)!;
      expect(page.data.map((revision) => revision.snapshot.report)).toEqual([
        second.report,
        first.report,
      ]);
      expect(page.data.map((revision) => revision.submissionVersion)).toEqual([4, 2]);
      expect(page.data[0].review).toEqual(current.review);
      expect(page.data[1].review).toBeNull();
      expect(page.data[1].reviewStatus).toBe('not_retained');
      expect(upgraded.reportHistory('demo-2', 10)!.data[0]).toMatchObject({
        source: 'saved_snapshot',
        submissionVersion: null,
        reviewStatus: 'awaiting_review',
        snapshot: { report: { submittedBy: 'worker' }, assignee: { id: 'worker-2' } },
      });
      expect(tables.map((table) => upgraded.db.prepare(`SELECT * FROM ${table}`).all())).toEqual(
        before,
      );
      expect(
        upgraded.db
          .prepare('SELECT version FROM migrations ORDER BY version')
          .all()
          .map((row) => row.version),
      ).toEqual([1, 2, 3, 4, 5, 6]);
    } finally {
      upgraded.db.close();
    }
    const reopened = openStore(path);
    try {
      expect(reopened.reportHistory('demo-1', 10)!.total).toBe(2);
      const previous = reopened.reportHistory('demo-1', 10)!.data[0];
      const next = {
        ...current,
        version: 6,
        report: { ...current.report!, id: randomUUID(), summary: 'Saved after upgrade.' },
        review: null,
        status: 'SUBMITTED' as const,
      };
      reopened.transaction(() => {
        reopened.writeOrder(next);
        reopened.recordSubmission(next);
      });
      expect(reopened.reportHistory('demo-1', 10)!.data[1]).toEqual(previous);
    } finally {
      reopened.db.close();
      rmSync(directory, { recursive: true, force: true });
      fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
    }
  });

  it('rolls back schema creation and closes the database when a legacy acknowledgment is invalid', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fieldwork-history-invalid-'));
    const path = join(directory, 'upgrade.sqlite');
    const legacy = openStore(path);
    seed(legacy);
    legacy.db.exec(
      'DROP TABLE password_resets; DROP TABLE worker_access_events; DROP TABLE worker_access; DROP TABLE invitations; DROP TABLE order_series_members; DROP TABLE order_series; DROP TABLE report_revisions; DELETE FROM migrations WHERE version>1;',
    );
    legacy.db
      .prepare('INSERT INTO mutations VALUES(?,?,?,?)')
      .run('worker', randomUUID(), 'test-hash', '{}');
    legacy.db.close();
    try {
      expect(() => openStore(path)).toThrow();
      const db = new DatabaseSync(path);
      try {
        expect(
          db
            .prepare('SELECT version FROM migrations')
            .all()
            .map((row) => row.version),
        ).toEqual([1]);
        expect(
          db.prepare("SELECT name FROM sqlite_master WHERE name='report_revisions'").get(),
        ).toBeUndefined();
        expect(db.prepare('SELECT response FROM mutations').get()!.response).toBe('{}');
      } finally {
        db.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
