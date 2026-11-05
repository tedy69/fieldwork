import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { InvitationTokenSchema } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { accountLinkCopy, signInCopy, type Locale } from '@fieldwork/strings';
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
import AuthLayout, { EntryLanguage } from './AuthLayout';

type Preview = Awaited<ReturnType<typeof client.previewInvitation>>;
export default function AccountLink({
  token,
  mode = 'invitation',
  locale,
  onLanguageChange,
  onReturn,
  onSignIn,
}: {
  token: string;
  mode?: 'invitation' | 'passwordReset';
  locale: Locale;
  onLanguageChange: (locale: Locale) => void;
  onReturn: () => void;
  onSignIn: (email: string) => Promise<void>;
}) {
  const reset = mode === 'passwordReset';
  const copy = accountLinkCopy[locale];
  const link = copy[mode];
  const fields = signInCopy[locale];
  const validation = useMemo(
    () => ({ ...fields.web, tooShort: copy.passwordLength }),
    [fields, copy],
  );
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
  const [error, setError] = useState<Record<Locale, string> | null>(null);
  const generation = useRef(0);
  const writing = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const confirmInput = useRef<HTMLInputElement>(null);
  const hint = useId();
  useEffect(() => {
    document.title = `${link.title} · Fieldwork`;
  }, [link.title]);
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
  function linkProblem(
    key: 'incomplete' | 'reconnect' | 'expired' | 'failed' | 'uncertain',
    detail?: string,
  ) {
    setError({ en: detail ?? accountLinkCopy.en[mode][key], id: accountLinkCopy.id[mode][key] });
  }
  async function load() {
    if (writing.current) return;
    if (!InvitationTokenSchema.safeParse(token).success) {
      setUnavailable(true);
      linkProblem('incomplete');
      return;
    }
    if (!online) {
      linkProblem('reconnect');
      return;
    }
    const current = ++generation.current;
    setBusy('loading');
    setError(null);
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
      if (error instanceof ApiError && error.status === 410) {
        setPreview(null);
        setUnavailable(true);
        linkProblem('expired', message(error));
      } else linkProblem('failed', message(error));
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  async function accept(event: FormEvent) {
    event.preventDefault();
    if (!online || writing.current || busy || needsReload || !preview) return;
    if (password !== confirmation) {
      setError({
        en: accountLinkCopy.en.passwordsDiffer,
        id: accountLinkCopy.id.passwordsDiffer,
      });
      confirmInput.current?.focus();
      return;
    }
    const current = ++generation.current;
    writing.current = true;
    setBusy('accepting');
    setError(null);
    setAttempted(true);
    try {
      const result = await (reset
        ? client.completePasswordReset(token, password)
        : client.acceptInvitation(token, password));
      if (current !== generation.current) return;
      if (result.user.email !== preview.email) throw new Error('Account confirmation mismatch.');
      setPassword('');
      setConfirmation('');
      setDone(true);
      clearInvitationHash();
    } catch (error) {
      if (current !== generation.current) return;
      if (error instanceof ApiError && error.status === 410) {
        setPreview(null);
        setUnavailable(true);
        linkProblem('expired', message(error));
      } else if (error instanceof ApiError && error.status === 422) {
        setError({ en: message(error), id: accountLinkCopy.id.invalidPassword });
      } else {
        setNeedsReload(true);
        linkProblem('uncertain');
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
    setError(null);
    try {
      await onSignIn(knownEmail);
    } catch (error) {
      if (current === generation.current)
        setError({
          en: `${message(error)} ${accountLinkCopy.en.signInFailed}`,
          id: accountLinkCopy.id.signInFailed,
        });
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  return (
    <AuthLayout recovery locale={locale}>
      <div className="account-introduction">
        <div className="auth-card-heading">
          <h1 ref={heading} tabIndex={-1}>
            {link.heading}
          </h1>
          <EntryLanguage locale={locale} onChange={onLanguageChange} />
        </div>
        <p>{link.intro}</p>
      </div>
      <Card className="invitation-card">
        {done ? (
          <>
            <h2 ref={resultHeading} tabIndex={-1}>
              {link.ready}
            </h2>
            <p role="status">{copy.readyToSignIn(knownEmail)}</p>
            <p className="muted">{copy.browserSignOut}</p>
          </>
        ) : (
          <>
            <h2>{unavailable ? link.unavailable : link.actionHeading}</h2>
            {busy === 'loading' && (
              <p className="muted" role="status">
                {link.loading}
              </p>
            )}
            {preview && !unavailable && (
              <>
                <dl className="invitation-identity">
                  <dt>{link.person}</dt>
                  <dd>{preview.name}</dd>
                  <dt>{fields.email}</dt>
                  <dd>{preview.email}</dd>
                  <dt>{copy.linkExpires}</dt>
                  <dd>
                    <time dateTime={preview.expiresAt}>
                      {new Date(preview.expiresAt).toLocaleString(
                        locale === 'id' ? 'id-ID' : undefined,
                      )}
                    </time>
                  </dd>
                </dl>
                {reset && <p className="muted">{copy.sessionNote}</p>}
                <Form noValidate onSubmit={accept} validationCopy={validation}>
                  <FieldSet disabled={Boolean(busy) || needsReload || !online}>
                    <Label>
                      {fields.password}
                      <Input
                        type="password"
                        aria-label={fields.password}
                        passwordLabels={fields}
                        autoComplete="new-password"
                        required
                        minLength={12}
                        maxLength={256}
                        aria-describedby={hint}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setError(null);
                        }}
                      />
                    </Label>
                    <p id={hint} className="muted">
                      {copy.passwordHint}
                    </p>
                    <Label>
                      {copy.confirmPassword}
                      <Input
                        ref={confirmInput}
                        aria-label={copy.confirmPassword}
                        passwordLabels={fields}
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={12}
                        maxLength={256}
                        value={confirmation}
                        onChange={(event) => {
                          setConfirmation(event.target.value);
                          setError(null);
                        }}
                      />
                    </Label>
                  </FieldSet>
                  <Button
                    className="primary full"
                    disabled={!online || Boolean(busy) || needsReload}
                  >
                    {busy === 'accepting' ? link.submitting : link.submit}
                  </Button>
                </Form>
              </>
            )}
          </>
        )}
        {!online && (
          <Alert className="notice" role="status">
            {copy.offline}
          </Alert>
        )}
        {error && <FieldError>{error[locale]}</FieldError>}
        {!done && !unavailable && needsReload && (
          <Button
            type="button"
            className="quiet full"
            disabled={!online || Boolean(busy)}
            onClick={() => void load()}
          >
            {link.reload}
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
              ? copy.openingSignIn
              : done
                ? copy.continueToSignIn
                : copy.trySignIn}
          </Button>
        )}
        {!done && (
          <Button
            type="button"
            className="quiet full"
            disabled={busy === 'accepting' || busy === 'leaving'}
            onClick={onReturn}
          >
            {copy.returnToFieldwork}
          </Button>
        )}
      </Card>
    </AuthLayout>
  );
}
