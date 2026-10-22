import { get, set, update } from 'idb-keyval';
import { createOfflineRepository, emptyState, type State } from '@fieldwork/offline';
import type { Client } from '@fieldwork/sdk';
export function repositoryFor(userId: string, client: Client) {
  const key = `fieldwork:v1:${userId}`;
  return createOfflineRepository(
    {
      read: async () => (await get<State>(key)) ?? null,
      write: async (state) => {
        await set(key, state);
      },
      transact: async (change) => {
        await update<State>(key, (state) => change(state ?? emptyState()));
      },
    },
    client.submitReport,
  );
}
