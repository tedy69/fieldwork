import { useEffect, useRef, useState } from 'react';
import type { User } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { languageTags, type Locale } from '@fieldwork/strings';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { client, message } from './lib';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import { ActionGroup } from './components';
import { workerAccessCopy } from './worker-access-copy';

type Page = Awaited<ReturnType<typeof client.workerAccessHistory>>;
export default function WorkerAccessHistory({
  worker,
  online,
  locale,
  onClose,
}: {
  worker: User;
  online: boolean;
  locale: Locale;
  onClose: () => void;
}) {
  const access = workerAccessCopy[locale];
  const copy = access.historyPanel;
  const date = new Intl.DateTimeFormat(languageTags[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
        const stale = error instanceof ApiError && error.code === 'CURSOR';
        setError(locale === 'en' ? message(error) : stale ? copy.cursor : copy.failed);
        setRestart(stale);
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section
      lang={locale}
      className="invitation-new-link worker-access-confirmation"
      aria-label={copy.region}
    >
      <div className="invitation-toolbar">
        <h3 id="worker-access-history-title" ref={heading} tabIndex={-1}>
          {copy.title(worker.name)}
        </h3>
        <ActionGroup>
          <IconButton
            label={copy.refresh}
            className="quiet"
            disabled={!online || busy}
            onClick={() => void load()}
          >
            <ArrowClockwiseIcon aria-hidden="true" />
          </IconButton>
          <IconButton label={copy.close} className="quiet" onClick={onClose}>
            <XIcon aria-hidden="true" />
          </IconButton>
        </ActionGroup>
      </div>
      <p>{worker.email}</p>
      <p className="muted">{copy.intro}</p>
      {!online && (
        <Alert role="status" className="banner notice">
          {copy.offline}
        </Alert>
      )}
      {busy && (
        <p role="status" className="muted">
          {copy.loading}
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
            {restart ? copy.restart : copy.retry}
          </Button>
        </Alert>
      )}
      {page && (
        <>
          <p className="muted" role="status">
            {copy.count(page.data.length, page.total)}
          </p>
          {page.data.length === 0 && <p>{copy.empty}</p>}
          <ol className="invitation-list">
            {page.data.map((event) => (
              <li key={event.id}>
                <div className="invitation-toolbar">
                  <strong>{event.enabled ? copy.reactivated : copy.disabled}</strong>
                  <Badge>{event.enabled ? copy.enabled : access.disabled}</Badge>
                </div>
                <p>{access.changedBy(event.actor.name)}</p>
                <p className="muted">
                  <time dateTime={event.at}>{date.format(new Date(event.at))}</time>
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
              {copy.more}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
