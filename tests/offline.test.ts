import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createOfflineRepository,
  emptyState,
  localReportExport,
  type State,
  type StorageAdapter,
} from '@fieldwork/offline';
import { DraftSchema, type WorkOrder, type ReportInput } from '@fieldwork/contracts';
const input = (): ReportInput => ({
  mutationId: randomUUID(),
  baseVersion: 1,
  answers: [{ itemId: 'check', value: 'pass', note: '' }],
  summary: 'Access checked.',
  photos: [],
});
const order = (id: string): WorkOrder => ({
  id,
  reference: id,
  title: 'Inspection',
  instructions: '',
  version: 2,
  status: 'SUBMITTED',
  priority: 'routine',
  dueDate: '2026-10-22',
  createdAt: '',
  review: null,
  report: null,
  site: { id: 'site', name: 'Site', address: '' },
  assignee: { id: 'worker', name: 'Worker', email: 'worker@example.com', role: 'worker' },
  template: { id: 'template', name: 'Safety', items: [{ id: 'check', label: 'Check access' }] },
});
function memory() {
  let state: State | null = null;
  const storage: StorageAdapter = {
    read: async () => structuredClone(state),
    write: async (value) => {
      state = structuredClone(value);
    },
  };
  return storage;
}
describe('local report export', () => {
  it('exports only the selected incomplete draft and strips account and report metadata', () => {
    const selected = order('selected');
    selected.report = {
      id: 'server-report',
      submittedAt: '',
      submittedBy: 'Another person',
      answers: [],
      summary: 'Private server report',
      photos: [],
    };
    const state = {
      ...emptyState(),
      orders: [selected, order('unrelated')],
      drafts: {
        selected: {
          answers: [{ itemId: 'check', value: '' as const, note: 'Gate needs checking.' }],
          summary: '',
          photos: [{ id: randomUUID(), mimeType: 'image/png' as const, data: 'photo-data' }],
          token: 'never-export-this',
        },
        unrelated: { answers: [], summary: 'Unrelated data', photos: [] },
      },
      token: 'session-secret',
    };
    const before = structuredClone(state);
    const file = localReportExport(state, 'selected', new Date('2026-11-03T12:00:00Z'));
    expect(file).toMatchObject({
      format: 'fieldwork-local-report',
      formatVersion: 1,
      exportedAt: '2026-11-03T12:00:00.000Z',
      orderId: 'selected',
      assignment: { reference: 'selected', template: selected.template },
      draft: {
        answers: [{ value: '', note: 'Gate needs checking.' }],
        photos: state.drafts.selected.photos,
      },
      queuedReport: null,
    });
    for (const value of [
      'token',
      'worker@example.com',
      'Private server report',
      'Unrelated data',
      'never-export-this',
      'session-secret',
    ])
      expect(JSON.stringify(file)).not.toContain(value);
    expect(state).toEqual(before);
    file.draft!.summary = 'Changed file';
    expect(state).toEqual(before);
  });

  it('retains the exact blocked payload, even when the assignment and draft are unavailable', async () => {
    const storage = memory();
    const payload = input();
    payload.photos = [{ id: randomUUID(), mimeType: 'image/png', data: 'queued-photo' }];
    const original: State = {
      ...emptyState(),
      outbox: [
        {
          orderId: 'gone',
          input: payload,
          createdAt: '2026-11-03T12:00:00Z',
          state: 'blocked',
          error: 'Newer server version.',
        },
      ],
    };
    await storage.write(original);
    const write = vi.spyOn(storage, 'write');
    const send = vi.fn();
    const repo = createOfflineRepository(storage, send);
    const file = localReportExport(await repo.read(), 'gone');
    expect(file.assignment).toBeNull();
    expect(file.draft).toBeNull();
    expect(file.queuedReport).toEqual({
      input: payload,
      createdAt: original.outbox[0].createdAt,
      state: 'blocked',
    });
    expect(await repo.read()).toEqual(original);
    expect(write).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('waits for an in-flight save and preserves separate draft and pending submission snapshots', async () => {
    const repo = createOfflineRepository(memory(), vi.fn());
    const payload = input();
    await repo.enqueue('selected', payload);
    const saving = repo.saveDraft('selected', {
      answers: [],
      summary: 'Newer local notes',
      photos: [],
    });
    const file = localReportExport(await repo.read(), 'selected');
    await saving;
    expect(file.draft?.summary).toBe('Newer local notes');
    expect(file.queuedReport?.input).toEqual(payload);
    expect(file.queuedReport?.state).toBe('pending');
  });

  it('rejects an absent or malformed local report without changing storage', () => {
    const state = emptyState();
    expect(() => localReportExport(state, 'missing')).toThrow('No local draft');
    state.drafts.bad = {
      answers: [],
      summary: '',
      photos: [{ id: 'invalid', mimeType: 'image/png', data: 'data' }],
    };
    const before = structuredClone(state);
    expect(() => localReportExport(state, 'bad')).toThrow();
    expect(state).toEqual(before);
  });
});
describe('durable outbox', () => {
  it('retains an older client queue and draft when the server reports missing photo evidence', async () => {
    const storage = memory();
    const original = order('legacy-evidence');
    const payload = input();
    const draft = DraftSchema.parse(payload);
    await storage.write({
      ...emptyState(),
      orders: [original],
      drafts: { [original.id]: draft },
      outbox: [
        {
          orderId: original.id,
          input: payload,
          state: 'pending',
          createdAt: '2026-10-23T00:00:00Z',
        },
      ],
    });
    const send = vi
      .fn()
      .mockRejectedValue(
        Object.assign(
          new Error('Attach at least one site photo before submitting this checklist.'),
          { status: 422 },
        ),
      );
    const repo = createOfflineRepository(storage, send);
    await repo.flush();
    expect((await repo.read()).outbox[0]).toMatchObject({
      input: payload,
      state: 'blocked',
      error: 'Attach at least one site photo before submitting this checklist.',
    });
    expect((await repo.read()).drafts[original.id]).toEqual(draft);
    const upgraded = { ...original, template: { ...original.template, requiresPhoto: true } };
    await repo.cacheOrder(upgraded);
    await repo.discard(original.id);
    await expect(repo.enqueue(original.id, payload)).rejects.toThrow(
      'Attach at least one site photo',
    );
    expect((await repo.read()).drafts[original.id]).toEqual(draft);
  });
  it('keeps a photo-required draft when queueing without evidence fails, then persists a valid report across restart', async () => {
    const storage = memory();
    const send = vi.fn().mockRejectedValue(new Error('Offline'));
    const repo = createOfflineRepository(storage, send);
    const required = {
      ...order('evidence'),
      status: 'ASSIGNED' as const,
      template: { ...order('evidence').template, requiresPhoto: true },
    };
    await repo.cacheOrders([required]);
    const payload = { ...input(), baseVersion: required.version };
    const draft = DraftSchema.parse(payload);
    await repo.saveDraft(required.id, draft);
    await expect(repo.enqueue(required.id, payload)).rejects.toThrow(
      'Attach at least one site photo before submitting this checklist.',
    );
    expect((await repo.read()).outbox).toEqual([]);
    expect((await repo.read()).drafts[required.id]).toEqual(draft);
    expect(send).not.toHaveBeenCalled();
    const withPhoto = {
      ...payload,
      photos: [{ id: randomUUID(), mimeType: 'image/png' as const, data: 'synthetic-photo' }],
    };
    await repo.enqueue(required.id, withPhoto);
    const restarted = createOfflineRepository(storage, send);
    expect((await restarted.read()).orders[0].template.requiresPhoto).toBe(true);
    expect((await restarted.read()).outbox[0].input).toEqual(withPhoto);
    await restarted.flush();
    expect((await restarted.read()).outbox[0].input).toEqual(withPhoto);
    expect((await restarted.read()).drafts[required.id]).toEqual(draft);
    send.mockResolvedValueOnce({ ...required, status: 'SUBMITTED', version: 3 });
    await restarted.flush();
    expect((await restarted.read()).outbox).toEqual([]);
    expect(send.mock.calls[0][1].mutationId).toBe(send.mock.calls[1][1].mutationId);
  });
  it('keeps queued reports and unqueued drafts when reassigned work disappears from the active list', async () => {
    const storage = memory();
    const send = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Work order not found.'), { status: 404 }));
    const repo = createOfflineRepository(storage, send);
    const payload = {
      ...input(),
      photos: [{ id: randomUUID(), mimeType: 'image/png' as const, data: 'photo-bytes' }],
    };
    const draft = DraftSchema.parse(payload);
    await repo.cacheOrders([order('one'), order('two')]);
    await repo.saveDraft('one', draft);
    await repo.saveDraft('two', { ...draft, summary: 'Still on this device, never queued.' });
    await repo.enqueue('one', payload);
    await repo.flush();
    await repo.cacheOrders([]);
    const restored = createOfflineRepository(storage, send);
    const state = await restored.read();
    expect(state.orders).toEqual([]);
    expect(state.drafts.one).toEqual(draft);
    expect(state.drafts.two.summary).toBe('Still on this device, never queued.');
    expect(state.outbox).toEqual([expect.objectContaining({ input: payload, state: 'blocked' })]);
    await restored.flush();
    expect(send).toHaveBeenCalledTimes(1);
    await restored.cacheOrder({ ...order('one'), version: 4, status: 'ASSIGNED' });
    await restored.discard('one');
    expect((await restored.read()).drafts.one).toEqual(draft);
  });
  it('merges a confirmed order without losing another order, draft photos, or queued reports', async () => {
    const storage = memory();
    const repo = createOfflineRepository(storage, async () => order('one'));
    await repo.cacheOrders([order('one'), order('two')]);
    const payload = input();
    await repo.enqueue('one', payload);
    const draft = {
      answers: [],
      summary: 'Unsent schedule draft',
      photos: [{ id: randomUUID(), data: 'photo', mimeType: 'image/png' as const }],
    };
    await Promise.all([
      repo.cacheOrder({ ...order('one'), dueDate: '2026-10-25', version: 3 }),
      repo.saveDraft('one', draft),
    ]);
    const restored = await createOfflineRepository(storage, async () => order('one')).read();
    expect(restored.orders).toEqual([
      { ...order('one'), dueDate: '2026-10-25', version: 3 },
      order('two'),
    ]);
    expect(restored.drafts.one).toEqual(draft);
    expect(restored.outbox[0].input).toEqual(payload);
  });
  it('does not replace a newer cached version with a late response', async () => {
    const repo = createOfflineRepository(memory(), async () => order('one'));
    await repo.cacheOrder({ ...order('one'), version: 4 });
    await repo.cacheOrder({ ...order('one'), version: 3, dueDate: '2026-10-25' });
    expect((await repo.read()).orders).toEqual([{ ...order('one'), version: 4 }]);
  });
  it('keeps a confirmed schedule when an older list request finishes later, while removing absent records', async () => {
    const repo = createOfflineRepository(memory(), async () => order('one'));
    await repo.cacheOrders([order('one'), order('removed')]);
    const updated = { ...order('one'), version: 3, dueDate: '2026-10-25' };
    await repo.cacheOrder(updated);
    await repo.cacheOrders([order('one'), order('two')]);
    expect((await repo.read()).orders).toEqual([updated, order('two')]);
  });
  it('survives a repository restart with drafts and attachments intact', async () => {
    const storage = memory();
    const send = vi.fn(async () => order('one'));
    const repo = createOfflineRepository(storage, send);
    const payload = input();
    await repo.saveDraft('one', {
      answers: [],
      summary: 'Unsent draft',
      photos: [{ id: randomUUID(), data: 'photo', mimeType: 'image/png' }],
    });
    await repo.enqueue('one', payload);
    const restored = createOfflineRepository(storage, send);
    expect((await restored.read()).drafts.one.photos[0].data).toBe('photo');
    expect((await restored.read()).outbox[0].input.mutationId).toBe(payload.mutationId);
    await restored.flush();
    expect((await restored.read()).outbox).toEqual([]);
    expect((await restored.read()).drafts.one).toBeUndefined();
  });
  it('retains the original submission ID after an uncertain network outcome', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce(order('one'));
    const repo = createOfflineRepository(memory(), send);
    const payload = input();
    await repo.enqueue('one', payload);
    await repo.flush();
    expect((await repo.read()).outbox).toHaveLength(1);
    await repo.flush();
    expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
    expect((await repo.read()).outbox).toEqual([]);
  });
  it('keeps conflicts for review and continues syncing unrelated work', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Order changed'), { status: 409 }))
      .mockResolvedValueOnce(order('two'));
    const repo = createOfflineRepository(memory(), send);
    await repo.enqueue('one', input());
    await repo.enqueue('two', input());
    await repo.flush();
    const state = await repo.read();
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0].state).toBe('blocked');
    expect(state.outbox[0].orderId).toBe('one');
    await repo.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not discard reports when authentication expires', async () => {
    const repo = createOfflineRepository(memory(), async () => {
      throw Object.assign(new Error('Sign in again'), { status: 401 });
    });
    await repo.enqueue('one', input());
    await repo.flush();
    expect((await repo.read()).outbox[0].state).toBe('pending');
  });
  it('shares concurrent flushes and preserves work queued during a request', async () => {
    let resolve!: (value: WorkOrder) => void;
    const first = new Promise<WorkOrder>((done) => {
      resolve = done;
    });
    const send = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(order('two'));
    const repo = createOfflineRepository(memory(), send);
    await repo.enqueue('one', input());
    const flush = repo.flush();
    const duplicate = repo.flush();
    expect(duplicate).toBe(flush);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await repo.enqueue('two', input());
    resolve(order('one'));
    await flush;
    expect(send).toHaveBeenCalledTimes(2);
    expect((await repo.read()).outbox).toEqual([]);
  });
  it('rejects a second queued report for the same order', async () => {
    const repo = createOfflineRepository(memory(), async () => order('one'));
    await repo.enqueue('one', input());
    await expect(repo.enqueue('one', input())).rejects.toThrow('already has a queued report');
    expect((await repo.read()).outbox).toHaveLength(1);
  });
  it('preserves a draft when a blocked submission is removed for editing', async () => {
    const repo = createOfflineRepository(memory(), async () => order('one'));
    await repo.saveDraft('one', { answers: [], summary: 'Keep this', photos: [] });
    await repo.enqueue('one', input());
    await repo.discard('one');
    expect((await repo.read()).drafts.one.summary).toBe('Keep this');
  });
  it('reopens the same blocked report with a fresh assignment and retains the full draft', async () => {
    const storage = memory();
    const original = { ...order('one'), version: 1, status: 'ASSIGNED' as const };
    const latest = { ...original, version: 2, dueDate: '2026-10-23' };
    const payload = input();
    const draft = {
      answers: [{ itemId: 'check', value: 'pass' as const, note: '' }],
      summary: payload.summary,
      photos: [{ id: randomUUID(), mimeType: 'image/png' as const, data: 'draft-photo' }],
    };
    payload.photos = draft.photos;
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Try again'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('Order changed'), { status: 409 }))
      .mockResolvedValueOnce(order('one'));
    const repo = createOfflineRepository(storage, send);
    await repo.cacheOrder(original);
    await repo.saveDraft(original.id, draft);
    await repo.enqueue(original.id, payload);
    await repo.flush();
    await repo.flush();
    expect(send.mock.calls.slice(0, 2)).toEqual([
      [original.id, payload],
      [original.id, payload],
    ]);
    const blocked = await repo.read();

    vi.spyOn(storage, 'write').mockRejectedValueOnce(new Error('Could not write'));
    await expect(repo.reopenBlocked(latest, payload.mutationId)).rejects.toThrow('Could not write');
    expect(await repo.read()).toEqual(blocked);
    await repo.reopenBlocked(latest, payload.mutationId);
    expect(await repo.read()).toMatchObject({
      orders: [latest],
      drafts: { one: draft },
      outbox: [],
    });
    const replacement = { ...payload, mutationId: randomUUID(), baseVersion: latest.version };
    await repo.enqueue(original.id, replacement);
    await repo.flush();
    expect(send).toHaveBeenLastCalledWith(original.id, replacement);
    expect((await repo.read()).outbox).toEqual([]);
  });

  it.each([
    'different mutation',
    'missing draft',
    'pending report',
    'already submitted',
    'newer submitted snapshot',
  ])('retains the report when reopening with %s', async (reason) => {
    const storage = memory();
    const latest = {
      ...order('one'),
      status: reason === 'already submitted' ? ('SUBMITTED' as const) : ('ASSIGNED' as const),
    };
    const payload = input();
    const state: State = {
      ...emptyState(),
      orders: reason === 'newer submitted snapshot' ? [{ ...order(latest.id), version: 3 }] : [],
      drafts: reason === 'missing draft' ? {} : { one: { answers: [], summary: '', photos: [] } },
      outbox: [
        {
          orderId: latest.id,
          input: payload,
          createdAt: new Date().toISOString(),
          state: reason === 'pending report' ? 'pending' : 'blocked',
        },
      ],
    };
    await storage.write(state);
    const repo = createOfflineRepository(storage, vi.fn());
    const mutationId = reason === 'different mutation' ? randomUUID() : payload.mutationId;
    await expect(repo.reopenBlocked(latest, mutationId)).rejects.toThrow('could not be reopened');
    expect(await repo.read()).toEqual(state);
  });

  it('uses adapter transactions for atomic browser writes', async () => {
    let state = emptyState();
    const transact = vi.fn(async (change: (state: State) => State) => {
      state = change(state);
    });
    const write = vi.fn();
    const repo = createOfflineRepository({ read: async () => state, write, transact }, async () =>
      order('one'),
    );
    await repo.enqueue('one', input());
    expect(transact).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });
});
