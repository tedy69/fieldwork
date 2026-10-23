# Worker password recovery

Managers open **Sites & checklists → Worker accounts → Password recovery** beside a worker. Create reset link returns a one-hour link once. Copy it before closing and share it directly with the intended worker after confirming who should receive it. There is no automatic email delivery, mailbox verification, or reset notification.

The worker opens the link in a browser, checks the account details, and enters the new password twice. Completion changes the existing account password and ends all its sessions. The worker then signs in normally on the web or through Expo. Recovery creates no account or session, and does not grant manager access.

Saved inspections, reports, photos, revisions, and device notebooks stay with their original account. Resetting a password does not erase or transfer drafts. A queued report keeps its original mutation and photos; after fresh sign-in to the same account, normal synchronization can acknowledge it once or surface an existing version conflict.

## Link handling and recovery

- The link uses the current web origin and a `#reset=...` fragment. The capability travels to the API only in POST bodies, never URL query strings or route parameters. Do not share it publicly.
- Creating a replacement revokes all previous unused links for that worker. Concurrent creation leaves only the newest link usable. Issuance alone changes neither the password nor current sessions.
- Refresh password recovery reads current account access and the latest reset metadata. It cannot recover a raw token after dismissal or a lost creation response. Create a replacement when a new one-time link is needed.
- Revoke reset link invalidates that specific link. The UI then reloads the latest record: if another manager created a newer link, it shows that record and explains that the newer link needs separate attention.
- Conflicts or uncertain writes lock further changes until a fresh read succeeds. A pending write blocks closing the recovery section or accounts dialog. Dismissed reads cannot replace another worker's details.
- Loaded details remain visible offline; reads and writes disable. A displayed link can still be copied locally. No password entry is stored by the application; an open public page retains entries only in memory during a temporary connection failure.
- If completion succeeds but its response is lost, Try signing in uses normal authentication. Reloading an already-used link reports that it is unavailable. The client does not automatically repeat a password change.

Managers cannot issue links for disabled workers. A link is bound to the worker's access version, so disabling and later reactivating the account never restores that link. Create a new one after reactivation. Unknown, expired, used, revoked, replaced, role-changed, or access-changed links return the same public unavailable response. Manager bootstrap and manager password recovery remain separate administration work.

The capability, expiry, single-use, password-confirmation, ordinary-sign-in, and session-revocation choices apply principles from [OWASP's password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). This manager-assisted flow does not implement every recommendation in that guide or claim a security certification. It relies on the manager to identify the recipient and share the link through an appropriate channel.

## API and SDK

Manager endpoints require a current manager. Cookie writes retain the existing allowed-Origin check.

| Endpoint                                             | SDK                                       | Result                                                           |
| ---------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/v1/workers/:id/password-reset`             | `client.passwordReset(id)`                | `{ reset }`, null before any issuance; latest metadata afterward |
| `POST /api/v1/workers/:id/password-reset`            | `client.createPasswordReset(id, input)`   | `{ reset, token }`, status 201                                   |
| `DELETE /api/v1/workers/:id/password-reset/:resetId` | `client.revokePasswordReset(id, resetId)` | The specific reset metadata                                      |

Creation accepts only `{ "expectedAccessVersion": 0 }`, using the version from the worker account. A stale version returns 409 `ACCOUNT_CHANGED`; a disabled target returns 409 `WORKER_DISABLED`. Unknown and manager targets return 404. Ordinary workers receive 403 before lookup or input validation. Issuance has a 4 KiB body limit and a 10/minute per-IP route limit alongside normal server limits.

Reset metadata contains `{ id, workerId, createdAt, expiresAt, createdBy, status, usedAt, revokedAt }`. Status is `pending`, `used`, `revoked`, `expired`, or `unavailable`. Only creation returns the raw token. Latest metadata uses the stored sequence, including when creation timestamps tie. Revocation is idempotent for an unused link, stays scoped to the target worker, returns 409 `RESET_USED` after use, and cannot revoke a newer link by accident.

Public endpoints need the capability rather than a session:

- `POST /api/v1/password-resets/preview`, through `client.previewPasswordReset(token)`, accepts `{ token }` and returns only `{ name, email, expiresAt }`.
- `POST /api/v1/password-resets/complete`, through `client.completePasswordReset(token, password)`, accepts `{ token, password }` and returns `{ user }` with role `worker`. It sets no cookie and returns no session token.

Bodies reject extra fields. Tokens contain 32 random bytes encoded as base64url; storage retains only SHA-256 hashes. Passwords use the existing salted password-hash implementation and the same 12–256 character policy as invitations. Public preview is limited to 30/minute and completion to 10/minute per client IP; both have 4 KiB body limits. Unavailable valid-shaped tokens return 410 `RESET_UNAVAILABLE`, malformed input returns 422, and API responses retain `Cache-Control: no-store`.

## Persistence and contributor entry points

Schema 6 adds `password_resets` and its worker/sequence index in one SQLite transaction. Earlier accounts, access flags/events, sessions, catalog, inspections, report mutations, recurring receipts, and device storage formats are preserved. Old reset metadata remains stored after replacement or completion; the UI currently shows only the latest link.

Completion checks current worker access, role, issuer role, expiry, and token state inside the transaction. It updates the password, revokes target sessions, consumes the token, and revokes any remaining unused reset links together. A failure in any write rolls back all changes. A concurrent disable still leaves the worker disabled; recovery never reactivates access. Other accounts' sessions are unaffected.

Back up the database and committed WAL before upgrading. Let the new server apply schema 6; tests reconstruct schema 5, preserve existing records, reopen usable links, and inject an index failure to verify migration rollback and retry. Restore the complete pre-upgrade backup with the previous server for a full rollback. Do not delete migration markers or run older code against access-control state it does not enforce.

- Contracts and transport: `packages/contracts/src/index.ts`, `packages/sdk/src/index.ts`.
- Routes and migration: `apps/api/src/password-resets.ts`, `app.ts`, `store.ts`.
- Manager controls: `apps/web/src/WorkerPasswordReset.tsx`, `WorkerAccounts.tsx`.
- Shared invitation/recovery page and fragment routing: `AccountLink.tsx`, `App.tsx`, `invitation-link.ts`.
- Coverage: `tests/password-resets.test.ts`, `tests/invitation-link.test.ts`, `tests/sdk.test.ts`, `tests/e2e/password-recovery.spec.ts`, and older migration fixtures.

Automated email/notifications, manager recovery, reset-history browsing/retention cleanup, native deep links, organization boundaries, physical-device acceptance, and a complete screen-reader audit remain separate work. Native users open recovery links in a browser and return to normal Expo sign-in afterward.
