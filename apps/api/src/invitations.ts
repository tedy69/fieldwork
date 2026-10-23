import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AcceptInvitationSchema,
  CreateInvitationSchema,
  InvitationAccessSchema,
  InvitationQuerySchema,
  InvitationSchema,
} from '@fieldwork/contracts';
import { z } from 'zod';
import { hashPassword, type Store } from './store';
import { fail } from './problems';

const lifetime = 72 * 60 * 60 * 1000;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
type Row = {
  id: string;
  token_hash: string;
  email: string;
  name: string;
  created_by: string;
  actor_name: string;
  actor_role: string;
  created_at: string;
  expires: number;
  accepted_at: string | null;
  accepted_user_id: string | null;
  revoked_at: string | null;
};
const select =
  'SELECT i.*,u.name AS actor_name,u.role AS actor_role FROM invitations i JOIN users u ON u.id=i.created_by';
function summary(row: Row, now = Date.now()) {
  return InvitationSchema.parse({
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    expiresAt: new Date(row.expires).toISOString(),
    createdBy: { id: row.created_by, name: row.actor_name },
    status: row.accepted_at
      ? 'accepted'
      : row.revoked_at
        ? 'revoked'
        : row.expires <= now
          ? 'expired'
          : 'pending',
    acceptedAt: row.accepted_at,
    acceptedUserId: row.accepted_user_id,
    revokedAt: row.revoked_at,
  });
}
const unavailable = () =>
  fail(
    410,
    'INVITATION_UNAVAILABLE',
    'This invitation is unavailable. Try signing in if you already accepted it, or ask a manager for a new link.',
  );

export function registerInvitationRoutes(
  app: FastifyInstance,
  store: Store,
  manager: (request: FastifyRequest) => void,
) {
  const byId = (id: string) =>
    store.db.prepare(`${select} WHERE i.id=?`).get(id) as Row | undefined;
  function available(token: string) {
    const row = store.db.prepare(`${select} WHERE i.token_hash=?`).get(digest(token)) as
      Row | undefined;
    if (
      !row ||
      row.accepted_at ||
      row.revoked_at ||
      row.actor_role !== 'manager' ||
      !Number.isSafeInteger(row.expires) ||
      row.expires <= Date.now()
    )
      return unavailable();
    if (store.db.prepare('SELECT id FROM users WHERE email=?').get(row.email)) return unavailable();
    return row;
  }
  app.post('/api/v1/invitations', { bodyLimit: 4096 }, async (request, reply) => {
    manager(request);
    const input = CreateInvitationSchema.parse(request.body);
    const token = randomBytes(32).toString('base64url');
    const invitation = store.transaction(() => {
      if (store.db.prepare('SELECT id FROM users WHERE email=?').get(input.email))
        fail(409, 'ACCOUNT_EXISTS', 'An account already uses this email address.');
      const now = Date.now();
      if (
        store.db
          .prepare(
            'SELECT id FROM invitations WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires>?',
          )
          .get(input.email, now)
      )
        fail(
          409,
          'INVITATION_EXISTS',
          'A pending invitation already uses this email. Refresh invitations; revoke it before creating a new link.',
        );
      const id = randomUUID();
      store.db
        .prepare(
          'INSERT INTO invitations(id,token_hash,email,name,created_by,created_at,expires) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          id,
          digest(token),
          input.email,
          input.name,
          request.actor!.id,
          new Date(now).toISOString(),
          now + lifetime,
        );
      return summary(byId(id)!, now);
    });
    return reply.status(201).send({ invitation, token });
  });
  app.get('/api/v1/invitations', async (request) => {
    manager(request);
    const { limit, cursor } = InvitationQuerySchema.parse(request.query);
    const before = cursor ? byId(cursor) : undefined;
    if (cursor && !before)
      fail(422, 'CURSOR', 'This invitation cursor is unavailable. Refresh invitations.');
    const rows = store.db
      .prepare(
        `${select}${before ? ' WHERE (i.created_at<? OR (i.created_at=? AND i.id<?))' : ''} ORDER BY i.created_at DESC,i.id DESC LIMIT ?`,
      )
      .all(
        ...(before ? [before.created_at, before.created_at, before.id, limit + 1] : [limit + 1]),
      ) as Row[];
    const now = Date.now();
    const data = rows.slice(0, limit).map((row) => summary(row, now));
    return {
      data,
      total: store.db.prepare('SELECT COUNT(*) AS count FROM invitations').get()!.count as number,
      nextCursor: rows.length > limit ? data.at(-1)!.id : null,
    };
  });
  app.delete<{ Params: { id: string } }>('/api/v1/invitations/:id', async (request) => {
    manager(request);
    const id = z.uuid().parse(request.params.id);
    return store.transaction(() => {
      const row = byId(id);
      if (!row) fail(404, 'NOT_FOUND', 'Invitation not found.');
      if (row.accepted_at)
        fail(409, 'INVITATION_CLOSED', 'This invitation has already been accepted.');
      if (!row.revoked_at)
        store.db
          .prepare('UPDATE invitations SET revoked_at=? WHERE id=?')
          .run(new Date().toISOString(), id);
      return summary(byId(id)!);
    });
  });
  app.post(
    '/api/v1/invitations/preview',
    { bodyLimit: 4096, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { token } = InvitationAccessSchema.parse(request.body);
      const row = available(token);
      return { name: row.name, email: row.email, expiresAt: new Date(row.expires).toISOString() };
    },
  );
  app.post(
    '/api/v1/invitations/accept',
    { bodyLimit: 4096, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { token, password } = AcceptInvitationSchema.parse(request.body);
      return store.transaction(() => {
        const row = available(token);
        const userId = randomUUID();
        store.db
          .prepare('INSERT INTO users(id,email,name,role,password) VALUES(?,?,?,?,?)')
          .run(userId, row.email, row.name, 'worker', hashPassword(password));
        store.db
          .prepare('UPDATE invitations SET accepted_at=?,accepted_user_id=? WHERE id=?')
          .run(new Date().toISOString(), userId, row.id);
        return { user: store.getUser(userId)! };
      });
    },
  );
}
