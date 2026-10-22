import { expect, it, vi } from 'vitest';
import { createClient } from '@fieldwork/sdk';

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
