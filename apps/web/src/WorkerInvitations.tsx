import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@fieldwork/sdk';
import { client, message } from './lib';
import { invitationLink } from './invitation-link';
import { Button } from './components/ui/button';
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
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { Empty } from './components';
import './invitations.css';

type Page = Awaited<ReturnType<typeof client.invitations>>;
type FreshLink = Awaited<ReturnType<typeof client.createInvitation>> & { url: string };
export default function WorkerInvitations({ online }: { online: boolean }) {
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
        setListError(message(error));
        setRestart(error instanceof ApiError && error.status === 422 && error.code === 'CURSOR');
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
      setNotice('Invitation created. Copy its link before closing.');
      created = true;
      requestAnimationFrame(() => {
        if (linkInput.current?.dataset.invitationId === receipt.invitation.id) {
          linkInput.current.focus();
          linkInput.current.select();
        }
      });
    } catch (error) {
      if (current === generation.current) {
        const definitive =
          error instanceof ApiError && [401, 403, 409, 422, 429].includes(error.status);
        setError(
          definitive
            ? message(error)
            : `${message(error)} If the response was lost, refresh invitations and revoke the pending invitation before creating another link.`,
        );
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
      setNotice('Invitation revoked. Its link can no longer create an account.');
    } catch (error) {
      if (current === generation.current)
        setError(`${message(error)} Refresh invitations to check its current state.`);
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
      if (current === generation.current)
        setNotice('Invitation link copied. Share it directly with the intended worker.');
    } catch {
      if (current === generation.current) {
        setError('Could not copy. Select the link and copy it manually.');
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
          Worker invitations
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
          <Button
            type="button"
            className="quiet"
            disabled={changing}
            onClick={() => changeOpen(false)}
          >
            Close invitations
          </Button>
        </div>
        <DialogTitle ref={heading} tabIndex={-1}>
          Worker invitations
        </DialogTitle>
        <DialogDescription>
          Create a 72-hour link for a field worker to choose their own password. Copy and share the
          link directly.
        </DialogDescription>
        {!online && (
          <Alert className="banner notice" role="status">
            Loaded invitations stay visible offline. Reconnect to create, refresh, or revoke.
          </Alert>
        )}
        {notice && (
          <p className="muted" role="status">
            {notice}
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
        {freshLink ? (
          <section aria-label="New invitation link" className="invitation-new-link">
            <h3>{freshLink.invitation.name}</h3>
            <p>{freshLink.invitation.email}</p>
            <p className="muted">
              This link is shown once. Copy it before closing or creating another invitation. Only
              the intended worker should receive it.
            </p>
            <Label>
              Invitation link
              <Input
                ref={linkInput}
                data-invitation-id={freshLink.invitation.id}
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
                {copyBusy ? 'Copying…' : 'Copy invitation link'}
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
                Create another invitation
              </Button>
            </div>
          </section>
        ) : (
          <Form noValidate aria-label="Invite a field worker" onSubmit={create}>
            <FieldSet disabled={!online || Boolean(busy)}>
              <div className="form-grid">
                <Label>
                  Worker name
                  <Input name="name" autoComplete="off" required maxLength={120} />
                </Label>
                <Label>
                  Worker email
                  <Input name="email" type="email" autoComplete="off" required maxLength={254} />
                </Label>
              </div>
            </FieldSet>
            <Button className="primary" disabled={!online || Boolean(busy)}>
              {busy === 'creating' ? 'Creating invitation…' : 'Create invitation'}
            </Button>
          </Form>
        )}
        <section aria-label="Saved worker invitations" className="invitation-ledger">
          <div className="invitation-toolbar">
            <h3>Invitations</h3>
            <Button
              type="button"
              className="quiet"
              disabled={!online || Boolean(busy)}
              onClick={() => void load()}
            >
              Refresh invitations
            </Button>
          </div>
          <p className="muted">
            Refresh to check acceptance and expiry. Use Sync now in the workspace to load newly
            accepted workers for assignment.
          </p>
          {busy === 'loading' && (
            <p className="muted" role="status">
              Loading invitations…
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
                {restart ? 'Restart invitations' : 'Retry invitations'}
              </Button>
            </Alert>
          )}
          {page && (
            <>
              <p className="muted" role="status">
                {page.data.length} loaded · {page.total}{' '}
                {page.total === 1 ? 'invitation' : 'invitations'}
              </p>
              {page.data.length === 0 && (
                <Empty
                  title="No invitations yet"
                  description="Create a link when a new field worker is ready to join."
                />
              )}
              <ul className="invitation-list">
                {page.data.map((invitation) => (
                  <li key={invitation.id}>
                    <div className="invitation-toolbar">
                      <strong>{invitation.name}</strong>
                      <Badge>{invitation.status}</Badge>
                    </div>
                    <p>{invitation.email}</p>
                    <p className="muted">
                      Created by {invitation.createdBy.name} · Expires{' '}
                      <time dateTime={invitation.expiresAt}>
                        {new Date(invitation.expiresAt).toLocaleString()}
                      </time>
                    </p>
                    {invitation.acceptedAt && (
                      <p className="muted">
                        Accepted{' '}
                        <time dateTime={invitation.acceptedAt}>
                          {new Date(invitation.acceptedAt).toLocaleString()}
                        </time>
                      </p>
                    )}
                    {invitation.revokedAt && (
                      <p className="muted">
                        Revoked{' '}
                        <time dateTime={invitation.revokedAt}>
                          {new Date(invitation.revokedAt).toLocaleString()}
                        </time>
                      </p>
                    )}
                    {invitation.status === 'pending' && (
                      <Button
                        type="button"
                        className="quiet"
                        aria-label={`Revoke invitation for ${invitation.email}`}
                        disabled={!online || Boolean(busy)}
                        onClick={() => void revoke(invitation.id)}
                      >
                        {busy === `revoking:${invitation.id}` ? 'Revoking…' : 'Revoke invitation'}
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
                  Load more invitations
                </Button>
              )}
            </>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
