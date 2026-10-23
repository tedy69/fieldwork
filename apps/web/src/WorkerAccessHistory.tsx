import { useEffect, useRef, useState } from 'react';
import type { User } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { client, message } from './lib';
import { Button } from './components/ui/button';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';

type Page = Awaited<ReturnType<typeof client.workerAccessHistory>>;
export default function WorkerAccessHistory({
  worker,
  online,
  onClose,
}: {
  worker: User;
  online: boolean;
  onClose: () => void;
}) {
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restart, setRestart] = useState(false);
  const generation = useRef(0);
  const attemptedCursor = useRef<number | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    void load();
    return () => {
      generation.current++;
    };
  }, [worker.id]);
  async function load(cursor?: number) {
    if (!online) return;
    const current = ++generation.current;
    attemptedCursor.current = cursor;
    setBusy(true);
    setError('');
    setRestart(false);
    try {
      const loaded = await client.workerAccessHistory(worker.id, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
      });
      if (current !== generation.current) return;
      setPage((previous) =>
        cursor && previous
          ? {
              ...loaded,
              data: [
                ...new Map([...previous.data, ...loaded.data].map((row) => [row.id, row])).values(),
              ],
            }
          : loaded,
      );
    } catch (error) {
      if (current === generation.current) {
        setError(message(error));
        setRestart(error instanceof ApiError && error.code === 'CURSOR');
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section
      className="invitation-new-link worker-access-confirmation"
      aria-label="Worker access history"
    >
      <div className="invitation-toolbar">
        <h3 id="worker-access-history-title" ref={heading} tabIndex={-1}>
          Access history: {worker.name}
        </h3>
        <Button className="quiet" onClick={onClose}>
          Close history
        </Button>
      </div>
      <p>{worker.email}</p>
      <p className="muted">
        Recorded access changes, newest first. Names reflect current account details. Refresh to see
        newer changes.
      </p>
      <Button className="quiet" disabled={!online || busy} onClick={() => void load()}>
        Refresh access history
      </Button>
      {!online && (
        <Alert role="status" className="banner notice">
          Loaded history stays visible offline. Reconnect to refresh or load more.
        </Alert>
      )}
      {busy && (
        <p role="status" className="muted">
          Loading access history…
        </p>
      )}
      {error && (
        <Alert className="banner error">
          <p>{error}</p>
          <Button
            className="quiet"
            disabled={!online || busy}
            onClick={() => void load(restart ? undefined : attemptedCursor.current)}
          >
            {restart ? 'Restart access history' : 'Retry access history'}
          </Button>
        </Alert>
      )}
      {page && (
        <>
          <p className="muted" role="status">
            {page.data.length} loaded · {page.total} {page.total === 1 ? 'change' : 'changes'}
          </p>
          {page.data.length === 0 && (
            <p>
              No access changes recorded for this worker. Account creation and sign-ins are not part
              of this history.
            </p>
          )}
          <ol className="invitation-list">
            {page.data.map((event) => (
              <li key={event.id}>
                <div className="invitation-toolbar">
                  <strong>{event.enabled ? 'Worker reactivated' : 'Worker disabled'}</strong>
                  <Badge>{event.enabled ? 'Enabled' : 'Disabled'}</Badge>
                </div>
                <p>Changed by {event.actor.name}</p>
                <p className="muted">
                  <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                </p>
              </li>
            ))}
          </ol>
          {page.nextCursor && (
            <Button
              className="quiet full"
              disabled={!online || busy}
              onClick={() => void load(page.nextCursor!)}
            >
              Load older access changes
            </Button>
          )}
        </>
      )}
    </section>
  );
}
