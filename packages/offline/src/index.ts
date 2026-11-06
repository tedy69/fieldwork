import type { Draft, ReportInput, WorkOrder } from '@fieldwork/contracts';
import {
  LocalReportExportSchema,
  reportPhotoError,
  answersMatchTemplate,
  reportReadingError,
  ReportInputSchema,
} from '@fieldwork/contracts';

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
/** Find queued reports using data already available on the originating device. */
export function searchQueuedReports(
  orders: WorkOrder[],
  outbox: PendingReport[],
  search: string,
  onlyBlocked = false,
) {
  const query = search.trim().toLowerCase();
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  return outbox
    .filter((item) => !onlyBlocked || item.state === 'blocked')
    .map((item) => ({ item, order: ordersById.get(item.orderId) }))
    .filter(
      ({ item, order }) =>
        !query ||
        [order?.reference, order?.title, order?.site.name, item.input.summary, item.orderId].some(
          (value) => value?.toLowerCase().includes(query),
        ),
    );
}
/** Project only the selected local report. Export never acknowledges or changes the queue. */
export function localReportExport(state: State, orderId: string, now = new Date()) {
  const queued = state.outbox.find((item) => item.orderId === orderId);
  return LocalReportExportSchema.parse({
    format: 'fieldwork-local-report',
    formatVersion: 1,
    exportedAt: now.toISOString(),
    orderId,
    assignment: state.orders.find((order) => order.id === orderId) ?? null,
    draft: state.drafts[orderId] ?? null,
    queuedReport: queued
      ? { input: queued.input, createdAt: queued.createdAt, state: queued.state }
      : null,
  });
}
function upsertOrder(orders: WorkOrder[], order: WorkOrder) {
  return orders.some((existing) => existing.id === order.id)
    ? orders.map((existing) =>
        existing.id === order.id && existing.version <= order.version ? order : existing,
      )
    : [...orders, order];
}

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
        orders: upsertOrder(state.orders, order),
      }));
    },
    enqueue(orderId: string, input: ReportInput) {
      return update((state) => {
        if (state.outbox.some((item) => item.orderId === orderId))
          throw new Error(
            'This order already has a queued report. Resolve it before submitting another.',
          );
        const order = state.orders.find((order) => order.id === orderId);
        if (
          order &&
          (order.template.items.some(
            (item) => item.responseType === 'text' || item.responseType === 'number',
          ) ||
            input.answers.some((answer) => answer.value === 'text' || answer.value === 'number')) &&
          (!ReportInputSchema.safeParse(input).success ||
            !answersMatchTemplate(order.template, input.answers))
        )
          throw new Error(
            'Complete each checklist item with its required response type before queueing.',
          );
        const readingError = order && reportReadingError(order.template, input.answers);
        if (readingError) throw new Error(readingError);
        const photoError = order && reportPhotoError(order.template, input.photos);
        if (photoError) throw new Error(photoError.message);
        return {
          ...state,
          outbox: [
            ...state.outbox,
            { orderId, input, createdAt: new Date().toISOString(), state: 'pending' },
          ],
        };
      });
    },
    reopenBlocked(order: WorkOrder, mutationId: string) {
      return update((state) => {
        const item = state.outbox.find((entry) => entry.orderId === order.id);
        const orders = upsertOrder(state.orders, order);
        const current = orders.find((entry) => entry.id === order.id);
        if (
          item?.state !== 'blocked' ||
          item.input.mutationId !== mutationId ||
          !state.drafts[order.id] ||
          !current ||
          current.version < item.input.baseVersion ||
          current.assignee.id !== order.assignee.id ||
          (current.status !== 'ASSIGNED' && current.status !== 'CHANGES_REQUESTED')
        ) {
          throw new Error('The blocked report could not be reopened for editing.');
        }
        return {
          ...state,
          orders,
          outbox: state.outbox.filter((entry) => entry !== item),
        };
      });
    },
    discard(orderId: string) {
      return update((state) => ({
        ...state,
        outbox: state.outbox.filter((item) => item.orderId !== orderId),
      }));
    },
    flush({ afterCurrent = false } = {}) {
      if (!flushing || afterCurrent) {
        const next = (flushing ? flushing.then(runFlush, runFlush) : runFlush()).finally(() => {
          if (flushing === next) flushing = undefined;
        });
        flushing = next;
      }
      return flushing;
    },
  };
}
export type OfflineRepository = ReturnType<typeof createOfflineRepository>;
