import { useEffect, useState, type FormEvent } from 'react';
import { UserSchema, type User } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import Workspace from './Workspace';
import { client, message } from './lib';
function initialUser(): User | null {
  try {
    return UserSchema.parse(JSON.parse(localStorage.getItem('fieldwork.user') ?? 'null'));
  } catch {
    return null;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(initialUser);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
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
          <h2>Open your notebook</h2>
          <p className="muted">Sign in to your team's workspace.</p>
          <form onSubmit={login}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@your-team.com"
              />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary full" disabled={checking}>
              {checking ? 'Connecting…' : 'Sign in'}
            </button>
          </form>
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
  return <Workspace key={user.id} user={user} logout={logout} />;
}
