import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { mapProviderFromEnv } from './map-settings';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const { app } = await buildApp({
  mapProvider: mapProviderFromEnv(),
  databasePath: resolve(root, process.env.DATABASE_PATH ?? 'data/fieldwork.sqlite'),
  webOrigin: process.env.WEB_ORIGIN,
  staticRoot: resolve(root, 'apps/web/dist'),
  secureCookies: process.env.COOKIE_SECURE === 'true',
  logger: true,
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => app.close().then(() => process.exit(0)));
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
