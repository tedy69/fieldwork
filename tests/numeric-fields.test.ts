import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HTTPMethods } from 'fastify';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
import { createClient } from '@fieldwork/sdk';
import {
  AnswerSchema,
  DraftSchema,
  ReportInputSchema,
  answerComplete,
  answerLabel,
  blankDraft,
  parseReading,
  reportAnswers,
} from '@fieldwork/contracts';
import {
  createOfflineRepository,
  localReportExport,
  type State,
  type StorageAdapter,
} from '@fieldwork/offline';
import { reportCsv } from '../apps/web/src/reportCsv';

let fixture: Awaited<ReturnType<typeof buildApp>>;
const fetcher: typeof fetch = async (url, init) => {
  const parsed = new URL(String(url));
  const response = await fixture.app.inject({
    method: (init?.method ?? 'GET') as HTTPMethods,
    url: parsed.pathname + parsed.search,
    headers: init?.headers as Record<string, string>,
    payload: init?.body as string | undefined,
  });
  return new Response(response.body, { status: response.statusCode });
};
const client = (token?: string) =>
  createClient('https://fieldwork.test', () => token ?? null, fetcher);
let manager: ReturnType<typeof client>;
let worker: ReturnType<typeof client>;
beforeEach(async () => {
  fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
  seed(fixture.store);
  manager = client((await client().login('manager@fieldwork.local', 'fieldwork-demo')).token);
  worker = client((await client().login('worker@fieldwork.local', 'fieldwork-demo')).token);
});
afterEach(async () => {
  await fixture.app.close();
});
async function assignment() {
  const template = await manager.createTemplate('Synthetic meter visit', [
    'Check access',
    { label: 'Equipment serial', responseType: 'text' },
    { label: 'Temperature (C)', responseType: 'number' },
  ]);
  const order = await manager.createOrder({
    title: 'Numeric response fixture',
    instructions: '',
    siteId: 'north',
    templateId: template.id,
    assigneeId: 'worker',
    dueDate: '2026-12-28',
    priority: 'routine',
  });
  const draft = blankDraft(order);
  draft.answers[0].value = 'pass';
  draft.answers[1].text = 'SERIAL-0042';
  draft.answers[2].reading = '-12.50';
  draft.summary = 'Synthetic meter reading.';
  const input = ReportInputSchema.parse({
    ...draft,
    answers: reportAnswers(draft.answers),
    mutationId: randomUUID(),
    baseVersion: order.version,
  });
  return { template, order, draft, input };
}
function memory(): StorageAdapter {
  let state: State | null = null;
  return {
    read: async () => structuredClone(state),
    write: async (next) => {
      state = structuredClone(next);
    },
  };
}

