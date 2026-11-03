import type { ReactNode } from 'react';

/** Shared public shell for sign-in, invitations and password recovery. */
export default function AuthLayout({
  children,
  recovery = false,
}: {
  children: ReactNode;
  recovery?: boolean;
}) {
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <div className="brand">
          Fieldwork<span className="version">v0.1</span>
        </div>
        <a href="https://github.com/tedy69/fieldwork">About the project</a>
      </header>
      <main className="login-page">
        <aside className="login-intro">
          <p className="auth-caption">The field operations journal</p>
          <p className="auth-statement">
            Work happens on site.
            <br />
            Keep the whole story.
          </p>
          <div className="auth-field-note">
            <strong>
              {recovery ? 'Your work stays with you.' : 'A notebook that goes with the work.'}
            </strong>
            <p>
              Open assignments while connected. Your checklist, notes and photos stay on this device
              until the server confirms them.
            </p>
          </div>
        </aside>
        <section className="login-panel">{children}</section>
      </main>
      <footer className="auth-footer">Fieldwork · Open-source field operations</footer>
    </div>
  );
}
