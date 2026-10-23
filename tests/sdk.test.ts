import { expect, it, vi } from 'vitest';
import { createClient } from '@fieldwork/sdk';
import { randomBytes, randomUUID } from 'node:crypto';

it('validates reset metadata and receipts, encodes manager paths and sends public tokens only in POST bodies', async () => {
  const reset = {
    id: randomUUID(),
    workerId: 'worker/a',
    createdAt: '2026-10-23T00:00:00Z',
    expiresAt: '2026-10-23T01:00:00Z',
    createdBy: { id: 'manager', name: 'Synthetic manager' },
    status: 'pending',
    usedAt: null,
    revokedAt: null,
  };
  const token = randomBytes(32).toString('base64url');
  const preview = {
    name: 'Synthetic worker',
    email: 'worker@example.com',
    expiresAt: reset.expiresAt,
  };
  const user = { id: 'worker/a', name: preview.name, email: preview.email, role: 'worker' };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ reset: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ reset, token })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...reset, status: 'revoked', revokedAt: '2026-10-23T00:01:00Z' }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(preview)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ user })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...preview, expiresAt: 'invalid' })));
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect((await client.passwordReset('worker/a')).reset).toBeNull();
  expect(fetcher.mock.calls[0][0]).toBe(
    'https://fieldwork.example/api/v1/workers/worker%2Fa/password-reset',
  );
  expect((await client.createPasswordReset('worker/a', { expectedAccessVersion: 2 })).token).toBe(
    token,
  );
  expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string)).toEqual({
    expectedAccessVersion: 2,
  });
  expect((await client.revokePasswordReset('worker/a', 'reset/b')).status).toBe('revoked');
  expect(fetcher.mock.calls[2][0]).toBe(
    'https://fieldwork.example/api/v1/workers/worker%2Fa/password-reset/reset%2Fb',
  );
  expect(fetcher.mock.calls[2][1]?.method).toBe('DELETE');
  expect(await client.previewPasswordReset(token)).toEqual(preview);
  expect(await client.completePasswordReset(token, 'synthetic-new-password')).toEqual({ user });
  for (const index of [3, 4]) {
    expect(fetcher.mock.calls[index][1]?.method).toBe('POST');
    expect(String(fetcher.mock.calls[index][0])).not.toContain(token);
    expect(JSON.parse(fetcher.mock.calls[index][1]?.body as string).token).toBe(token);
  }
  await expect(client.previewPasswordReset(token)).rejects.toThrow();
});

it('encodes worker access history requests and validates recorded events', async () => {
  const event = {
    id: 12,
    workerId: 'worker/a',
    enabled: false,
    at: '2026-10-23T00:00:00Z',
    actor: { id: 'manager', name: 'Synthetic manager' },
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [event], total: 21, nextCursor: 12 })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ ...event, enabled: 'false' }], total: 1, nextCursor: null }),
      ),
    );
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect((await client.workerAccessHistory('worker/a', { limit: 1, cursor: 15 })).data).toEqual([
    event,
  ]);
  expect(fetcher.mock.calls[0][0]).toBe(
    'https://fieldwork.example/api/v1/workers/worker%2Fa/access-history?limit=1&cursor=15',
  );
  expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
  expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  await expect(client.workerAccessHistory('worker/a')).rejects.toThrow();
});

it('encodes worker account reads and optimistic access updates and validates responses', async () => {
  const account = {
    user: { id: 'worker/a', name: 'Synthetic worker', email: 'worker@example.com', role: 'worker' },
    enabled: true,
    version: 0,
    updatedAt: null,
    updatedBy: null,
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [account], total: 1, nextCursor: null })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(account)))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...account,
          enabled: false,
          version: 1,
          updatedAt: '2026-10-23T00:00:00Z',
          updatedBy: { id: 'manager', name: 'Synthetic manager' },
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...account, enabled: 'false' })));
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect((await client.workers({ limit: 2, cursor: 'worker/a b' })).data).toEqual([account]);
  expect(fetcher.mock.calls[0][0]).toBe(
    'https://fieldwork.example/api/v1/workers?limit=2&cursor=worker%2Fa+b',
  );
  expect(await client.worker('worker/a')).toEqual(account);
  expect(fetcher.mock.calls[1][0]).toBe('https://fieldwork.example/api/v1/workers/worker%2Fa');
  expect(
    (await client.updateWorkerAccess('worker/a', { enabled: false, expectedVersion: 0 })).enabled,
  ).toBe(false);
  expect(fetcher.mock.calls[2][0]).toBe(
    'https://fieldwork.example/api/v1/workers/worker%2Fa/access',
  );
  expect(fetcher.mock.calls[2][1]?.method).toBe('PATCH');
  expect(JSON.parse(fetcher.mock.calls[2][1]?.body as string)).toEqual({
    enabled: false,
    expectedVersion: 0,
  });
  await expect(client.worker('worker/a')).rejects.toThrow();
});

