import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  UpdateWorkerAccessSchema,
  WorkerAccountSchema,
  WorkerQuerySchema,
} from '@fieldwork/contracts';
import type { Store } from './store';
import { fail } from './problems';

export function registerWorkerRoutes(
  app: FastifyInstance,
  store: Store,
  manager: (request: FastifyRequest) => void,
) {
  function account(id: string) {
    const user = store.getUser(id);
    if (!user || user.role !== 'worker') fail(404, 'NOT_FOUND', 'Worker account not found.');
    const row = store.db
      .prepare(
        'SELECT a.*,u.name AS actor_name FROM worker_access a JOIN users u ON u.id=a.updated_by WHERE a.user_id=?',
      )
      .get(id);
    return WorkerAccountSchema.parse({
      user,
      enabled: row ? row.enabled === 1 : true,
      version: row?.version ?? 0,
      updatedAt: row?.updated_at ?? null,
      updatedBy: row ? { id: row.updated_by, name: row.actor_name } : null,
    });
  }
  app.get('/api/v1/workers', async (request) => {
    manager(request);
    const { limit, cursor } = WorkerQuerySchema.parse(request.query);
    const before = cursor ? store.getUser(cursor) : undefined;
    if (cursor && (!before || before.role !== 'worker'))
      fail(422, 'CURSOR', 'This worker cursor is unavailable. Refresh worker accounts.');
    const rows = store.db
      .prepare(
        `SELECT id FROM users WHERE role='worker'${before ? ' AND (name>? OR (name=? AND id>?))' : ''} ORDER BY name,id LIMIT ?`,
      )
      .all(...(before ? [before.name, before.name, before.id, limit + 1] : [limit + 1]));
    const data = rows.slice(0, limit).map((row) => account(String(row.id)));
    return {
      data,
      total: store.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='worker'").get()!.n,
      nextCursor: rows.length > limit ? data.at(-1)!.user.id : null,
    };
  });
  app.get<{ Params: { id: string } }>('/api/v1/workers/:id', async (request) => {
    manager(request);
    return account(request.params.id);
  });
  app.patch<{ Params: { id: string } }>(
    '/api/v1/workers/:id/access',
    { bodyLimit: 4096 },
    async (request) => {
      manager(request);
      const input = UpdateWorkerAccessSchema.parse(request.body);
      return store.transaction(() => {
        const current = account(request.params.id);
        if (input.expectedVersion !== current.version)
          fail(
            409,
            'ACCOUNT_CHANGED',
            'This worker account changed. Refresh worker accounts before trying again.',
          );
        if (input.enabled === current.enabled) return current;
        const at = new Date().toISOString();
        store.db
          .prepare(
            'INSERT INTO worker_access(user_id,enabled,version,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by',
          )
          .run(current.user.id, Number(input.enabled), current.version + 1, at, request.actor!.id);
        if (!input.enabled)
          store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(current.user.id);
        store.db
          .prepare(
            'INSERT INTO worker_access_events(worker_id,actor_id,enabled,at) VALUES(?,?,?,?)',
          )
          .run(current.user.id, request.actor!.id, Number(input.enabled), at);
        return account(current.user.id);
      });
    },
  );
}
