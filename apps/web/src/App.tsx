import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Form } from './components/ui/form';
import { useEffect, useState, type FormEvent } from 'react';
import { UserSchema, type User } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import Workspace from './Workspace';
import { MapSettingsProvider } from './MapSettings';
import { client, message } from './lib';
import AccountLink from './AccountLink';
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
  useEffect(() => {
    const changed = () => setLink(accountLinkFromHash());
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  function returnToApp() {
    clearInvitationHash();
    setLink(null);
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
      onReturn={returnToApp}
      onSignIn={signIn}
    />
  ) : (
    <AuthenticatedApp initialEmail={initialEmail} />
  );
}
function AuthenticatedApp({ initialEmail }: { initialEmail: string }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!user) document.title = 'Sign in · Fieldwork';
  }, [user]);
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
          setUser(null);
          localStorage.removeItem('fieldwork.user');
        }
      })
      .finally(() => setChecking(false));
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setChecking(true);
    const data = new FormData(event.currentTarget);
    try {
      const { user } = await client.login(
        String(data.get('email')).trim(),
        String(data.get('password')),
      );
      localStorage.setItem('fieldwork.user', JSON.stringify(user));
      sessionStorage.removeItem('fieldwork.locked');
      setUser(user);
    } catch (error) {
      setError(message(error));
    } finally {
      setChecking(false);
    }
  }
  function logout() {
    void client.logout().catch(() => {});
    sessionStorage.setItem('fieldwork.locked', '1');
    localStorage.removeItem('fieldwork.user');
    setUser(null);
  }
  if (!user)
    return (
      <main className="login-page">
        <section className="login-intro">
          <span className="eyebrow">OPEN SOURCE · FIELD OPERATIONS</span>
          <h1>
            Good work.
            <br />
            On record.
          </h1>
          <p>The operations desk and field notebook for teams who keep things running.</p>
          <div className="notebook-lines" aria-hidden="true">
            <span>01 / Assign the work</span>
            <span>02 / Inspect on site</span>
            <span>03 / Review the report</span>
          </div>
          <a href="https://github.com/tedy69/fieldwork">View the project on GitHub</a>
        </section>
        <section className="login-panel">
          <div className="brand">
            Fieldwork<span className="version">v0.1</span>
          </div>
          <Card>
            <h2>Open your notebook</h2>
            <p className="muted">Sign in to your team's workspace.</p>
            <Form noValidate onSubmit={login}>
              <Label>
                Email
                <Input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="you@your-team.com"
                  defaultValue={initialEmail}
                />
              </Label>
              <Label>
                Password
                <Input
                  name="password"
                  type="password"
                  aria-label="Password"
                  autoComplete="current-password"
                  required
                />
              </Label>
              {error && <Alert className="error">{error}</Alert>}
              <Button className="primary full" disabled={checking}>
                {checking ? 'Connecting…' : 'Sign in'}
              </Button>
            </Form>
          </Card>
          <aside className="demo-note">
            <strong>Running the local demo?</strong>
            <p>
              Use manager@fieldwork.local or worker@fieldwork.local with password{' '}
              <code>fieldwork-demo</code>. These accounts exist only after seeding the demo.
            </p>
          </aside>
        </section>
      </main>
    );
  return (
    <MapSettingsProvider key={user.id}>
      <Workspace user={user} logout={logout} />
    </MapSettingsProvider>
  );
}
