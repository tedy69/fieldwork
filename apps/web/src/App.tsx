import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Form } from './components/ui/form';
import { useEffect, useState, type FormEvent } from 'react';
import { UserSchema, type User } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { savedLocale, signInCopy, signInError, type Locale } from '@fieldwork/strings';
import Workspace from './Workspace';
import { MapSettingsProvider } from './MapSettings';
import { client, message } from './lib';
import AccountLink from './AccountLink';
import AuthLayout, { EntryLanguage } from './AuthLayout';
import {
  clearInvitationHash,
  invitationTokenFromHash,
  passwordResetTokenFromHash,
} from './invitation-link';
function initialUser(): User | null {
  try {
    return UserSchema.parse(JSON.parse(localStorage.getItem('fieldwork.user') ?? 'null'));
  } catch {
    return null;
  }
}

function accountLinkFromHash() {
  const invitation = invitationTokenFromHash(location.hash);
  if (invitation !== null) return { mode: 'invitation' as const, token: invitation };
  const reset = passwordResetTokenFromHash(location.hash);
  return reset === null ? null : { mode: 'passwordReset' as const, token: reset };
}
export default function App() {
  const [link, setLink] = useState(accountLinkFromHash);
  const [initialEmail, setInitialEmail] = useState('');
  const [locale, setLocale] = useState(() => {
    try {
      return savedLocale(localStorage.getItem('fieldwork.locale'), navigator.language);
    } catch {
      return savedLocale(null, navigator.language);
    }
  });
  useEffect(() => {
    const changed = () => setLink(accountLinkFromHash());
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  function returnToApp() {
    clearInvitationHash();
    setLink(null);
  }
  function changeLanguage(next: Locale) {
    setLocale(next);
    try {
      localStorage.setItem('fieldwork.locale', next);
    } catch {
      // The current page can still use the selected language.
    }
  }
  async function signIn(email: string) {
    try {
      await client.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    localStorage.removeItem('fieldwork.user');
    sessionStorage.setItem('fieldwork.locked', '1');
    setInitialEmail(email);
    returnToApp();
  }
  return link !== null ? (
    <AccountLink
      key={`${link.mode}:${link.token}`}
      mode={link.mode}
      token={link.token}
      locale={locale}
      onLanguageChange={changeLanguage}
      onReturn={returnToApp}
      onSignIn={signIn}
    />
  ) : (
    <AuthenticatedApp
      initialEmail={initialEmail}
      locale={locale}
      onLanguageChange={changeLanguage}
    />
  );
}
function AuthenticatedApp({
  initialEmail,
  locale,
  onLanguageChange,
}: {
  initialEmail: string;
  locale: Locale;
  onLanguageChange: (locale: Locale) => void;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [error, setError] = useState<{ api?: ApiError; detail: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const copy = signInCopy[locale];
  useEffect(() => {
    if (!user) document.title = `${copy.signIn} · Fieldwork`;
  }, [user, copy.signIn]);
  useEffect(() => {
    if (sessionStorage.getItem('fieldwork.locked')) {
      setChecking(false);
      return;
    }
    client
      .me()
      .then(({ user }) => {
        setUser(user);
        localStorage.setItem('fieldwork.user', JSON.stringify(user));
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          if (user?.role === 'worker') setRecoveryEmail(user.email);
          setUser(null);
          localStorage.removeItem('fieldwork.user');
        }
      })
      .finally(() => setChecking(false));
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setChecking(true);
    const data = new FormData(event.currentTarget);
    try {
      const { user } = await client.login(
        String(data.get('email')).trim(),
        String(data.get('password')),
      );
      localStorage.setItem('fieldwork.user', JSON.stringify(user));
      sessionStorage.removeItem('fieldwork.locked');
      setRecoveryEmail('');
      setUser(user);
    } catch (error) {
      setError({ api: error instanceof ApiError ? error : undefined, detail: message(error) });
    } finally {
      setChecking(false);
    }
  }
  function lockNotebook() {
    sessionStorage.setItem('fieldwork.locked', '1');
    localStorage.removeItem('fieldwork.user');
    setUser(null);
  }
  function logout() {
    void client.logout().catch(() => {});
    lockNotebook();
  }
  function signInAgain() {
    if (!user) return;
    setRecoveryEmail(user.email);
    lockNotebook();
  }
  if (!user)
    return (
      <AuthLayout locale={locale}>
        <Card>
          <div className="auth-card-heading">
            <p className="auth-caption">{copy.web.welcome}</p>
            <EntryLanguage locale={locale} onChange={onLanguageChange} />
          </div>
          <h1>{copy.web.heading}</h1>
          <p className="muted">{copy.web.intro}</p>
          <Form noValidate onSubmit={login} validationCopy={copy.web}>
            <Label>
              {copy.email}
              <Input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder={copy.emailExample}
                defaultValue={recoveryEmail || initialEmail}
              />
            </Label>
            <Label>
              {copy.password}
              <Input
                name="password"
                type="password"
                aria-label={copy.password}
                passwordLabels={copy}
                autoComplete="current-password"
                autoFocus={Boolean(recoveryEmail)}
                required
              />
            </Label>
            {error && (
              <Alert className="error">{signInError(locale, error.api, error.detail)}</Alert>
            )}
            <Button className="primary full" disabled={checking}>
              {checking ? copy.web.connecting : copy.signIn}
            </Button>
          </Form>
        </Card>
        <p className="account-help">{copy.web.help}</p>
        <details className="demo-note">
          <summary>{copy.web.demo}</summary>
          <p>
            {copy.web.demoAccounts} <code>fieldwork-demo</code>. {copy.web.demoNote}
          </p>
        </details>
      </AuthLayout>
    );
  return (
    <MapSettingsProvider key={user.id}>
      <Workspace
        user={user}
        logout={logout}
        signInAgain={signInAgain}
        language={locale}
        onLanguageChange={onLanguageChange}
      />
    </MapSettingsProvider>
  );
}