describe('numeric checklist readings', () => {
  it.each([
    ['0', 0],
    ['-12.50', -12.5],
    ['.25', 0.25],
    ['+42', 42],
    [' 3. ', 3],
  ])('accepts decimal input %s without treating zero as unanswered', (raw, number) => {
    const answer = {
      itemId: 'reading',
      value: 'number' as const,
      reading: raw as string,
      note: '',
    };
    expect(parseReading(raw as string)).toBe(number);
    expect(answerComplete(answer)).toBe(true);
    const submitted = reportAnswers([answer])[0];
    expect(submitted.reading).toBe(number);
    expect(answerLabel(submitted)).toBe(String(number));
  });
  it.each(['', ' ', '-', '.', '12,5', '1e3', 'Infinity', 'NaN', '0x10', '1'.repeat(101)])(
    'retains but cannot submit incomplete or unsupported input %s',
    (raw) => {
      const answer = { itemId: 'reading', value: 'number' as const, reading: raw, note: '' };
      expect(parseReading(raw)).toBeNull();
      expect(answerComplete(answer)).toBe(false);
      expect(() => reportAnswers([answer])).toThrow();
      if (raw.length <= 100)
        expect(
          DraftSchema.parse({ answers: [answer], summary: '', photos: [] }).answers[0].reading,
        ).toBe(raw);
    },
  );
  it('rejects missing, nonfinite, string and wrong-kind wire readings', () => {
    for (const reading of [undefined, NaN, Infinity, -Infinity, '3'])
      expect(
        AnswerSchema.safeParse({ itemId: 'a', value: 'number', reading, note: '' }).success,
      ).toBe(false);
    expect(
      AnswerSchema.safeParse({ itemId: 'a', value: 'pass', reading: 3, note: '' }).success,
    ).toBe(false);
    expect(
      AnswerSchema.safeParse({
        itemId: 'a',
        value: 'number',
        reading: 3,
        text: 'Wrong type',
        note: '',
      }).success,
    ).toBe(false);
  });
  it('matches mixed snapshots and enforces permissions and response types without writes', async () => {
    const { template, order, draft, input } = await assignment();
    expect(template.items[0]).not.toHaveProperty('responseType');
    expect(template.items[2].responseType).toBe('number');
    expect(draft.answers[2].reading).toBe('-12.50');
    expect(input.answers[2].reading).toBe(-12.5);
    expect(input.answers[0]).not.toHaveProperty('reading');
    await expect(
      worker.createTemplate('Worker cannot create', [{ label: 'Reading', responseType: 'number' }]),
    ).rejects.toMatchObject({ status: 403 });
    await expect(manager.submitReport(order.id, input)).rejects.toMatchObject({ status: 403 });
    await expect(
      worker.submitReport(order.id, {
        ...input,
        answers: input.answers.map((answer) =>
          answer.value === 'number' ? { itemId: answer.itemId, value: 'pass', note: '' } : answer,
        ),
      }),
    ).rejects.toMatchObject({ status: 422, code: 'CHECKLIST' });
    expect((await manager.reportHistory(order.id)).total).toBe(0);
    expect((await manager.order(order.id)).version).toBe(1);
  });
  it('keeps raw draft precision and exact numeric queue input after a lost acknowledgement', async () => {
    const { order, draft, input } = await assignment();
    const storage = memory();
    const send = vi
      .fn()
      .mockImplementationOnce(async (id, report) => {
        await worker.submitReport(id, report);
        throw new Error('Synthetic lost acknowledgement');
      })
      .mockImplementation((id, report) => worker.submitReport(id, report));
    const repo = createOfflineRepository(storage, send);
    await repo.cacheOrder(order);
    await repo.saveDraft(order.id, draft);
    await repo.enqueue(order.id, input);
    await repo.flush();
    const pending = await repo.read();
    expect(pending.drafts[order.id]).toEqual(draft);
    expect(pending.outbox[0]).toMatchObject({ input, state: 'pending' });
    const file = localReportExport(pending, order.id);
    expect(file.draft?.answers[2].reading).toBe('-12.50');
    expect(file.queuedReport?.input.answers[2].reading).toBe(-12.5);
    await createOfflineRepository(storage, send).flush();
    expect((await repo.read()).outbox).toEqual([]);
    expect((await manager.reportHistory(order.id)).total).toBe(1);
    expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
    await expect(
      worker.submitReport(order.id, {
        ...input,
        answers: input.answers.map((answer) =>
          answer.value === 'number' ? { ...answer, reading: 42 } : answer,
        ),
      }),
    ).rejects.toMatchObject({ status: 422, code: 'IDEMPOTENCY_MISMATCH' });
  });
  it('keeps partial drafts and blocks stale-version numeric reports without data loss', async () => {
    const { order, draft, input } = await assignment();
    const storage = memory();
    const repo = createOfflineRepository(storage, (id, report) => worker.submitReport(id, report));
    await repo.cacheOrder(order);
    const partial = structuredClone(draft);
    partial.answers[2].reading = '-';
    await repo.saveDraft(order.id, partial);
    expect(
      (await createOfflineRepository(storage, worker.submitReport).read()).drafts[order.id],
    ).toEqual(partial);
    const before = await repo.read();
    await expect(
      repo.enqueue(order.id, {
        ...input,
        answers: input.answers.map((answer) => ({
          itemId: answer.itemId,
          value: 'pass',
          note: '',
        })),
      }),
    ).rejects.toThrow('required response type');
    expect(await repo.read()).toEqual(before);
    await repo.saveDraft(order.id, draft);
    await repo.enqueue(order.id, input);
    await manager.rescheduleOrder(order.id, { baseVersion: 1, dueDate: '2026-12-29' });
    await repo.flush();
    expect((await repo.read()).outbox[0]).toMatchObject({ input, state: 'blocked' });
    expect((await repo.read()).drafts[order.id]).toEqual(draft);
    expect((await manager.reportHistory(order.id)).total).toBe(0);
  });
  it('persists zero corrections, numeric revisions and retry receipts across a SQLite restart', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'fieldwork-reading-'));
    await fixture.app.close();
    fixture = await buildApp({ databasePath: join(folder, 'test.sqlite'), rateLimits: false });
    seed(fixture.store);
    manager = client((await client().login('manager@fieldwork.local', 'fieldwork-demo')).token);
    worker = client((await client().login('worker@fieldwork.local', 'fieldwork-demo')).token);
    const { order, input } = await assignment();
    const first = await worker.submitReport(order.id, input);
    await manager.review(order.id, first.version, 'CHANGES_REQUESTED', 'Check the reading.');
    await worker.submitReport(order.id, {
      ...input,
      mutationId: randomUUID(),
      baseVersion: 3,
      answers: input.answers.map((answer) =>
        answer.value === 'number' ? { ...answer, reading: 0 } : answer,
      ),
    });
    await fixture.app.close();
    fixture = await buildApp({ databasePath: join(folder, 'test.sqlite'), rateLimits: false });
    try {
      expect(await worker.submitReport(order.id, input)).toEqual(first);
      const history = await manager.reportHistory(order.id);
      expect(history.total).toBe(2);
      expect(history.data[0].snapshot.report.answers[2].reading).toBe(0);
      expect(history.data[1].snapshot.report.answers[2].reading).toBe(-12.5);
      const latest = await manager.order(order.id);
      expect(reportCsv([first])).toContain('"\t-12.5"');
      expect(reportCsv([latest])).toContain('"0"');
      expect(reportCsv([latest])).not.toContain('"number"');
    } finally {
      await fixture.app.close();
      rmSync(folder, { recursive: true, force: true });
      fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
    }
  });
});
