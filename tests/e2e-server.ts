import { resolve } from 'node:path';
import { buildApp } from '../apps/api/src/app';
import { seed } from '../apps/api/src/seed';
const { app, store } = await buildApp({
  databasePath: ':memory:',
  webOrigin: 'http://127.0.0.1:4173',
  staticRoot: resolve('apps/web/dist'),
  rateLimits: false,
});
seed(store);
await app.listen({ host: '127.0.0.1', port: 4173 });
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
