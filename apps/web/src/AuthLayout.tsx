import type { ReactNode } from 'react';
import { signInCopy, type Locale } from '@fieldwork/strings';

/** Shared public shell for sign-in, invitations and password recovery. */
export default function AuthLayout({
  children,
  recovery = false,
  locale = 'en',
}: {
  children: ReactNode;
  recovery?: boolean;
  locale?: Locale;
}) {
  const copy = signInCopy[locale].web;
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <div className="brand">
          Fieldwork<span className="version">v0.1</span>
        </div>
        <a href="https://github.com/tedy69/fieldwork">{copy.about}</a>
      </header>
      <main className="login-page">
        <aside className="login-intro">
          <p className="auth-caption">{copy.caption}</p>
          <p className="auth-statement">
            {copy.statementStart}
            <br />
            {copy.statementEnd}
          </p>
          <div className="auth-field-note">
            <strong>{recovery ? 'Your work stays with you.' : copy.fieldNote}</strong>
            <p>{copy.retention}</p>
          </div>
        </aside>
        <section className="login-panel">{children}</section>
      </main>
      <footer className="auth-footer">{copy.footer}</footer>
    </div>
  );
}
