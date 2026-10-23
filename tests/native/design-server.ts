import { buildApp } from '../../apps/api/src/app';
import { seed } from '../../apps/api/src/seed';
import { z } from 'zod';

// Standalone loopback-only fixture. Never mounted by the production API.
const { app, store } = await buildApp({ databasePath: ':memory:', rateLimits: false });
seed(store);
let available = true;
app.addHook('onRequest', async (request, reply) => {
  if (!available && request.url.startsWith('/api/v1/'))
    return reply
      .status(503)
      .send({ error: { code: 'TEST_OUTAGE', message: 'Synthetic test outage.' } });
});
app.post('/__design-test__/network', async (request) => {
  available = z.object({ available: z.boolean() }).strict().parse(request.body).available;
  return { available };
});
app.get('/__design-test__/state', async () => ({
  fixture: 'synthetic-native-design',
  available,
  order: store.getOrder('demo-1'),
  revisions: store.db
    .prepare("SELECT COUNT(*) AS count FROM report_revisions WHERE order_id='demo-1'")
    .get()!.count,
}));
const port = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .parse(process.env.FIELDWORK_DESIGN_TEST_PORT ?? 4180);
await app.listen({ host: '127.0.0.1', port });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
