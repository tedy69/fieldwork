import { useEffect, useRef, useState } from 'react';
import type { Catalog, WorkerAccount } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { languageTags, type Locale } from '@fieldwork/strings';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise';
import { KeyIcon } from '@phosphor-icons/react/dist/csr/Key';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { client, message } from './lib';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Badge } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog';
import './invitations.css';
import WorkerAccessHistory from './WorkerAccessHistory';
import WorkerPasswordReset from './WorkerPasswordReset';
import { ActionGroup } from './components';
import { workerAccessCopy } from './worker-access-copy';
import { workerInvitationsCopy } from './worker-invitations-copy';

type Page = Awaited<ReturnType<typeof client.workers>>;
export default function WorkerAccounts({
  online,
  locale,
  onCatalog,
  onUpdated,
}: {
  online: boolean;
  locale: Locale;
  onCatalog: (catalog: Catalog) => void;
  onUpdated: (account: WorkerAccount) => void;
}) {
  const copy = workerAccessCopy[locale];
  const date = new Intl.DateTimeFormat(languageTags[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [selected, setSelected] = useState<WorkerAccount | null>(null);
  const [history, setHistory] = useState<WorkerAccount | null>(null);
  const [recovery, setRecovery] = useState<WorkerAccount | null>(null);
  const [busy, setBusy] = useState<'loading' | 'saving' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [restart, setRestart] = useState(false);
  const generation = useRef(0);
  const writing = useRef(false);
  const attemptedCursor = useRef<string | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmation = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) void load();
    return () => {
      generation.current++;
    };
  }, [open]);
  function changeOpen(next: boolean) {
    if (writing.current) return;
    generation.current++;
    setOpen(next);
    setPage(null);
    setSelected(null);
    setHistory(null);
    setRecovery(null);
    setBusy(null);
    setError('');
    setNotice('');
    setNeedsReload(false);
    setRestart(false);
  }
  async function load(cursor?: string) {
    if (!online || writing.current) return;
    const current = ++generation.current;
    attemptedCursor.current = cursor;
    setBusy('loading');
    setError('');
    setRestart(false);
    try {
      const [loaded, catalog] = await Promise.all([
        client.workers({ limit: 20, ...(cursor ? { cursor } : {}) }),
        client.catalog(),
      ]);
      if (current !== generation.current) return;
      setPage((previous) =>
        cursor && previous
          ? {
              ...loaded,
              data: [
                ...new Map(
                  [...previous.data, ...loaded.data].map((row) => [row.user.id, row]),
                ).values(),
              ],
            }
          : loaded,
      );
      onCatalog(catalog);
      setNeedsReload(false);
      setSelected(null);
      setHistory(null);
      setRecovery(null);
      setNotice(copy.refreshed);
    } catch (error) {
      if (current === generation.current) {
        const stale = error instanceof ApiError && error.code === 'CURSOR';
        setError(locale === 'en' ? message(error) : stale ? copy.cursor : copy.loadFailed);
        setRestart(stale);
      }
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  async function save() {
    if (!online || busy || writing.current || needsReload || !selected) return;
    const current = ++generation.current;
    writing.current = true;
    setBusy('saving');
    setError('');
    setNotice('');
    try {
      const updated = await client.updateWorkerAccess(selected.user.id, {
        expectedVersion: selected.version,
        enabled: !selected.enabled,
      });
      if (current !== generation.current) return;
      setPage((previous) =>
        previous
          ? {
              ...previous,
              data: previous.data.map((row) => (row.user.id === updated.user.id ? updated : row)),
            }
          : previous,
      );
      onUpdated(updated);
      setSelected(null);
      setHistory(null);
      setRecovery(null);
      setNotice(
        updated.enabled
          ? copy.enabledNotice(updated.user.name)
          : copy.disabledNotice(updated.user.name),
      );
      heading.current?.focus();
    } catch (error) {
      if (current === generation.current) {
        setError(`${locale === 'en' ? message(error) : copy.saveFailed} ${copy.reloadHint}`);
        setNeedsReload(true);
      }
    } finally {
      writing.current = false;
      if (current === generation.current) setBusy(null);
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button ref={trigger} className="quiet" disabled={!online}>
          <UsersIcon aria-hidden="true" /> {copy.title}
        </Button>
      </DialogTrigger>
      <DialogContent
        lang={locale}
        size="directory"
        className="invitation-dialog"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (writing.current) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus();
          else document.getElementById('main')?.focus();
        }}
      >
        <DialogHeader>
          <div>
            <DialogTitle ref={heading} tabIndex={-1}>
              {copy.title}
            </DialogTitle>
            <DialogDescription>{copy.intro}</DialogDescription>
          </div>
          <IconButton
            label={copy.close}
            className="quiet"
            disabled={busy === 'saving'}
            onClick={() => changeOpen(false)}
          >
            <XIcon aria-hidden="true" />
          </IconButton>
        </DialogHeader>
        {!online && (
          <Alert role="status" className="banner notice">
            {copy.offline}
          </Alert>
        )}
        {notice && (
          <p className="muted" role="status">
            {notice}
          </p>
        )}
        {error && (
          <Alert className="banner error">
            <p>{error}</p>
            <Button
              className="quiet"
              disabled={!online || Boolean(busy)}
              onClick={() =>
                void load(restart || needsReload ? undefined : attemptedCursor.current)
              }
            >
              {restart ? copy.restart : copy.retry}
            </Button>
          </Alert>
        )}
        <div className="invitation-toolbar">
          <h3>{workerInvitationsCopy[locale].directory}</h3>
          <IconButton
            label={copy.refresh}
            className="quiet"
            disabled={!online || Boolean(busy)}
            onClick={() => void load()}
          >
            <ArrowClockwiseIcon aria-hidden="true" />
          </IconButton>
        </div>
        {busy === 'loading' && (
          <p role="status" className="muted">
            {copy.loading}
          </p>
        )}
        {selected && (
          <section
            className="invitation-new-link worker-access-confirmation"
            aria-label={copy.confirm}
          >
            <h3 ref={confirmation} tabIndex={-1}>
              {copy.confirmTitle(selected.enabled, selected.user.name)}
            </h3>
            <p>{selected.user.email}</p>
            <p>{selected.enabled ? copy.disableHint : copy.reactivateHint}</p>
            <p className="muted">{copy.retained}</p>
            <div className="invitation-actions">
              <Button
                className="primary"
                disabled={!online || Boolean(busy) || needsReload}
                onClick={() => void save()}
              >
                {busy === 'saving'
                  ? copy.saving
                  : selected.enabled
                    ? copy.confirmDisable
                    : copy.confirmReactivate}
              </Button>
              <Button
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() => {
                  setSelected(null);
                  heading.current?.focus();
                }}
              >
                {copy.cancel}
              </Button>
            </div>
          </section>
        )}
        {history && (
          <WorkerAccessHistory
            key={history.user.id}
            worker={history.user}
            online={online}
            locale={locale}
            onClose={() => {
              setHistory(null);
              heading.current?.focus();
            }}
          />
        )}
        {recovery && (
          <WorkerPasswordReset
            key={recovery.user.id}
            worker={recovery}
            online={online}
            locale={locale}
            onWriting={(active) => {
              writing.current = active;
              setBusy(active ? 'saving' : null);
            }}
            onAccount={(account) => {
              setPage((previous) =>
                previous
                  ? {
                      ...previous,
                      data: previous.data.map((row) =>
                        row.user.id === account.user.id ? account : row,
                      ),
                    }
                  : previous,
              );
              onUpdated(account);
            }}
            onClose={() => {
              setRecovery(null);
              heading.current?.focus();
            }}
          />
        )}
        {page && (
          <>
            <p className="muted" role="status">
              {copy.count(page.data.length, page.total)}
            </p>
            {page.data.length === 0 && <p>{copy.empty}</p>}
            <ul className="invitation-list">
              {page.data.map((account) => (
                <li key={account.user.id}>
                  <div className="invitation-toolbar">
                    <strong>{account.user.name}</strong>
                    <Badge>{account.enabled ? copy.active : copy.disabled}</Badge>
                  </div>
                  <p>{account.user.email}</p>
                  <p className="muted">
                    {account.updatedAt && account.updatedBy ? (
                      <>
                        {copy.changedBy(account.updatedBy.name)} ·{' '}
                        <time dateTime={account.updatedAt}>
                          {date.format(new Date(account.updatedAt))}
                        </time>
                      </>
                    ) : (
                      copy.noChanges
                    )}
                  </p>
                  <ActionGroup>
                    <Button
                      className="quiet"
                      aria-label={copy.changeFor(account.enabled, account.user.email)}
                      disabled={!online || Boolean(busy) || needsReload}
                      onClick={() => {
                        setSelected(account);
                        setHistory(null);
                        setRecovery(null);
                        setNotice('');
                        setError('');
                        requestAnimationFrame(() => confirmation.current?.focus());
                      }}
                    >
                      {account.enabled ? copy.disable : copy.reactivate}
                    </Button>
                    <IconButton
                      className="quiet"
                      label={copy.historyFor(account.user.email)}
                      tooltip={copy.history}
                      disabled={!online || Boolean(busy)}
                      onClick={() => {
                        setHistory(account);
                        setRecovery(null);
                        setSelected(null);
                        setNotice('');
                        if (history?.user.id === account.user.id)
                          document.getElementById('worker-access-history-title')?.focus();
                      }}
                    >
                      <ClockCounterClockwiseIcon aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      className="quiet"
                      label={copy.recoveryFor(account.user.email)}
                      tooltip={copy.recovery}
                      disabled={!online || Boolean(busy)}
                      onClick={() => {
                        setRecovery(account);
                        setHistory(null);
                        setSelected(null);
                        setNotice('');
                        requestAnimationFrame(() =>
                          document.getElementById('worker-password-recovery-title')?.focus(),
                        );
                      }}
                    >
                      <KeyIcon aria-hidden="true" />
                    </IconButton>
                  </ActionGroup>
                </li>
              ))}
            </ul>
            {page.nextCursor && (
              <Button
                className="quiet full"
                disabled={!online || Boolean(busy)}
                onClick={() => void load(page.nextCursor!)}
              >
                {copy.more}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
