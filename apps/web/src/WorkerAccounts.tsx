import { useEffect, useRef, useState } from 'react';
import type { Catalog, WorkerAccount } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { client, message } from './lib';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog';
import './invitations.css';

type Page = Awaited<ReturnType<typeof client.workers>>;
export default function WorkerAccounts({
  online,
  onCatalog,
  onUpdated,
}: {
  online: boolean;
  onCatalog: (catalog: Catalog) => void;
  onUpdated: (account: WorkerAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [selected, setSelected] = useState<WorkerAccount | null>(null);
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
      setNotice('Worker accounts refreshed.');
    } catch (error) {
      if (current === generation.current) {
        setError(message(error));
        setRestart(error instanceof ApiError && error.code === 'CURSOR');
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
      setNotice(
        updated.enabled
          ? `${updated.user.name} can sign in again with their existing password.`
          : `${updated.user.name} is disabled. Existing sessions have ended.`,
      );
      heading.current?.focus();
    } catch (error) {
      if (current === generation.current) {
        setError(
          `${message(error)} Refresh worker accounts to check the saved state before trying again.`,
        );
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
          Worker accounts
        </Button>
      </DialogTrigger>
      <DialogContent
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
        <div className="invitation-toolbar">
          <span className="eyebrow">WORKER ACCESS</span>
          <Button className="quiet" disabled={busy === 'saving'} onClick={() => changeOpen(false)}>
            Close accounts
          </Button>
        </div>
        <DialogTitle ref={heading} tabIndex={-1}>
          Worker accounts
        </DialogTitle>
        <DialogDescription>
          Control who can sign in and receive new assignments. Saved inspections and device
          notebooks stay with their original accounts.
        </DialogDescription>
        {!online && (
          <Alert role="status" className="banner notice">
            Loaded accounts stay visible offline. Reconnect to refresh or change access.
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
              {restart ? 'Restart accounts' : 'Retry accounts'}
            </Button>
          </Alert>
        )}
        <div className="invitation-toolbar">
          <h3>Field workers</h3>
          <Button className="quiet" disabled={!online || Boolean(busy)} onClick={() => void load()}>
            Refresh accounts
          </Button>
        </div>
        {busy === 'loading' && (
          <p role="status" className="muted">
            Loading worker accounts…
          </p>
        )}
        {selected && (
          <section
            className="invitation-new-link worker-access-confirmation"
            aria-label="Confirm worker access"
          >
            <h3 ref={confirmation} tabIndex={-1}>
              {selected.enabled ? 'Disable' : 'Reactivate'} {selected.user.name}?
            </h3>
            <p>{selected.user.email}</p>
            <p>
              {selected.enabled
                ? 'This ends all current sessions and prevents sign-in and new assignments. Existing work stays assigned; coordinate any handover separately.'
                : 'This restores sign-in with the existing password and makes this worker available for new assignments. They must sign in again.'}
            </p>
            <p className="muted">
              Saved reports, photos, drafts, and queued reports are kept. Offline devices may still
              show previously saved work.
            </p>
            <div className="invitation-actions">
              <Button
                className="primary"
                disabled={!online || Boolean(busy) || needsReload}
                onClick={() => void save()}
              >
                {busy === 'saving'
                  ? 'Saving access…'
                  : selected.enabled
                    ? 'Confirm disable'
                    : 'Confirm reactivation'}
              </Button>
              <Button
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() => {
                  setSelected(null);
                  heading.current?.focus();
                }}
              >
                Cancel change
              </Button>
            </div>
          </section>
        )}
        {page && (
          <>
            <p className="muted" role="status">
              {page.data.length} loaded · {page.total} {page.total === 1 ? 'worker' : 'workers'}
            </p>
            {page.data.length === 0 && (
              <p>No worker accounts yet. Create an invitation when someone is ready to join.</p>
            )}
            <ul className="invitation-list">
              {page.data.map((account) => (
                <li key={account.user.id}>
                  <div className="invitation-toolbar">
                    <strong>{account.user.name}</strong>
                    <Badge>{account.enabled ? 'Active' : 'Disabled'}</Badge>
                  </div>
                  <p>{account.user.email}</p>
                  <p className="muted">
                    {account.updatedAt && account.updatedBy ? (
                      <>
                        Changed by {account.updatedBy.name} ·{' '}
                        <time dateTime={account.updatedAt}>
                          {new Date(account.updatedAt).toLocaleString()}
                        </time>
                      </>
                    ) : (
                      'No access changes recorded.'
                    )}
                  </p>
                  <Button
                    className="quiet"
                    aria-label={`${account.enabled ? 'Disable' : 'Reactivate'} ${account.user.email}`}
                    disabled={!online || Boolean(busy) || needsReload}
                    onClick={() => {
                      setSelected(account);
                      setNotice('');
                      setError('');
                      requestAnimationFrame(() => confirmation.current?.focus());
                    }}
                  >
                    {account.enabled ? 'Disable worker' : 'Reactivate worker'}
                  </Button>
                </li>
              ))}
            </ul>
            {page.nextCursor && (
              <Button
                className="quiet full"
                disabled={!online || Boolean(busy)}
                onClick={() => void load(page.nextCursor!)}
              >
                Load more accounts
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