it('validates invitation receipts, encodes manager pagination and keeps public tokens in POST bodies', async () => {
  const invitation = {
    id: randomUUID(),
    name: 'Synthetic worker',
    email: 'invited@example.com',
    createdAt: '2026-10-23T00:00:00Z',
    expiresAt: '2026-10-26T00:00:00Z',
    createdBy: { id: 'manager', name: 'Synthetic manager' },
    status: 'pending',
    acceptedAt: null,
    acceptedUserId: null,
    revokedAt: null,
  };
  const secret = randomBytes(32).toString('base64url');
  const preview = {
    name: invitation.name,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
  };
  const user = { id: randomUUID(), name: invitation.name, email: invitation.email, role: 'worker' };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ invitation, token: secret })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [invitation], total: 1, nextCursor: null })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...invitation, status: 'revoked', revokedAt: '2026-10-23T01:00:00Z' }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(preview)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ user })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...preview, expiresAt: 'invalid' })));
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect(
    (await client.createInvitation({ name: invitation.name, email: invitation.email })).token,
  ).toBe(secret);
  expect((await client.invitations({ limit: 3, cursor: 'cursor/a b' })).data[0]).toEqual(
    invitation,
  );
  expect(fetcher.mock.calls[1][0]).toBe(
    'https://fieldwork.example/api/v1/invitations?limit=3&cursor=cursor%2Fa+b',
  );
  expect((await client.revokeInvitation('id/a')).status).toBe('revoked');
  expect(fetcher.mock.calls[2][0]).toBe('https://fieldwork.example/api/v1/invitations/id%2Fa');
  expect(fetcher.mock.calls[2][1]?.method).toBe('DELETE');
  expect(await client.previewInvitation(secret)).toEqual(preview);
  expect(await client.acceptInvitation(secret, 'synthetic-password')).toEqual({ user });
  for (const index of [3, 4]) {
    expect(String(fetcher.mock.calls[index][0])).not.toContain(secret);
    expect(fetcher.mock.calls[index][1]?.method).toBe('POST');
    expect(JSON.parse(fetcher.mock.calls[index][1]?.body as string).token).toBe(secret);
  }
  expect(JSON.parse(fetcher.mock.calls[4][1]?.body as string)).toEqual({
    token: secret,
    password: 'synthetic-password',
  });
  await expect(client.previewInvitation(secret)).rejects.toThrow();
});

it('preserves optional template creation calls and validates the photo requirement in responses', async () => {
  const template = {
    id: 'template',
    name: 'Synthetic evidence',
    items: [{ id: 'check', label: 'Check access' }],
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(template)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...template, requiresPhoto: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...template, requiresPhoto: 'true' })));
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect(await client.createTemplate(template.name, ['Check access'])).toEqual(template);
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
    name: template.name,
    items: ['Check access'],
  });
  expect((await client.createTemplate(template.name, ['Check access'], true)).requiresPhoto).toBe(
    true,
  );
  expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).requiresPhoto).toBe(true);
  await expect(client.createTemplate(template.name, ['Check access'])).rejects.toThrow();
});

it('encodes site lookups and location patches and keeps their expected coordinate pair', async () => {
  const site = { id: 'site/a', name: 'Synthetic site', address: 'Test address' };
  const point = { latitude: 0, longitude: 0 };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(site)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...site, coordinates: point })));
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect(await client.site(site.id)).toEqual(site);
  expect(
    await client.updateSiteLocation(site.id, { expectedCoordinates: null, coordinates: point }),
  ).toMatchObject({ coordinates: point });
  expect(fetcher.mock.calls[0][0]).toBe('https://fieldwork.example/api/v1/sites/site%2Fa');
  expect(fetcher.mock.calls[1][0]).toBe('https://fieldwork.example/api/v1/sites/site%2Fa/location');
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    method: 'PATCH',
    body: JSON.stringify({ expectedCoordinates: null, coordinates: point }),
  });
});

