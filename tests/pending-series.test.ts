import { expect, it } from 'vitest';
import {
  pendingSeriesFor,
  PendingDispatchError,
  type DispatchStorage,
} from '../apps/web/src/pending-series';
import type { CreateOrderSeries } from '@fieldwork/contracts';

const input: CreateOrderSeries = {
  mutationId: '7f801668-8c5c-4f48-9262-3cc91ba4b1bd',
  title: 'Gate inspection',
  instructions: '',
  siteId: 'north',
  templateId: 'routine',
  assigneeId: 'worker',
  dueDate: '2026-12-28',
  frequency: 'weekly',
  occurrences: 3,
  priority: 'routine',
};
function fixture() {
  const data = new Map<string, unknown>();
  let fail = false;
  let queue: Promise<void> = Promise.resolve();
  const storage: DispatchStorage = {
    read: async (key) => {
      await queue;
      if (fail) throw new Error('Storage unavailable');
      return structuredClone(data.get(key));
    },
    change: (key, apply) => {
      const work = queue.then(() => {
        if (fail) throw new Error('Storage unavailable');
        const result = apply(structuredClone(data.get(key)));
        data.set(key, structuredClone(result));
      });
      queue = work.catch(() => {});
      return work;
    },
  };
  return {
    data,
    storage,
    setFailure: (value: boolean) => {
      fail = value;
    },
  };
}
it('retains a validated pending batch through a new journal instance and isolates accounts', async () => {
  const { storage } = fixture();
  const journal = pendingSeriesFor('manager', storage);
  expect(await journal.read()).toBeNull();
  await journal.reserve(input);
  expect(await pendingSeriesFor('manager', storage).read()).toEqual(input);
  expect(await pendingSeriesFor('another-manager', storage).read()).toBeNull();
  await journal.reserve(input);
  expect(await journal.clear(input.mutationId)).toBeNull();
  expect(await journal.read()).toBeNull();
});
it('serializes competing tabs and keeps the winning batch instead of overwriting it', async () => {
  const { storage } = fixture();
  const first = pendingSeriesFor('manager', storage);
  const second = pendingSeriesFor('manager', storage);
  const different = { ...input, mutationId: '1e820bcf-aa5c-42cf-a2f3-0dccd72c6f11' };
  const results = await Promise.allSettled([first.reserve(input), second.reserve(different)]);
  expect(results[0].status).toBe('fulfilled');
  expect(results[1].status).toBe('rejected');
  if (results[1].status === 'rejected')
    expect(results[1].reason).toBeInstanceOf(PendingDispatchError);
  expect(await second.read()).toEqual(input);
  expect(await second.clear(different.mutationId)).toEqual(input);
  expect(await first.read()).toEqual(input);
  await first.clear(input.mutationId);
  await second.reserve(different);
  expect(await first.clear(input.mutationId)).toEqual(different);
});
it('rejects a changed payload under the same ID and rejects malformed new requests', async () => {
  const { storage } = fixture();
  const journal = pendingSeriesFor('manager', storage);
  await journal.reserve(input);
  await expect(journal.reserve({ ...input, occurrences: 4 })).rejects.toBeInstanceOf(
    PendingDispatchError,
  );
  await expect(journal.reserve({ ...input, occurrences: 100 })).rejects.toThrow();
  expect(await journal.read()).toEqual(input);
});
it('does not hide unreadable saved data or turn a storage failure into a successful save/clear', async () => {
  const { storage, data, setFailure } = fixture();
  const journal = pendingSeriesFor('manager', storage);
  data.set('fieldwork:dispatch:v1:manager', { broken: true });
  await expect(journal.read()).rejects.toThrow('could not be read');
  await expect(journal.reserve(input)).rejects.toThrow('could not be read');
  await expect(journal.clear(input.mutationId)).rejects.toThrow('could not be read');
  expect(data.get('fieldwork:dispatch:v1:manager')).toEqual({ broken: true });
  data.clear();
  setFailure(true);
  await expect(journal.reserve(input)).rejects.toThrow('Storage unavailable');
  expect(data.size).toBe(0);
  setFailure(false);
  await journal.reserve(input);
  setFailure(true);
  await expect(journal.clear(input.mutationId)).rejects.toThrow('Storage unavailable');
  setFailure(false);
  expect(await journal.read()).toEqual(input);
});
