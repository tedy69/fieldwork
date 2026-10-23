import { useEffect, useRef, useState } from 'react';
import type { WorkerAccount } from '@fieldwork/contracts';
import { client, message } from './lib';
import { passwordResetLink } from './invitation-link';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';

type Reset = Awaited<ReturnType<typeof client.passwordReset>>['reset'];
export default function WorkerPasswordReset({
  worker,
  online,
  onWriting,
  onAccount,
  onClose,
}: {
  worker: WorkerAccount;
  online: boolean;
  onWriting: (active: boolean) => void;
  onAccount: (account: WorkerAccount) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<WorkerAccount | null>(null);
  const [reset, setReset] = useState<Reset>(null);
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState<'loading' | 'creating' | 'revoking' | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const writing = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const link = useRef<HTMLInputElement>(null);
  useEffect(() => {
    heading.current?.focus();
    void load();
    return () => {
      generation.current++;
    };
  }, [worker.user.id]);
  async function load() {
    if (!online || writing.current) return;
    const request = ++generation.current;
    setBusy('loading');
    setError('');
    setCopyBusy(false);
    try {
      const [account, loaded] = await Promise.all([
        client.worker(worker.user.id),
        client.passwordReset(worker.user.id),
      ]);
      if (request !== generation.current) return;
      setCurrent(account);
      setReset(loaded.reset);
      setNeedsReload(false);
      onAccount(account);
      setFresh((previous) =>
        previous && loaded.reset?.id === previous.id && loaded.reset.status === 'pending'
          ? previous
          : null,
      );
      setNotice('Password recovery refreshed.');
    } catch (error) {
      if (request === generation.current) {
        setError(message(error));
        setNeedsReload(true);
      }
    } finally {
      if (request === generation.current) setBusy(null);
    }
  }
  async function change(kind: 'creating' | 'revoking') {
    if (
      !online ||
      busy ||
      writing.current ||
      needsReload ||
      !current ||
      (kind === 'creating' && !current.enabled) ||
      (kind === 'revoking' && (!reset || reset.status !== 'pending'))
    )
      return;
    const request = ++generation.current;
    writing.current = true;
    onWriting(true);
    setBusy(kind);
    setCopyBusy(false);
    setError('');
    setNotice('');
    setFresh(null);
    try {
      if (kind === 'creating') {
        const created = await client.createPasswordReset(current.user.id, {
          expectedAccessVersion: current.version,
        });
        if (request !== generation.current) return;
        setReset(created.reset);
        setFresh({ id: created.reset.id, url: passwordResetLink(location.origin, created.token) });
        setNotice('Reset link created. Copy it before closing.');
        requestAnimationFrame(() => {
          if (link.current?.dataset.resetId === created.reset.id) {
            link.current.focus();
            link.current.select();
          }
        });
      } else {
        const revoked = await client.revokePasswordReset(current.user.id, reset!.id);
        const latest = await client.passwordReset(current.user.id);
        if (request !== generation.current) return;
        setReset(latest.reset);
        setNotice(
          latest.reset && latest.reset.id !== revoked.id
            ? 'Selected link revoked. Another reset link is now current; check its state separately.'
            : 'Reset link revoked.',
        );
      }
    } catch (error) {
      if (request === generation.current) {
        setError(
          `${message(error)} Refresh password recovery to check the saved state before trying again.`,
        );
        setNeedsReload(true);
      }
    } finally {
      writing.current = false;
      onWriting(false);
      if (request === generation.current) setBusy(null);
    }
  }
  async function copy() {
    if (!fresh || busy || copyBusy) return;
    const request = generation.current;
    setCopyBusy(true);
    setError('');
    try {
      await navigator.clipboard.writeText(fresh.url);
      if (request === generation.current)
        setNotice('Reset link copied. Share it directly with the intended worker.');
    } catch {
      if (request === generation.current) {
        setError('Could not copy. Select the reset link and copy it manually.');
        link.current?.focus();
        link.current?.select();
      }
    } finally {
      if (request === generation.current) setCopyBusy(false);
    }
  }
  const changing = busy === 'creating' || busy === 'revoking';
  return (
    <section
      className="invitation-new-link worker-access-confirmation"
      aria-label="Worker password recovery"
    >
      <div className="invitation-toolbar">
        <h3 id="worker-password-recovery-title" ref={heading} tabIndex={-1}>
          Password recovery: {current?.user.name ?? worker.user.name}
        </h3>
        <Button className="quiet" disabled={changing} onClick={onClose}>
          Close recovery
        </Button>
      </div>
      <p>{current?.user.email ?? worker.user.email}</p>
      <p className="muted">
        Create a one-hour link for this worker to choose a new password. Share it directly after
        confirming who should receive it. No email is sent automatically.
      </p>
      <p className="muted">
        A new link replaces previous reset links. The password changes and existing sessions end
        only when the link is used. Saved inspections and device drafts stay with this account.
      </p>
      {!online && (
        <Alert role="status" className="banner notice">
          Loaded recovery details stay visible offline. Reconnect to refresh, create, or revoke a
          link.
        </Alert>
      )}
      {busy === 'loading' && (
        <p className="muted" role="status">
          Loading password recovery…
        </p>
      )}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {error && (
        <Alert className="banner error">
          <p>{error}</p>
        </Alert>
      )}
      <Button className="quiet" disabled={!online || Boolean(busy)} onClick={() => void load()}>
        Refresh password recovery
      </Button>
      {current && (
        <>
          {!current.enabled && (
            <p className="muted">
              This worker is disabled. Reactivate the account separately before creating a reset
              link.
            </p>
          )}
          {reset ? (
            <div>
              <p>
                <strong>Latest reset link</strong> <Badge>{reset.status}</Badge>
              </p>
              <p className="muted">
                Created by {reset.createdBy.name} · Expires{' '}
                <time dateTime={reset.expiresAt}>{new Date(reset.expiresAt).toLocaleString()}</time>
              </p>
            </div>
          ) : (
            <p>No reset link has been issued for this worker.</p>
          )}
          {fresh && (
            <>
              <Label>
                Reset link
                <Input
                  ref={link}
                  data-reset-id={fresh.id}
                  readOnly
                  value={fresh.url}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </Label>
              <p className="muted">
                This link is shown once. Copy it before closing or replacing it.
              </p>
              <Button
                className="primary"
                disabled={Boolean(busy) || copyBusy}
                onClick={() => void copy()}
              >
                {copyBusy ? 'Copying…' : 'Copy reset link'}
              </Button>
            </>
          )}
          <div className="invitation-actions">
            <Button
              className="quiet"
              disabled={!online || Boolean(busy) || needsReload || !current.enabled}
              onClick={() => void change('creating')}
            >
              {busy === 'creating'
                ? 'Creating reset link…'
                : reset?.status === 'pending'
                  ? 'Replace reset link'
                  : 'Create reset link'}
            </Button>
            {reset?.status === 'pending' && (
              <Button
                className="quiet"
                disabled={!online || Boolean(busy) || needsReload}
                onClick={() => void change('revoking')}
              >
                {busy === 'revoking' ? 'Revoking reset link…' : 'Revoke reset link'}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
