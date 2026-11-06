import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@fieldwork/sdk';
import { languageTags, signInCopy, type Locale } from '@fieldwork/strings';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react/dist/csr/EnvelopeSimple';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { client, message } from './lib';
import { invitationLink } from './invitation-link';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Form } from './components/ui/form';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Badge } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import { FieldSet, FieldError } from './components/ui/field';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { Empty } from './components';
import { workerInvitationsCopy } from './worker-invitations-copy';
import './invitations.css';

type Page = Awaited<ReturnType<typeof client.invitations>>;
type FreshLink = Awaited<ReturnType<typeof client.createInvitation>> & { url: string };
export default function WorkerInvitations({ online, locale }: { online: boolean; locale: Locale }) {
  const copyText = workerInvitationsCopy[locale];
  const date = new Intl.DateTimeFormat(languageTags[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [freshLink, setFreshLink] = useState<FreshLink | null>(null);
  const [busy, setBusy] = useState<'loading' | 'creating' | `revoking:${string}` | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [restart, setRestart] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const writing = useRef(false);
  const attemptedCursor = useRef<string | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const changing = busy === 'creating' || Boolean(busy?.startsWith('revoking:'));
  useEffect(() => {
    if (open) void load();
    return () => {
      generation.current++;
    };
  }, [open]);
  useLayoutEffect(() => {
    if (freshLink) {
      linkInput.current?.focus();
      linkInput.current?.select();
    }
  }, [freshLink]);
  function changeOpen(next: boolean) {
    if (!next && writing.current) return;
    generation.current++;
    setOpen(next);
    setPage(null);
    setFreshLink(null);
    setBusy(null);
    setCopyBusy(false);
    setError('');
    setListError('');
    setNotice('');
    setRestart(false);
  }
  async function load(cursor?: string) {
    if (!online || writing.current) return;
    const current = ++generation.current;
    attemptedCursor.current = cursor;
    setBusy('loading');
    setCopyBusy(false);
    setError('');
    setNotice('');
    setListError('');
    setRestart(false);
    try {
      const loaded = await client.invitations({ limit: 20, ...(cursor ? { cursor } : {}) });
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
      setFreshLink((previous) => {
        const current = loaded.data.find((row) => row.id === previous?.invitation.id);
        return current && current.status !== 'pending' ? null : previous;
      });
    } catch (error) {
      if (current === generation.current) {
        const stale = error instanceof ApiError && error.status === 422 && error.code === 'CURSOR';
        setListError(
          locale === 'en' ? message(error) : stale ? copyText.cursor : copyText.loadFailed,
        );
        setRestart(stale);
      }
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || busy || writing.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = ++generation.current;
    writing.current = true;
    setBusy('creating');
    setCopyBusy(false);
    setError('');
    setNotice('');
    let created = false;
    try {
      const receipt = await client.createInvitation({
        name: String(data.get('name')).trim(),
        email: String(data.get('email')).trim(),
      });
      if (current !== generation.current) return;
      setFreshLink({ ...receipt, url: invitationLink(location.origin, receipt.token) });
      form.reset();
      setNotice(copyText.created);
      created = true;
    } catch (error) {
      if (current === generation.current) {
        const definitive =
          error instanceof ApiError && [401, 403, 409, 422, 429].includes(error.status);
        if (locale === 'en') {
          const detail = message(error);
          setError(definitive ? detail : `${detail} ${copyText.uncertain}`);
        } else {
          const code = error instanceof ApiError ? error.code : undefined;
          const rejected =
            code === 'ACCOUNT_EXISTS'
              ? copyText.exists
              : code === 'INVITATION_EXISTS'
                ? copyText.pending
                : copyText.rejected;
          setError(definitive ? rejected : copyText.uncertain);
        }
      }
    } finally {
      writing.current = false;
      if (current === generation.current) setBusy(null);
    }
    if (created && current === generation.current) void load();
  }
  async function revoke(id: string) {
    if (!online || busy || writing.current) return;
    const current = ++generation.current;
    writing.current = true;
    setBusy(`revoking:${id}`);
    setCopyBusy(false);
    setError('');
    setNotice('');
    try {
      const updated = await client.revokeInvitation(id);
      if (current !== generation.current) return;
      setPage((previous) =>
        previous
          ? { ...previous, data: previous.data.map((row) => (row.id === id ? updated : row)) }
          : previous,
      );
      setFreshLink((previous) => (previous?.invitation.id === id ? null : previous));
      setNotice(copyText.revokeDone);
    } catch (error) {
      if (current === generation.current)
        setError(
          `${locale === 'en' ? message(error) : copyText.revokeFailed} ${copyText.refreshBeforeRetry}`,
        );
    } finally {
      writing.current = false;
      if (current === generation.current) setBusy(null);
    }
  }
  async function copy() {
    if (!freshLink || changing || copyBusy) return;
    const current = generation.current;
    setCopyBusy(true);
    setError('');
    try {
      await navigator.clipboard.writeText(freshLink.url);
      if (current === generation.current) setNotice(copyText.copied);
    } catch {
      if (current === generation.current) {
        setError(copyText.copyFailed);
        linkInput.current?.focus();
        linkInput.current?.select();
      }
    } finally {
      if (current === generation.current) setCopyBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button ref={trigger} className="quiet" disabled={!online}>
          <EnvelopeSimpleIcon aria-hidden="true" /> {copyText.title}
        </Button>
      </DialogTrigger>
      <DialogContent
        size="directory"
        lang={locale}
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
              {copyText.title}
            </DialogTitle>
            <DialogDescription>{copyText.intro}</DialogDescription>
          </div>
          <IconButton
            label={copyText.close}
            className="quiet"
            disabled={changing}
            onClick={() => changeOpen(false)}
          >
            <XIcon aria-hidden="true" />
          </IconButton>
        </DialogHeader>
        {!online && (
          <Alert className="banner notice" role="status">
            {copyText.offline}
          </Alert>
        )}
        {notice && (
          <p className="muted" role="status">
            {notice}
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
        {freshLink ? (
          <section aria-label={copyText.newLink} className="invitation-new-link">
            <h3>{freshLink.invitation.name}</h3>
            <p>{freshLink.invitation.email}</p>
            <p className="muted">{copyText.oneTime}</p>
            <Label>
              {copyText.link}
              <Input
                ref={linkInput}
                readOnly
                value={freshLink.url}
                onFocus={(event) => event.currentTarget.select()}
              />
            </Label>
            <div className="invitation-actions">
              <Button
                type="button"
                className="primary"
                disabled={changing || copyBusy}
                onClick={() => void copy()}
              >
                <CopyIcon aria-hidden="true" /> {copyBusy ? copyText.copying : copyText.copy}
              </Button>
              <Button
                type="button"
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() => {
                  generation.current++;
                  setFreshLink(null);
                  setCopyBusy(false);
                  setNotice('');
                  setError('');
                }}
              >
                {copyText.another}
              </Button>
            </div>
          </section>
        ) : (
          <Form
            noValidate
            validationCopy={locale === 'id' ? signInCopy.id.web : undefined}
            aria-label={copyText.invite}
            onSubmit={create}
          >
            <FieldSet disabled={!online || Boolean(busy)}>
              <div className="form-grid">
                <Label>
                  {copyText.name}
                  <Input name="name" autoComplete="off" required maxLength={120} />
                </Label>
                <Label>
                  {copyText.email}
                  <Input name="email" type="email" autoComplete="off" required maxLength={254} />
                </Label>
              </div>
            </FieldSet>
            <Button className="primary" disabled={!online || Boolean(busy)}>
              {busy === 'creating' ? copyText.creating : copyText.create}
            </Button>
          </Form>
        )}
        <section aria-label={copyText.saved} className="invitation-ledger">
          <div className="invitation-toolbar">
            <h3>{copyText.ledger}</h3>
            <IconButton
              label={copyText.refresh}
              className="quiet"
              disabled={!online || Boolean(busy)}
              onClick={() => void load()}
            >
              <ArrowClockwiseIcon aria-hidden="true" />
            </IconButton>
          </div>
          <p className="muted">{copyText.refreshHint}</p>
          {busy === 'loading' && (
            <p className="muted" role="status">
              {copyText.loading}
            </p>
          )}
          {listError && (
            <Alert className="banner error">
              <p>{listError}</p>
              <Button
                type="button"
                className="quiet"
                disabled={!online || Boolean(busy)}
                onClick={() => void load(restart ? undefined : attemptedCursor.current)}
              >
                {restart ? copyText.restart : copyText.retry}
              </Button>
            </Alert>
          )}
          {page && (
            <>
              <p className="muted" role="status">
                {copyText.count(page.data.length, page.total)}
              </p>
              {page.data.length === 0 && (
                <Empty title={copyText.empty} description={copyText.emptyHint} />
              )}
              <ul className="invitation-list">
                {page.data.map((invitation) => (
                  <li key={invitation.id}>
                    <div className="invitation-toolbar">
                      <strong>{invitation.name}</strong>
                      <Badge>{copyText.statuses[invitation.status]}</Badge>
                    </div>
                    <p>{invitation.email}</p>
                    <p className="muted">
                      {copyText.createdBy(invitation.createdBy.name)} · {copyText.expires}{' '}
                      <time dateTime={invitation.expiresAt}>
                        {date.format(new Date(invitation.expiresAt))}
                      </time>
                    </p>
                    {invitation.acceptedAt && (
                      <p className="muted">
                        {copyText.accepted}{' '}
                        <time dateTime={invitation.acceptedAt}>
                          {date.format(new Date(invitation.acceptedAt))}
                        </time>
                      </p>
                    )}
                    {invitation.revokedAt && (
                      <p className="muted">
                        {copyText.revoked}{' '}
                        <time dateTime={invitation.revokedAt}>
                          {date.format(new Date(invitation.revokedAt))}
                        </time>
                      </p>
                    )}
                    {invitation.status === 'pending' && (
                      <Button
                        type="button"
                        className="quiet"
                        aria-label={copyText.revokeFor(invitation.email)}
                        disabled={!online || Boolean(busy)}
                        onClick={() => void revoke(invitation.id)}
                      >
                        {busy === `revoking:${invitation.id}` ? copyText.revoking : copyText.revoke}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {page.nextCursor && (
                <Button
                  type="button"
                  className="quiet full"
                  disabled={!online || Boolean(busy)}
                  onClick={() => void load(page.nextCursor!)}
                >
                  {copyText.more}
                </Button>
              )}
            </>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
