import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { InvitationTokenSchema } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { client, message } from './lib';
import { clearInvitationHash } from './invitation-link';
import { Button } from './components/ui/button';
import { Form } from './components/ui/form';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { FieldSet, FieldError } from './components/ui/field';
import './invitations.css';

type Preview = Awaited<ReturnType<typeof client.previewInvitation>>;
export default function AccountLink({
  token,
  mode = 'invitation',
  onReturn,
  onSignIn,
}: {
  token: string;
  mode?: 'invitation' | 'passwordReset';
  onReturn: () => void;
  onSignIn: (email: string) => Promise<void>;
}) {
  const reset = mode === 'passwordReset';
  const linkName = reset ? 'password reset' : 'invitation';
  const [preview, setPreview] = useState<Preview | null>(null);
  const [knownEmail, setKnownEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<'loading' | 'accepting' | 'leaving' | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [needsReload, setNeedsReload] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const writing = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const confirmInput = useRef<HTMLInputElement>(null);
  const hint = useId();
  useEffect(() => {
    document.title = `${reset ? 'Password recovery' : 'Worker invitation'} · Fieldwork`;
  }, [reset]);
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
    void load();
    return () => {
      generation.current++;
    };
  }, [token]);
  useEffect(() => {
    if (done) resultHeading.current?.focus();
  }, [done]);
  async function load() {
    if (writing.current) return;
    if (!InvitationTokenSchema.safeParse(token).success) {
      setUnavailable(true);
      setError(`This ${linkName} link is incomplete. Ask your manager for a new link.`);
      return;
    }
    if (!online) {
      setError(`Reconnect to load this ${linkName}.`);
      return;
    }
    const current = ++generation.current;
    setBusy('loading');
    setError('');
    setNeedsReload(true);
    try {
      const latest = await (reset
        ? client.previewPasswordReset(token)
        : client.previewInvitation(token));
      if (current !== generation.current) return;
      setPreview(latest);
      setKnownEmail(latest.email);
      setNeedsReload(false);
      setUnavailable(false);
    } catch (error) {
      if (current !== generation.current) return;
      setError(message(error));
      if (error instanceof ApiError && error.status === 410) {
        setPreview(null);
        setUnavailable(true);
      }
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  async function accept(event: FormEvent) {
    event.preventDefault();
    if (!online || writing.current || busy || needsReload || !preview) return;
    if (password !== confirmation) {
      setError('Passwords do not match.');
      confirmInput.current?.focus();
      return;
    }
    const current = ++generation.current;
    writing.current = true;
    setBusy('accepting');
    setError('');
    setAttempted(true);
    try {
      const result = await (reset
        ? client.completePasswordReset(token, password)
        : client.acceptInvitation(token, password));
      if (current !== generation.current) return;
      if (result.user.email !== preview.email)
        throw new Error(
          `The account confirmation did not match this ${linkName}. Try signing in or contact your manager.`,
        );
      setPassword('');
      setConfirmation('');
      setDone(true);
      clearInvitationHash();
    } catch (error) {
      if (current !== generation.current) return;
      if (error instanceof ApiError && error.status === 410) {
        setPreview(null);
        setUnavailable(true);
        setError(message(error));
      } else if (error instanceof ApiError && error.status === 422) setError(message(error));
      else {
        setNeedsReload(true);
        setError(
          reset
            ? 'We could not confirm the password change. It may already be saved. Try signing in or reload this link before trying again.'
            : 'We could not confirm account setup. The account may already exist. Try signing in or reload this invitation before trying again.',
        );
      }
    } finally {
      writing.current = false;
      if (current === generation.current) setBusy(null);
    }
  }
  async function signIn() {
    if (busy || !online || !knownEmail) return;
    const current = ++generation.current;
    setBusy('leaving');
    setError('');
    try {
      await onSignIn(knownEmail);
    } catch (error) {
      if (current === generation.current)
        setError(`${message(error)} Reconnect and try opening sign-in again.`);
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  return (
    <main className="login-page">
      <section className="login-intro">
        <h1 ref={heading} tabIndex={-1}>
          {reset ? 'Return to your notebook.' : 'Join the field team.'}
        </h1>
        <p>
          {reset
            ? 'Choose a new password for your existing worker account. Saved notebook work stays on its device.'
            : 'Review your invitation and choose a password for your field notebook.'}
        </p>
      </section>
      <section className="login-panel">
        <div className="brand">
          Fieldwork<span className="version">v0.1</span>
        </div>
        <Card className="invitation-card">
          {done ? (
            <>
              <h2 ref={resultHeading} tabIndex={-1}>
                {reset ? 'Your password has changed' : 'Your account is ready'}
              </h2>
              <p role="status">Sign in with {knownEmail} and the password you chose.</p>
              <p className="muted">
                Continuing signs out any account open in this browser. Saved notebooks stay on this
                device.
              </p>
            </>
          ) : (
            <>
              <h2>
                {unavailable
                  ? reset
                    ? 'Password reset unavailable'
                    : 'Invitation unavailable'
                  : reset
                    ? 'Reset your password'
                    : 'Set up your notebook'}
              </h2>
              {busy === 'loading' && (
                <p className="muted" role="status">
                  {reset ? 'Loading password reset…' : 'Loading invitation…'}
                </p>
              )}
              {preview && !unavailable && (
                <>
                  <dl className="invitation-identity">
                    <dt>{reset ? 'Worker account' : 'Invited worker'}</dt>
                    <dd>{preview.name}</dd>
                    <dt>Email</dt>
                    <dd>{preview.email}</dd>
                    <dt>Link expires</dt>
                    <dd>
                      <time dateTime={preview.expiresAt}>
                        {new Date(preview.expiresAt).toLocaleString()}
                      </time>
                    </dd>
                  </dl>
                  {reset && (
                    <p className="muted">
                      Changing your password ends all existing sessions. Sign in again afterward;
                      saved drafts and queued photos stay on this device.
                    </p>
                  )}
                  <Form noValidate onSubmit={accept}>
                    <FieldSet disabled={Boolean(busy) || needsReload || !online}>
                      <Label>
                        Password
                        <Input
                          type="password"
                          aria-label="Password"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={256}
                          aria-describedby={hint}
                          value={password}
                          onChange={(event) => {
                            setPassword(event.target.value);
                            setError('');
                          }}
                        />
                      </Label>
                      <p id={hint} className="muted">
                        Use 12–256 characters.
                      </p>
                      <Label>
                        Confirm password
                        <Input
                          ref={confirmInput}
                          aria-label="Confirm password"
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={12}
                          maxLength={256}
                          value={confirmation}
                          onChange={(event) => {
                            setConfirmation(event.target.value);
                            setError('');
                          }}
                        />
                      </Label>
                    </FieldSet>
                    <Button
                      className="primary full"
                      disabled={!online || Boolean(busy) || needsReload}
                    >
                      {busy === 'accepting'
                        ? reset
                          ? 'Changing password…'
                          : 'Creating account…'
                        : reset
                          ? 'Change password'
                          : 'Create worker account'}
                    </Button>
                  </Form>
                </>
              )}
            </>
          )}
          {!online && (
            <Alert className="notice" role="status">
              Your entries stay here while this page is open. Reconnect to continue.
            </Alert>
          )}
          {error && <FieldError>{error}</FieldError>}
          {!done && !unavailable && needsReload && (
            <Button
              type="button"
              className="quiet full"
              disabled={!online || Boolean(busy)}
              onClick={() => void load()}
            >
              {reset ? 'Reload reset link' : 'Reload invitation'}
            </Button>
          )}
          {(done || (attempted && knownEmail)) && (
            <Button
              type="button"
              className="primary full"
              disabled={!online || Boolean(busy)}
              onClick={() => void signIn()}
            >
              {busy === 'leaving'
                ? 'Opening sign-in…'
                : done
                  ? 'Continue to sign in'
                  : 'Try signing in'}
            </Button>
          )}
          {!done && (
            <Button
              type="button"
              className="quiet full"
              disabled={busy === 'accepting' || busy === 'leaving'}
              onClick={onReturn}
            >
              Return to Fieldwork
            </Button>
          )}
        </Card>
      </section>
    </main>
  );
}
