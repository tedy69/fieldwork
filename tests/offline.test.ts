import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createOfflineRepository,
  emptyState,
  type State,
  type StorageAdapter,
} from '@fieldwork/offline';
import type { WorkOrder, ReportInput } from '@fieldwork/contracts';
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
describe('durable outbox', () => {
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
    const draft = { answers: payload.answers, summary: payload.summary, photos: payload.photos };
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
