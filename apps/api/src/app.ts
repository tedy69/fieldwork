import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import serveStatic from '@fastify/static';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { z, ZodError } from 'zod';
import {
  CreateOrderSchema,
  ReportInputSchema,
  ReviewSchema,
  RescheduleOrderSchema,
  ReassignOrderSchema,
  StatusSchema,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import { openStore, verifyPassword } from './store';

declare module 'fastify' {
  interface FastifyRequest {
    actor?: User;
    sessionHash?: string;
  }
}
class Problem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, code: string, message: string): never {
  throw new Problem(status, code, message);
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export type AppOptions = {
  databasePath: string;
  webOrigin?: string;
  staticRoot?: string;
  secureCookies?: boolean;
  logger?: boolean;
  rateLimits?: boolean;
};

export async function buildApp(options: AppOptions) {
  const store = openStore(options.databasePath);
  const app = Fastify({
    bodyLimit: 9_000_000,
    logger: options.logger
      ? { redact: ['req.headers.authorization', 'req.headers.cookie'] }
      : false,
  });
  await app.register(cookie);
  const origins = (options.webOrigin ?? 'http://localhost:5173').split(',');
  await app.register(cors, {
    origin: origins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  if (options.rateLimits !== false)
    await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  app.addHook('onClose', async () => {
    store.db.close();
  });
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply.status(422).send({
        error: {
          code: 'VALIDATION',
          message: error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        },
      });
    if (error instanceof Problem)
      return reply
        .status(error.status)
        .send({ error: { code: error.code, message: error.message } });
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode < 500
    )
      return reply
        .status(error.statusCode)
        .send({ error: { code: 'REQUEST_ERROR', message: error.message } });
    app.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'The request could not be completed.' } });
  });
  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api/v1/')) return;
    if (request.method === 'POST' && request.url === '/api/v1/sessions') return;
    const token = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : request.cookies.session;
    if (!token) fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const sessionHash = digest(token);
    const session = store.db
      .prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires>?')
      .get(sessionHash, Date.now());
    if (!session)
      fail(
        401,
        'UNAUTHENTICATED',
        'Your session expired. Sign in again; your offline work is still saved.',
      );
    request.actor = store.getUser(session.user_id as string)!;
    request.sessionHash = sessionHash;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !request.headers.authorization) {
      const origin = request.headers.origin;
      const ownOrigin = `${request.protocol}://${request.headers.host}`;
      if (!origin || (!origins.includes(origin) && origin !== ownOrigin))
        fail(403, 'ORIGIN', 'Request origin is not allowed.');
    }
  });
  function manager(request: FastifyRequest) {
    if (request.actor?.role !== 'manager') fail(403, 'FORBIDDEN', 'A manager account is required.');
  }
  function accessible(id: string, request: FastifyRequest) {
    const order = store.getOrder(id);
    if (!order || (request.actor!.role === 'worker' && order.assignee.id !== request.actor!.id))
      fail(404, 'NOT_FOUND', 'Work order not found.');
    return order;
  }
  function audit(orderId: string, actor: User, action: string) {
    store.db
      .prepare('INSERT INTO audit(order_id,actor_id,action,at) VALUES(?,?,?,?)')
      .run(orderId, actor.id, action, new Date().toISOString());
  }
  app.get('/health', async () => {
    store.db.prepare('SELECT 1').get();
    return { status: 'ok', version: '0.1.0' };
  });
  app.post(
    '/api/v1/sessions',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = z
        .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
        .parse(request.body);
      const row = store.db
        .prepare('SELECT id,password FROM users WHERE email=?')
        .get(body.email.toLowerCase());
      // Use a real scrypt computation for missing users too.
      const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
      const valid = verifyPassword(body.password, (row?.password as string) ?? fallback);
      if (!row || !valid) fail(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      const token = randomBytes(32).toString('hex');
      const expires = Date.now() + 14 * 24 * 60 * 60 * 1000;
      store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
      store.db
        .prepare('INSERT INTO sessions VALUES(?,?,?)')
        .run(digest(token), row.id as string, expires);
      reply.setCookie('session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: options.secureCookies ?? false,
        path: '/',
        expires: new Date(expires),
      });
      return { user: store.getUser(row.id as string), token };
    },
  );
  app.delete('/api/v1/sessions/current', async (request, reply) => {
    store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(request.sessionHash!);
    reply.clearCookie('session', { path: '/' });
    return reply.status(204).send();
  });
  app.get('/api/v1/me', async (request) => ({ user: request.actor }));
  app.get('/api/v1/catalog', async (request) => {
    const catalog = store.catalog();
    return {
      ...catalog,
      users: request.actor!.role === 'manager' ? catalog.users : [request.actor],
    };
  });
  app.post('/api/v1/sites', async (request, reply) => {
    manager(request);
    const input = z
      .object({
        name: z.string().trim().min(2).max(120),
        address: z.string().trim().min(3).max(250),
      })
      .strict()
      .parse(request.body);
    const site = { id: randomUUID(), ...input };
    store.transaction(() => {
      const { sites, templates } = store.catalog();
      store.db
        .prepare('INSERT INTO catalog VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
        .run(JSON.stringify({ sites: [...sites, site], templates }));
    });
    return reply.status(201).send(site);
  });
  app.post('/api/v1/templates', async (request, reply) => {
    manager(request);
    const input = z
      .object({
        name: z.string().trim().min(2).max(120),
        items: z.array(z.string().trim().min(2).max(250)).min(1).max(50),
      })
      .strict()
      .parse(request.body);
    const template = {
      id: randomUUID(),
      name: input.name,
      items: input.items.map((label) => ({ id: randomUUID(), label })),
    };
    store.transaction(() => {
      const { sites, templates } = store.catalog();
      store.db
        .prepare('INSERT INTO catalog VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
        .run(JSON.stringify({ sites, templates: [...templates, template] }));
    });
    return reply.status(201).send(template);
  });
  app.get('/api/v1/work-orders', async (request) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(100),
        offset: z.coerce.number().int().min(0).default(0),
        status: StatusSchema.optional(),
      })
      .parse(request.query);
    const conditions: string[] = [];
    const params: string[] = [];
    if (request.actor!.role === 'worker') {
      conditions.push('assignee_id=?');
      params.push(request.actor!.id);
    }
    if (query.status) {
      conditions.push('status=?');
      params.push(query.status);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const total = store.db
      .prepare(`SELECT COUNT(*) AS count FROM work_orders${where}`)
      .get(...params)!.count as number;
    const rows = store.db
      .prepare(
        `SELECT data FROM work_orders${where} ORDER BY json_extract(data,'$.dueDate'), id LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit, query.offset);
    return {
      data: rows.map((row) => JSON.parse(row.data as string)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  });
  app.get<{ Params: { id: string } }>('/api/v1/work-orders/:id', async (request) =>
    accessible(request.params.id, request),
  );
  app.post('/api/v1/work-orders', async (request, reply) => {
    manager(request);
    const input = CreateOrderSchema.parse(request.body);
    const catalog = store.catalog();
    const site = catalog.sites.find((site) => site.id === input.siteId);
    const template = catalog.templates.find((template) => template.id === input.templateId);
    const assignee = catalog.users.find(
      (user) => user.id === input.assigneeId && user.role === 'worker',
    );
    if (!site || !template || !assignee)
      fail(422, 'INVALID_ASSIGNMENT', 'Choose an existing site, checklist, and field worker.');
    const order: WorkOrder = {
      id: randomUUID(),
      reference: `FW-${randomBytes(3).toString('hex').toUpperCase()}`,
      title: input.title,
      instructions: input.instructions,
      site,
      template,
      assignee,
      dueDate: input.dueDate,
      priority: input.priority,
      status: 'ASSIGNED',
      version: 1,
      createdAt: new Date().toISOString(),
      report: null,
      review: null,
    };
    store.transaction(() => {
      store.writeOrder(order);
      audit(order.id, request.actor!, 'Work order assigned');
    });
    return reply.status(201).send(order);
  });
  app.patch<{ Params: { id: string } }>('/api/v1/work-orders/:id/schedule', async (request) => {
    manager(request);
    const input = RescheduleOrderSchema.parse(request.body);
    return store.transaction(() => {
      const order = accessible(request.params.id, request);
      if (order.version !== input.baseVersion)
        fail(409, 'VERSION_CONFLICT', 'This work order changed. Reload it before rescheduling.');
      if (!['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status))
        fail(409, 'INVALID_STATE', 'Only unfinished assignments can be rescheduled.');
      if (order.dueDate === input.dueDate) return order;
      const updated: WorkOrder = { ...order, dueDate: input.dueDate, version: order.version + 1 };
      store.writeOrder(updated);
      audit(order.id, request.actor!, `Due date changed from ${order.dueDate} to ${input.dueDate}`);
      return updated;
    });
  });
  app.patch<{ Params: { id: string } }>('/api/v1/work-orders/:id/assignee', async (request) => {
    manager(request);
    const input = ReassignOrderSchema.parse(request.body);
    return store.transaction(() => {
      const order = accessible(request.params.id, request);
      if (order.version !== input.baseVersion)
        fail(409, 'VERSION_CONFLICT', 'This work order changed. Reload it before reassigning.');
      if (!['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status))
        fail(409, 'INVALID_STATE', 'Only unfinished assignments can be reassigned.');
      const assignee = store.getUser(input.assigneeId);
      if (!assignee || assignee.role !== 'worker')
        fail(422, 'INVALID_ASSIGNMENT', 'Choose an existing field worker.');
      if (order.assignee.id === assignee.id) return order;
      const updated: WorkOrder = { ...order, assignee, version: order.version + 1 };
      store.writeOrder(updated);
      audit(
        order.id,
        request.actor!,
        `Worker changed from ${order.assignee.name} (${order.assignee.id}) to ${assignee.name} (${assignee.id})`,
      );
      return updated;
    });
  });
  app.post<{ Params: { id: string } }>('/api/v1/work-orders/:id/reports', async (request) => {
    const input = ReportInputSchema.parse(request.body);
    const hash = digest(JSON.stringify({ orderId: request.params.id, ...input }));
    return store.transaction(() => {
      const actor = request.actor!;
      const previous = store.db
        .prepare('SELECT hash,response FROM mutations WHERE user_id=? AND id=?')
        .get(actor.id, input.mutationId);
      if (previous) {
        if (previous.hash !== hash)
          fail(
            422,
            'IDEMPOTENCY_MISMATCH',
            'This submission ID was already used with different content.',
          );
        return JSON.parse(previous.response as string);
      }
      const order = accessible(request.params.id, request);
      if (actor.role !== 'worker' || order.assignee.id !== actor.id)
        fail(403, 'FORBIDDEN', 'Only the assigned field worker can submit this report.');
      if (order.version !== input.baseVersion)
        fail(
          409,
          'VERSION_CONFLICT',
          'This work order changed. Your report is kept on this device. Refresh the order and review your draft before submitting again.',
        );
      if (!['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status))
        fail(409, 'INVALID_STATE', 'This report has already been submitted.');
      const ids = new Set(input.answers.map((answer) => answer.itemId));
      if (
        ids.size !== order.template.items.length ||
        input.answers.length !== ids.size ||
        order.template.items.some((item) => !ids.has(item.id))
      )
        fail(422, 'CHECKLIST', 'Answer every checklist item exactly once.');
      for (const photo of input.photos) {
        const bytes = Buffer.from(photo.data, 'base64');
        const valid =
          photo.mimeType === 'image/jpeg'
            ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            : photo.mimeType === 'image/png'
              ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              : bytes.toString('ascii', 0, 4) === 'RIFF' &&
                bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!valid || bytes.length > 2_000_000)
          fail(422, 'PHOTO', 'Attach a JPEG, PNG, or WebP photo smaller than 2 MB.');
        if (store.db.prepare('SELECT id FROM photos WHERE id=?').get(photo.id))
          fail(422, 'PHOTO_ID', 'An attachment ID was already used. Attach the photo again.');
        store.db
          .prepare('INSERT INTO photos VALUES(?,?,?,?)')
          .run(photo.id, order.id, photo.mimeType, bytes);
      }
      const updated: WorkOrder = {
        ...order,
        version: order.version + 1,
        status: 'SUBMITTED',
        review: null,
        report: {
          id: randomUUID(),
          submittedAt: new Date().toISOString(),
          submittedBy: actor.id,
          answers: input.answers,
          summary: input.summary,
          photos: input.photos.map(({ id, mimeType }) => ({ id, mimeType })),
        },
      };
      store.writeOrder(updated);
      audit(order.id, actor, 'Inspection submitted');
      store.db
        .prepare('INSERT INTO mutations VALUES(?,?,?,?)')
        .run(actor.id, input.mutationId, hash, JSON.stringify(updated));
      return updated;
    });
  });
  app.post<{ Params: { id: string } }>('/api/v1/work-orders/:id/reviews', async (request) => {
    manager(request);
    const input = ReviewSchema.parse(request.body);
    return store.transaction(() => {
      const order = accessible(request.params.id, request);
      if (order.version !== input.baseVersion || order.status !== 'SUBMITTED')
        fail(409, 'VERSION_CONFLICT', 'This report changed. Refresh it before reviewing.');
      const updated: WorkOrder = {
        ...order,
        version: order.version + 1,
        status: input.decision,
        review: {
          decision: input.decision,
          note: input.note,
          reviewedAt: new Date().toISOString(),
          reviewedBy: request.actor!.name,
        },
      };
      store.writeOrder(updated);
      audit(
        order.id,
        request.actor!,
        input.decision === 'APPROVED' ? 'Report approved' : 'Changes requested',
      );
      return updated;
    });
  });
  app.get<{ Params: { id: string } }>('/api/v1/photos/:id', async (request, reply) => {
    const photo = store.db.prepare('SELECT * FROM photos WHERE id=?').get(request.params.id);
    if (!photo) fail(404, 'NOT_FOUND', 'Photo not found.');
    accessible(photo.order_id as string, request);
    return reply
      .type(photo.mime as string)
      .header('Content-Disposition', 'inline')
      .send(Buffer.from(photo.bytes as Uint8Array));
  });
  app.get<{ Params: { id: string } }>('/api/v1/work-orders/:id/events', async (request) => {
    accessible(request.params.id, request);
    return {
      data: store.db
        .prepare(
          'SELECT action,at,users.name AS actor FROM audit JOIN users ON actor_id=users.id WHERE order_id=? ORDER BY audit.id',
        )
        .all(request.params.id),
    };
  });
  if (options.staticRoot && existsSync(options.staticRoot)) {
    await app.register(serveStatic, { root: options.staticRoot });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/')
        ? reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } })
        : reply.sendFile('index.html'),
    );
  }
  return { app, store };
}
