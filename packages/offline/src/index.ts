import type { Draft, ReportInput, WorkOrder } from '@fieldwork/contracts';

export interface StorageAdapter {
  read(): Promise<State | null>;
  write(state: State): Promise<void>;
  transact?(change: (state: State) => State): Promise<void>;
}
export type PendingReport = {
  orderId: string;
  input: ReportInput;
  createdAt: string;
  state: 'pending' | 'blocked';
  error?: string;
};
export type State = {
  schemaVersion: 1;
  orders: WorkOrder[];
  drafts: Record<string, Draft>;
  outbox: PendingReport[];
  lastSynced: string | null;
};
export const emptyState = (): State => ({
  schemaVersion: 1,
  orders: [],
  drafts: {},
  outbox: [],
  lastSynced: null,
});
export function createOfflineRepository(
  storage: StorageAdapter,
  send: (orderId: string, input: ReportInput) => Promise<WorkOrder>,
) {
  let writing = Promise.resolve();
  let flushing: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const read = async () => {
    await writing;
    const state = await storage.read();
    if (state && state.schemaVersion !== 1)
      throw new Error('Unsupported local data version. Export your drafts before upgrading.');
    return state ?? emptyState();
  };
  function update(change: (state: State) => State) {
    const operation = writing.then(async () => {
      if (storage.transact) await storage.transact(change);
      else await storage.write(change((await storage.read()) ?? emptyState()));
      listeners.forEach((listener) => listener());
    });
    writing = operation.catch(() => {});
    return operation;
  }
  async function runFlush() {
    while (true) {
      const item = (await read()).outbox.find((item) => item.state === 'pending');
      if (!item) return;
      try {
        const order = await send(item.orderId, item.input);
        await update((state) => ({
          ...state,
          orders: [order, ...state.orders.filter((existing) => existing.id !== order.id)],
          drafts: Object.fromEntries(
            Object.entries(state.drafts).filter(([id]) => id !== order.id),
          ),
          outbox: state.outbox.filter(
            (queued) => queued.input.mutationId !== item.input.mutationId,
          ),
          lastSynced: new Date().toISOString(),
        }));
      } catch (error) {
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? Number(error.status)
            : 0;
        const message =
          error instanceof Error ? error.message : 'Unable to sync. Try again when connected.';
        const blocked = status >= 400 && status < 500 && status !== 401 && status !== 429;
        await update((state) => ({
          ...state,
          outbox: state.outbox.map((queued) =>
            queued.input.mutationId === item.input.mutationId
              ? { ...queued, state: blocked ? 'blocked' : 'pending', error: message }
              : queued,
          ),
        }));
        if (!blocked) return;
      }
    }
  }
  return {
    read,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    saveDraft(orderId: string, draft: Draft) {
      return update((state) => ({ ...state, drafts: { ...state.drafts, [orderId]: draft } }));
    },
    cacheOrders(orders: WorkOrder[]) {
      return update((state) => {
        const cached = new Map(state.orders.map((order) => [order.id, order]));
        return {
          ...state,
          orders: orders.map((order) => {
            const existing = cached.get(order.id);
            return existing && existing.version > order.version ? existing : order;
          }),
          lastSynced: new Date().toISOString(),
        };
      });
    },
    cacheOrder(order: WorkOrder) {
      return update((state) => ({
        ...state,
        orders: state.orders.some((existing) => existing.id === order.id)
          ? state.orders.map((existing) =>
              existing.id === order.id && existing.version <= order.version ? order : existing,
            )
          : [...state.orders, order],
      }));
    },
    enqueue(orderId: string, input: ReportInput) {
      return update((state) => {
        if (state.outbox.some((item) => item.orderId === orderId))
          throw new Error(
            'This order already has a queued report. Resolve it before submitting another.',
          );
        return {
          ...state,
          outbox: [
            ...state.outbox,
            { orderId, input, createdAt: new Date().toISOString(), state: 'pending' },
          ],
        };
      });
    },
    discard(orderId: string) {
      return update((state) => ({
        ...state,
        outbox: state.outbox.filter((item) => item.orderId !== orderId),
      }));
    },
    flush() {
      if (!flushing)
        flushing = runFlush().finally(() => {
          flushing = undefined;
        });
      return flushing;
    },
  };
}
export type OfflineRepository = ReturnType<typeof createOfflineRepository>;
