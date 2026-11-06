import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WorkerAccount } from '@fieldwork/contracts';
import { languageTags, type Locale } from '@fieldwork/strings';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { client, message } from './lib';
import { passwordResetLink } from './invitation-link';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import { ActionGroup } from './components';
import { workerPasswordRecoveryCopy } from './worker-password-recovery-copy';

type Reset = Awaited<ReturnType<typeof client.passwordReset>>['reset'];
export default function WorkerPasswordReset({
  worker,
  online,
  locale,
  onWriting,
  onAccount,
  onClose,
}: {
  worker: WorkerAccount;
  online: boolean;
  locale: Locale;
  onWriting: (active: boolean) => void;
  onAccount: (account: WorkerAccount) => void;
  onClose: () => void;
}) {
  const copyText = workerPasswordRecoveryCopy[locale];
  const date = new Intl.DateTimeFormat(languageTags[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
  useLayoutEffect(() => {
    if (fresh) {
      link.current?.focus();
      link.current?.select();
    }
  }, [fresh]);
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
      setNotice(copyText.refreshed);
    } catch (error) {
      if (request === generation.current) {
        setError(locale === 'en' ? message(error) : copyText.loadFailed);
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
        setNotice(copyText.created);
      } else {
        const revoked = await client.revokePasswordReset(current.user.id, reset!.id);
        const latest = await client.passwordReset(current.user.id);
        if (request !== generation.current) return;
        setReset(latest.reset);
        setNotice(
          latest.reset && latest.reset.id !== revoked.id ? copyText.otherCurrent : copyText.revoked,
        );
      }
    } catch (error) {
      if (request === generation.current) {
        setError(
          `${locale === 'en' ? message(error) : copyText.changeFailed} ${copyText.refreshBeforeRetry}`,
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
      if (request === generation.current) setNotice(copyText.copied);
    } catch {
      if (request === generation.current) {
        setError(copyText.copyFailed);
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
      lang={locale}
      className="invitation-new-link worker-access-confirmation"
      aria-label={copyText.region}
    >
      <div className="invitation-toolbar">
        <h3 id="worker-password-recovery-title" ref={heading} tabIndex={-1}>
          {copyText.title(current?.user.name ?? worker.user.name)}
        </h3>
        <ActionGroup>
          <IconButton
            label={copyText.refresh}
            className="quiet"
            disabled={!online || Boolean(busy)}
            onClick={() => void load()}
          >
            <ArrowClockwiseIcon aria-hidden="true" />
          </IconButton>
          <IconButton
            label={copyText.close}
            className="quiet"
            disabled={changing}
            onClick={onClose}
          >
            <XIcon aria-hidden="true" />
          </IconButton>
        </ActionGroup>
      </div>
      <p>{current?.user.email ?? worker.user.email}</p>
      <p className="muted">{copyText.intro}</p>
      <p className="muted">{copyText.effect}</p>
      {!online && (
        <Alert role="status" className="banner notice">
          {copyText.offline}
        </Alert>
      )}
      {busy === 'loading' && (
        <p className="muted" role="status">
          {copyText.loading}
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
      {current && (
        <>
          {!current.enabled && <p className="muted">{copyText.disabled}</p>}
          {reset ? (
            <div>
              <p>
                <strong>{copyText.latest}</strong> <Badge>{copyText.statuses[reset.status]}</Badge>
              </p>
              <p className="muted">
                {copyText.createdBy(reset.createdBy.name)} · {copyText.expires}{' '}
                <time dateTime={reset.expiresAt}>{date.format(new Date(reset.expiresAt))}</time>
              </p>
            </div>
          ) : (
            <p>{copyText.empty}</p>
          )}
          {fresh && (
            <>
              <Label>
                {copyText.link}
                <Input
                  ref={link}
                  readOnly
                  value={fresh.url}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </Label>
              <p className="muted">{copyText.oneTime}</p>
              <Button
                className="primary"
                disabled={Boolean(busy) || copyBusy}
                onClick={() => void copy()}
              >
                <CopyIcon aria-hidden="true" /> {copyBusy ? copyText.copying : copyText.copy}
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
                ? copyText.creating
                : reset?.status === 'pending'
                  ? copyText.replace
                  : copyText.create}
            </Button>
            {reset?.status === 'pending' && (
              <Button
                className="quiet"
                disabled={!online || Boolean(busy) || needsReload}
                onClick={() => void change('revoking')}
              >
                {busy === 'revoking' ? copyText.revoking : copyText.revoke}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