it('sends optional site coordinates and validates provider settings before map use', async () => {
  const coordinates = { latitude: 0, longitude: 0 };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'site',
          name: 'Synthetic site',
          address: 'Test address',
          coordinates,
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ provider: null })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ provider: { name: 'Invalid', tileUrlTemplate: 'http://invalid.test' } }),
      ),
    );
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect(
    (await client.createSite('Synthetic site', 'Test address', coordinates)).coordinates,
  ).toEqual(coordinates);
  expect(fetcher.mock.calls[0][1]?.body).toBe(
    JSON.stringify({ name: 'Synthetic site', address: 'Test address', coordinates }),
  );
  expect(await client.mapSettings()).toEqual({ provider: null });
  expect(fetcher.mock.calls[1][0]).toBe('https://fieldwork.example/api/v1/map-settings');
  await expect(client.mapSettings()).rejects.toThrow();
});

it('encodes batch cursors and IDs and rejects malformed overview responses', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], total: 0, nextCursor: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ orders: [] })));
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect(await client.orderSeries({ limit: 2, cursor: 'batch&cursor' })).toEqual({
    data: [],
    total: 0,
    nextCursor: null,
  });
  expect(fetcher.mock.calls[0][0]).toBe(
    'https://fieldwork.example/api/v1/work-order-series?limit=2&cursor=batch%26cursor',
  );
  await expect(client.orderSeriesDetail('batch/a')).rejects.toThrow();
  expect(fetcher.mock.calls[1][0]).toBe(
    'https://fieldwork.example/api/v1/work-order-series/batch%2Fa',
  );
});

it('encodes search filters and validates paginated server results', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], total: 0, nextCursor: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], total: -1, nextCursor: null })));
  const client = createClient('https://fieldwork.example', undefined, fetcher);
  expect(
    await client.searchOrders({
      q: 'Sam & Depot',
      limit: 2,
      cursor: 'order/a',
      dueFrom: '2026-10-01',
      status: undefined,
    }),
  ).toEqual({ data: [], total: 0, nextCursor: null });
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.pathname).toBe('/api/v1/work-orders/search');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: 'Sam & Depot',
    limit: '2',
    cursor: 'order/a',
    dueFrom: '2026-10-01',
  });
  await expect(client.searchOrders()).rejects.toThrow();
});

it('encodes history IDs and cursors and rejects malformed history responses', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], total: 0, nextCursor: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], total: -1, nextCursor: null })));
  const client = createClient('https://fieldwork.example', () => 'synthetic-token', fetcher);
  expect(await client.reportHistory('order/a', 'report&b')).toEqual({
    data: [],
    total: 0,
    nextCursor: null,
  });
  expect(fetcher.mock.calls[0][0]).toBe(
    'https://fieldwork.example/api/v1/work-orders/order%2Fa/history?limit=10&cursor=report%26b',
  );
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
    Authorization: 'Bearer synthetic-token',
  });
  await expect(client.reportHistory('order/a')).rejects.toThrow();
});

it('aborts a stalled connection and leaves its outcome retryable', async () => {
  vi.useFakeTimers();
  try {
    const fetcher: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const request = createClient('', undefined, fetcher, 100).me();
    const assertion = expect(request).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});

it('posts a recurring assignment without changing its retry identity and rejects malformed receipts', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'not-a-series-receipt',
        orders: [],
      }),
    ),
  );
  const client = createClient('https://fieldwork.example', () => 'synthetic-token', fetcher);
  const input = {
    mutationId: '7f801668-8c5c-4f48-9262-3cc91ba4b1bd',
    title: 'Check the gate',
    instructions: '',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: 'routine',
    dueDate: '2026-10-24',
    priority: 'routine' as const,
    frequency: 'weekly' as const,
    occurrences: 3,
  };
  await expect(client.createOrderSeries(input)).rejects.toThrow();
  expect(fetcher.mock.calls[0][0]).toBe('https://fieldwork.example/api/v1/work-order-series');
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: 'Bearer synthetic-token' },
    body: JSON.stringify(input),
  });
});
