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
  type ReportInput,
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
  const template = await manager.createTemplate('Synthetic mixed inspection', [
    'Check the gate',
    { label: 'Record the serial number', responseType: 'text' },
  ]);
  const order = await manager.createOrder({
    title: 'Typed response fixture',
    instructions: '',
    siteId: 'north',
    templateId: template.id,
    assigneeId: 'worker',
    dueDate: '2026-12-28',
    priority: 'routine',
  });
  const input: ReportInput = {
    mutationId: randomUUID(),
    baseVersion: 1,
    answers: [
      { itemId: template.items[0].id, value: 'pass', note: '' },
      {
        itemId: template.items[1].id,
        value: 'text',
        text: 'SERIAL-0042\nSynthetic equipment.',
        note: 'Read from the label.',
      },
    ],
    summary: 'Synthetic typed inspection.',
    photos: [],
  };
  return { template, order, input };
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

describe('text checklist fields', () => {
  it('creates mixed snapshots through the SDK without changing legacy item or answer shapes', async () => {
    const { template, order, input } = await assignment();
    expect(template.items[0]).not.toHaveProperty('responseType');
    expect(template.items[1].responseType).toBe('text');
    expect(order.template).toEqual(template);
    const draft = blankDraft(order);
    expect(draft.answers[0]).toEqual({ itemId: template.items[0].id, value: '', note: '' });
    expect(draft.answers[1]).toEqual({
      itemId: template.items[1].id,
      value: 'text',
      text: '',
      note: '',
    });
    expect(draft.answers.filter(answerComplete)).toHaveLength(0);
    expect(DraftSchema.parse(draft)).toEqual(draft);
    expect(ReportInputSchema.parse(input).answers[0]).not.toHaveProperty('text');
    expect(answerComplete(input.answers[1])).toBe(true);
    expect(answerComplete({ ...draft.answers[1], text: '  \n ' })).toBe(false);
    fixture.store.db
      .prepare('UPDATE catalog SET data=? WHERE id=1')
      .run(JSON.stringify({ sites: fixture.store.catalog().sites, templates: [] }));
    expect((await worker.order(order.id)).template).toEqual(template);
  });

  it.each([undefined, '', '   \n', 'x'.repeat(1001)])(
    'rejects an incomplete or oversized text response %s',
    (text) => {
      expect(
        AnswerSchema.safeParse({ itemId: 'text', value: 'text', text, note: '' }).success,
      ).toBe(false);
    },
  );

  it('preserves text exactly and rejects text attached to a pass/fail answer', () => {
    const answer = {
      itemId: 'text',
      value: 'text' as const,
      text: '  SERIAL-0042\nSecond line  ',
      note: '',
    };
    expect(AnswerSchema.parse(answer)).toEqual(answer);
    expect(answerLabel(answer)).toBe(answer.text);
    expect(AnswerSchema.safeParse({ ...answer, value: 'pass' }).success).toBe(false);
  });

  it('enforces item response types, coverage and permissions before persisting a report', async () => {
    const { order, input } = await assignment();
    const before = fixture.store.db.prepare('SELECT COUNT(*) AS n FROM mutations').get();
    await expect(
      worker.submitReport(order.id, {
        ...input,
        answers: input.answers.map((answer) => ({
          itemId: answer.itemId,
          value: 'pass',
          note: '',
        })),
      }),
    ).rejects.toMatchObject({ status: 422, code: 'CHECKLIST' });
    await expect(
      worker.submitReport(order.id, {
        ...input,
        answers: input.answers.map((answer) => ({ ...answer, value: 'text', text: 'Wrong kind' })),
      }),
    ).rejects.toMatchObject({ status: 422, code: 'CHECKLIST' });
    await expect(
      worker.submitReport(order.id, { ...input, answers: [input.answers[1], input.answers[1]] }),
    ).rejects.toMatchObject({ status: 422, code: 'CHECKLIST' });
    await expect(manager.submitReport(order.id, input)).rejects.toMatchObject({ status: 403 });
    await expect(client().submitReport(order.id, input)).rejects.toMatchObject({ status: 401 });
    expect((await worker.order(order.id)).version).toBe(1);
    expect(fixture.store.db.prepare('SELECT COUNT(*) AS n FROM mutations').get()).toEqual(before);
    expect((await manager.reportHistory(order.id)).total).toBe(0);
  });

  it('keeps a text draft and the exact queued input after a lost response, then acknowledges only once', async () => {
    const { order, input } = await assignment();
    const storage = memory();
    const send = vi
      .fn()
      .mockImplementationOnce(async (id, report) => {
        await worker.submitReport(id, report);
        throw new Error('Synthetic lost response');
      })
      .mockImplementation((id, report) => worker.submitReport(id, report));
    const repo = createOfflineRepository(storage, send);
    await repo.cacheOrder(order);
    await repo.saveDraft(order.id, { answers: input.answers, summary: input.summary, photos: [] });
    await repo.enqueue(order.id, input);
    await repo.flush();
    const pending = await repo.read();
    expect(pending.outbox[0]).toMatchObject({ state: 'pending', input });
    expect(pending.drafts[order.id].answers[1].text).toBe(input.answers[1].text);
    expect(localReportExport(pending, order.id).queuedReport?.input).toEqual(input);
    await createOfflineRepository(storage, send).flush();
    expect((await repo.read()).outbox).toEqual([]);
    expect((await repo.read()).drafts[order.id]).toBeUndefined();
    expect((await manager.reportHistory(order.id)).total).toBe(1);
    expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
    await expect(
      worker.submitReport(order.id, {
        ...input,
        answers: input.answers.map((answer) =>
          answer.value === 'text' ? { ...answer, text: 'Changed content' } : answer,
        ),
      }),
    ).rejects.toMatchObject({ status: 422, code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('retains a blocked text draft after a newer assignment version and locally rejects wrong types', async () => {
    const { order, input } = await assignment();
    const repo = createOfflineRepository(memory(), (id, report) => worker.submitReport(id, report));
    await repo.cacheOrder(order);
    await repo.saveDraft(order.id, { answers: input.answers, summary: input.summary, photos: [] });
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
    await repo.enqueue(order.id, input);
    await manager.rescheduleOrder(order.id, { baseVersion: 1, dueDate: '2026-12-29' });
    await repo.flush();
    expect((await repo.read()).outbox[0]).toMatchObject({ input, state: 'blocked' });
    expect((await repo.read()).drafts[order.id]).toEqual(before.drafts[order.id]);
    expect((await manager.reportHistory(order.id)).total).toBe(0);
  });

  it('retains submitted text, correction revisions and retry receipts through a SQLite restart', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'fieldwork-text-'));
    await fixture.app.close();
    fixture = await buildApp({ databasePath: join(folder, 'test.sqlite'), rateLimits: false });
    seed(fixture.store);
    manager = client((await client().login('manager@fieldwork.local', 'fieldwork-demo')).token);
    worker = client((await client().login('worker@fieldwork.local', 'fieldwork-demo')).token);
    const { order, input } = await assignment();
    const submitted = await worker.submitReport(order.id, input);
    await manager.review(order.id, submitted.version, 'CHANGES_REQUESTED', 'Verify the label.');
    const correction = {
      ...input,
      mutationId: randomUUID(),
      baseVersion: 3,
      answers: input.answers.map((answer) =>
        answer.value === 'text' ? { ...answer, text: 'SERIAL-0043' } : answer,
      ),
    };
    await worker.submitReport(order.id, correction);
    await fixture.app.close();
    fixture = await buildApp({ databasePath: join(folder, 'test.sqlite'), rateLimits: false });
    try {
      expect(await worker.submitReport(order.id, input)).toEqual(submitted);
      const history = await manager.reportHistory(order.id);
      expect(history.total).toBe(2);
      expect(history.data[0].snapshot.report.answers[1].text).toBe('SERIAL-0043');
      expect(history.data[1].snapshot.report.answers[1].text).toBe(input.answers[1].text);
      expect((await worker.order(order.id)).report?.answers[1].text).toBe('SERIAL-0043');
    } finally {
      await fixture.app.close();
      rmSync(folder, { recursive: true, force: true });
      fixture = await buildApp({ databasePath: ':memory:', rateLimits: false });
    }
  });

  it('exports text as spreadsheet-safe cell content instead of a result code', async () => {
    const { order, input } = await assignment();
    input.answers[1].text = '=1+1\nSynthetic "label"';
    const submitted = await worker.submitReport(order.id, input);
    const csv = reportCsv([submitted]);
    expect(csv).toContain('"\t=1+1\nSynthetic ""label"""');
    expect(csv).not.toContain('"text"');
    expect(csv).toContain('"pass"');
  });
});
