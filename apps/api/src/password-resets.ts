import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CreatePasswordResetSchema,
  PasswordResetAccessSchema,
  CompletePasswordResetSchema,
  PasswordResetSchema,
} from '@fieldwork/contracts';
import { z } from 'zod';
import { hashPassword, type Store } from './store';
import { fail } from './problems';

type Row = {
  id: string;
  worker_id: string;
  token_hash: string;
  access_version: number;
  created_by: string;
  created_at: string;
  expires: number;
  used_at: string | null;
  revoked_at: string | null;
  actor_name: string;
  actor_role: string;
  worker_name: string;
  worker_email: string;
  worker_role: string;
  enabled: number;
  current_version: number;
};
const select =
  'SELECT r.*,a.name AS actor_name,a.role AS actor_role,w.name AS worker_name,w.email AS worker_email,w.role AS worker_role,COALESCE(s.enabled,1) AS enabled,COALESCE(s.version,0) AS current_version FROM password_resets r JOIN users a ON a.id=r.created_by JOIN users w ON w.id=r.worker_id LEFT JOIN worker_access s ON s.user_id=w.id';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const unavailable = () =>
  fail(
    410,
    'RESET_UNAVAILABLE',
    'This password reset link is unavailable. Try signing in if you already used it, or ask a manager for a new link.',
  );
function status(row: Row) {
  if (row.used_at) return 'used';
  if (row.revoked_at) return 'revoked';
  if (row.expires <= Date.now()) return 'expired';
  if (
    row.actor_role !== 'manager' ||
    row.worker_role !== 'worker' ||
    row.enabled !== 1 ||
    row.current_version !== row.access_version
  )
    return 'unavailable';
  return 'pending';
}
function summary(row: Row) {
  return PasswordResetSchema.parse({
    id: row.id,
    workerId: row.worker_id,
    createdAt: row.created_at,
    expiresAt: new Date(row.expires).toISOString(),
    createdBy: { id: row.created_by, name: row.actor_name },
    status: status(row),
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
  });
}
export function registerPasswordResetRoutes(
  app: FastifyInstance,
  store: Store,
  manager: (request: FastifyRequest) => void,
) {
  function worker(id: string) {
    const user = store.getUser(id);
    if (!user || user.role !== 'worker') fail(404, 'NOT_FOUND', 'Worker account not found.');
    return user;
  }
  const latest = (id: string) =>
    store.db.prepare(`${select} WHERE r.worker_id=? ORDER BY r.sequence DESC LIMIT 1`).get(id) as
      Row | undefined;
  function available(token: string) {
    const row = store.db.prepare(`${select} WHERE r.token_hash=?`).get(digest(token)) as
      Row | undefined;
    if (!row || status(row) !== 'pending' || !Number.isSafeInteger(row.expires))
      return unavailable();
    return row;
  }
  app.get<{ Params: { id: string } }>('/api/v1/workers/:id/password-reset', async (request) => {
    manager(request);
    worker(request.params.id);
    const row = latest(request.params.id);
    return { reset: row ? summary(row) : null };
  });
  app.post<{ Params: { id: string } }>(
    '/api/v1/workers/:id/password-reset',
    { bodyLimit: 4096, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      manager(request);
      const input = CreatePasswordResetSchema.parse(request.body);
      const token = randomBytes(32).toString('base64url');
      const reset = store.transaction(() => {
        const user = worker(request.params.id);
        const version =
          store.db.prepare('SELECT version FROM worker_access WHERE user_id=?').get(user.id)
            ?.version ?? 0;
        if (version !== input.expectedAccessVersion)
          fail(
            409,
            'ACCOUNT_CHANGED',
            'This worker account changed. Refresh worker accounts before creating a reset link.',
          );
        if (!store.workerEnabled(user.id))
          fail(409, 'WORKER_DISABLED', 'Reactivate this worker before creating a reset link.');
        const now = Date.now();
        const at = new Date(now).toISOString();
        store.db
          .prepare(
            'UPDATE password_resets SET revoked_at=? WHERE worker_id=? AND used_at IS NULL AND revoked_at IS NULL',
          )
          .run(at, user.id);
        store.db
          .prepare(
            'INSERT INTO password_resets(id,worker_id,token_hash,access_version,created_by,created_at,expires) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            randomUUID(),
            user.id,
            digest(token),
            version,
            request.actor!.id,
            at,
            now + 60 * 60 * 1000,
          );
        return summary(latest(user.id)!);
      });
      return reply.status(201).send({ reset, token });
    },
  );
  app.delete<{ Params: { id: string; resetId: string } }>(
    '/api/v1/workers/:id/password-reset/:resetId',
    async (request) => {
      manager(request);
      const resetId = z.uuid().parse(request.params.resetId);
      return store.transaction(() => {
        worker(request.params.id);
        const row = store.db
          .prepare(`${select} WHERE r.id=? AND r.worker_id=?`)
          .get(resetId, request.params.id) as Row | undefined;
        if (!row) fail(404, 'NOT_FOUND', 'Password reset not found.');
        if (row.used_at) fail(409, 'RESET_USED', 'This password reset link has already been used.');
        if (!row.revoked_at)
          store.db
            .prepare('UPDATE password_resets SET revoked_at=? WHERE id=?')
            .run(new Date().toISOString(), resetId);
        return summary(store.db.prepare(`${select} WHERE r.id=?`).get(resetId) as Row);
      });
    },
  );
  app.post(
    '/api/v1/password-resets/preview',
    { bodyLimit: 4096, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { token } = PasswordResetAccessSchema.parse(request.body);
      const row = available(token);
      return {
        name: row.worker_name,
        email: row.worker_email,
        expiresAt: new Date(row.expires).toISOString(),
      };
    },
  );
  app.post(
    '/api/v1/password-resets/complete',
    { bodyLimit: 4096, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { token, password } = CompletePasswordResetSchema.parse(request.body);
      return store.transaction(() => {
        const row = available(token);
        const at = new Date().toISOString();
        store.db
          .prepare('UPDATE users SET password=? WHERE id=?')
          .run(hashPassword(password), row.worker_id);
        store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.worker_id);
        store.db.prepare('UPDATE password_resets SET used_at=? WHERE id=?').run(at, row.id);
        store.db
          .prepare(
            'UPDATE password_resets SET revoked_at=? WHERE worker_id=? AND used_at IS NULL AND revoked_at IS NULL',
          )
          .run(at, row.worker_id);
        return { user: store.getUser(row.worker_id)! };
      });
    },
  );
}
