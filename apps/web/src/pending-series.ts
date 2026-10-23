import { get, update } from 'idb-keyval';
import { CreateOrderSeriesSchema, type CreateOrderSeries } from '@fieldwork/contracts';

export type DispatchStorage = {
  read(key: string): Promise<unknown>;
  change(key: string, apply: (value: unknown) => unknown): Promise<void>;
};
const browserStorage: DispatchStorage = {
  read: get,
  change: (key, apply) => update(key, apply),
};
export class PendingDispatchError extends Error {
  constructor(public input: CreateOrderSeries) {
    super('Another recurring batch is waiting for confirmation. Review its saved request first.');
  }
}
function parse(value: unknown): CreateOrderSeries | null {
  if (value === undefined || value === null) return null;
  const result = CreateOrderSeriesSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      'The saved dispatch could not be read. Keep this browser data and contact your administrator.',
    );
  return result.data;
}
export function pendingSeriesFor(userId: string, storage = browserStorage) {
  const key = `fieldwork:dispatch:v1:${userId}`;
  return {
    read: async () => parse(await storage.read(key)),
    reserve: async (input: CreateOrderSeries) => {
      const validated = CreateOrderSeriesSchema.parse(input);
      await storage.change(key, (value) => {
        const pending = parse(value);
        if (pending && JSON.stringify(pending) !== JSON.stringify(validated))
          throw new PendingDispatchError(pending);
        return pending ?? validated;
      });
      return validated;
    },
    clear: async (mutationId: string) => {
      let remaining: CreateOrderSeries | null = null;
      await storage.change(key, (value) => {
        const pending = parse(value);
        remaining = pending?.mutationId === mutationId ? null : pending;
        return remaining;
      });
      return remaining;
    },
  };
}
