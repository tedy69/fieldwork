import { expect, it, vi } from 'vitest';
import { createClient } from '@fieldwork/sdk';

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
