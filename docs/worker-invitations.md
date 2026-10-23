# Worker invitations

Managers open **Worker invitations** under **Sites & checklists → Field workers**. Enter a name and email to create a 72-hour invitation. Copy the link and share it directly with the intended worker. Fieldwork does not send an email or verify that mailbox; possession of the link authorizes creation of the named worker account.

The link is shown once and kept only in the open dialog's memory. Closing the dialog or choosing **Create another invitation** removes it from the screen. The server keeps a SHA-256 token hash, so refreshing the ledger cannot recover a lost link. Revoke an unused invitation and create another when a link was lost or sent to the wrong person. A pending invitation blocks another invitation for the same normalized email until it is revoked or expires. Existing accounts cannot be replaced through invitations.

## Accept and sign in

Open the link in a browser, review the invited identity, and choose and confirm a 12–256-character password. The password rules and hashing match existing account creation. Acceptance creates a worker account only; it cannot change the name, email, or role chosen by the manager. The issuing account must still have the manager role when the link is used.

Successful acceptance clears the URL fragment and shows account confirmation. It creates no session and leaves an already-open browser account unchanged. **Continue to sign in** explicitly signs out any current browser account, then opens normal sign-in with the invited email filled in. Existing account-scoped notebooks, drafts, photos, pending reports, and dispatch journals remain on the device. Once active, the worker can also use ordinary Expo sign-in with the same server, email, and password; invitation acceptance itself is a web flow.

An offline page can retain typed values while it stays open, but cannot verify or accept a link. Password fields are temporary page state and are not an offline draft. No account is created until the API confirms acceptance. Invalid, unknown, expired, revoked, already-used, and otherwise unavailable links show recovery guidance without exposing an account directory. A malformed fragment is rejected locally before a preview request.

If an acceptance response is lost, the account may already exist. The page retains the entered values, locks another submission until a fresh preview, and offers **Try signing in**. A used link cannot create a duplicate account. If invitation creation lost its response, the manager should refresh the ledger, revoke the pending invitation, and create a new link. Failed revocation can be confirmed by refreshing; repeated revocation is a no-op. The UI never automatically retries these writes.

## Browse and revoke

The ledger shows recipients, issuer, expiry, and pending/accepted/revoked/expired state. All current managers in this single workspace can browse and revoke invitations. It loads 20 rows at a time; a failed later page retains earlier rows and can be retried. A stale cursor offers a restart. Closing discards this temporary viewer data. Offline transitions keep loaded rows visible while disabling server actions. Refresh before relying on recent acceptance or expiry.

Revoking an unused invitation prevents account creation. It does not deactivate an accepted worker account. Acceptance and revocation are serialized in a transaction so only one can win. Use **Sync now** after a worker accepts to load that worker into the workspace directory and assignment selector.

## API and SDK

Manager endpoints require current manager authorization and ordinary cookie-origin checks:

| Method | Path                                       | SDK                                        | Result                                                             |
| ------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ |
| POST   | `/api/v1/invitations`                      | `client.createInvitation({ name, email })` | 201 `{ invitation, token }`, with the token returned only here     |
| GET    | `/api/v1/invitations?limit=20&cursor=<id>` | `client.invitations(query)`                | `{ data, total, nextCursor }` without token material               |
| DELETE | `/api/v1/invitations/:id`                  | `client.revokeInvitation(id)`              | Updated invitation; repeating a revocation returns the same record |

Email is lowercased, name is trimmed, extra creation fields are rejected, and callers cannot provide a token or role. Existing accounts return 409 `ACCOUNT_EXISTS`; an unexpired pending invitation returns 409 `INVITATION_EXISTS`. List limits are 1–50, default 20, ordered by creation time and ID descending. Cursor IDs are stable across tied timestamps and new arrivals. Invalid/missing cursors return 422; unknown revocation IDs return 404; revoking an accepted invitation returns 409 `INVITATION_CLOSED`.

Two endpoints accept the invitation capability without a session:

- `POST /api/v1/invitations/preview`, through `client.previewInvitation(token)`, accepts `{ token }` and returns only `{ name, email, expiresAt }`.
- `POST /api/v1/invitations/accept`, through `client.acceptInvitation(token, password)`, accepts `{ token, password }` and returns `{ user }` with role `worker`. It sets no cookie and returns no session token.

Public bodies reject extra fields. All invitation POST routes have a 4 KiB body limit. Preview is limited to 30 requests/minute and acceptance to 10 requests/minute per client IP, alongside the server's normal rate limits. Unavailable valid-shaped tokens return 410 `INVITATION_UNAVAILABLE` with the same message. Validation errors return 422. API responses use `Cache-Control: no-store`. Worker accounts cannot list, create, or revoke invitations.

The browser constructs links from its current HTTP(S) origin as `/#invite=<token>`. Tokens travel to the API in POST bodies, never query strings or route parameters. [MDN documents that URI fragments are processed by the client and are not part of the server request](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment). Use HTTPS outside local development and share the link with its intended recipient. Anyone holding an unused link can claim that invitation.

The capability design applies the random-token, expiry, single-use, password-confirmation, and normal-sign-in principles in [OWASP's token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). This is an invitation flow, not password reset or mailbox verification. It does not claim an external security certification.

## Persistence and contributors

Schema 4 adds an `invitations` table and indexes in one SQLite transaction. A token uses 32 cryptographically random bytes encoded as base64url; only its hash is stored. Acceptance inserts the worker's salted password hash and consumes the invitation together. A failed consumption write rolls back the user insert. Existing users, sessions, assignments, receipts, reports, revisions, photos, and offline storage formats are preserved.

Back up the database and committed WAL before upgrading, then let the new server apply schema 4. Upgrade tests preserve schema-3 workspace records, reopen saved invitations, and inject an index-creation failure to prove rollback before retry. Restore the complete backup with the previous server for a full rollback; do not delete live migration markers.

- Contracts and transport: `packages/contracts/src/index.ts`, `packages/sdk/src/index.ts`.
- Routes, transactions, and shared errors: `apps/api/src/invitations.ts`, `store.ts`, `problems.ts`, `app.ts`.
- Manager ledger: `apps/web/src/WorkerInvitations.tsx`.
- Acceptance and routing: `AcceptInvitation.tsx`, `invitation-link.ts`, `App.tsx`, `invitations.css`.
- Regression coverage: `tests/invitations.test.ts`, `tests/invitation-link.test.ts`, `tests/sdk.test.ts`, `tests/e2e/invitations.spec.ts`, `tests/e2e/worker-invitation-recovery.spec.ts`.

Accepted workers can be disabled or reactivated through [worker access controls](worker-access.md). SMTP delivery, mailbox ownership checks, native invitation deep links, password recovery, invitation retention cleanup, organization boundaries, physical-device acceptance, and a full screen-reader audit remain separate work. Manager bootstrap accounts can still be created with the existing CLI.
