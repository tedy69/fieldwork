import { expect, it, vi } from 'vitest';
import { createClient } from '@fieldwork/sdk';

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
