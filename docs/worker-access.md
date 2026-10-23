# Worker account access

Managers open **Sites & checklists → Worker accounts** to view active and disabled field workers. The directory loads online, 20 records at a time. Refresh accounts updates access state and the assignment catalog without submitting the manager's outbox. Loaded records remain readable offline until the dialog closes.

Choose **Disable worker**, read the confirmation, then **Confirm disable**. The server ends every session for that worker and prevents sign-in, new assignments, recurring batches, and reassignment to that account. Other workers and managers keep their sessions. Managers cannot disable managers or themselves through this feature.

Existing work stays assigned, with its saved reports, photos, revisions, and receipts unchanged. Use the existing handover action separately when another worker should finish an assignment. The disabled worker disappears from new-assignment choices; historical assignee snapshots remain readable to managers.

Choose **Reactivate worker** and confirm to restore access with the same account ID and password. The worker must sign in again. Previous session credentials remain invalid. Reactivation does not reset a forgotten password or verify a person's identity.

## Offline work and recovery

Disabling server access does not erase device data or immediately lock a disconnected notebook. A device may still display previously saved assignments and save drafts while offline. Server authorization is checked again when it connects. API responses continue using `Cache-Control: no-store`; the application deliberately retains account-scoped offline notebooks.

Unsent notes and photos stay with their originating account. A rejected session leaves reports pending in the outbox. Once a manager restores access, the same worker can sign in again and retry the original report mutation. Version conflicts and handovers still follow the existing [offline protocol](offline-sync.md). No local storage schema changes or remote wipe are introduced.

The confirmation stays open during a write; Close and Escape wait for its response. A conflict or uncertain response locks further changes until a fresh read succeeds. Refresh accounts (or Retry accounts) checks the actual state. The client does not automatically repeat an access change after a network failure.

## API and SDK

These endpoints require a current manager session; cookie writes also require an allowed Origin:

| Endpoint                                  | SDK                                    | Response                                                  |
| ----------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| `GET /api/v1/workers?limit=20&cursor=...` | `client.workers(query?)`               | `{ data, total, nextCursor }`, including disabled workers |
| `GET /api/v1/workers/:id`                 | `client.worker(id)`                    | Current worker account                                    |
| `PATCH /api/v1/workers/:id/access`        | `client.updateWorkerAccess(id, input)` | Confirmed worker account                                  |

Each account contains `{ user, enabled, version, updatedAt, updatedBy }`. Before the first change it is enabled with version 0 and null change metadata. Password hashes and session credentials are never returned. The directory sorts by worker name then ID ascending. Limits are 1–50; unknown/non-worker cursors return 422 `CURSOR`. Refresh from the beginning after an external account rename or removal.

The strict PATCH body is `{ "enabled": false, "expectedVersion": 0 }`. A stale version returns 409 `ACCOUNT_CHANGED`. A current-version no-op returns the existing account without changing sessions, version, or audit events. Unknown targets and manager accounts return 404. Ordinary workers cannot read or modify the directory (403). PATCH bodies are limited to 4 KiB.

Successful password verification for a disabled worker returns 403 `ACCOUNT_DISABLED` without creating a session. Incorrect credentials retain the ordinary 401 response. Protected requests reject disabled workers even if a valid session record exists. Old session requests receive 401 after revocation. Fresh assignment requests targeting a disabled worker return 422 `INVALID_ASSIGNMENT`; an already-created recurring batch still replays its original manager receipt.

The implementation applies server-side invalidation and fresh-authentication principles described in [OWASP's session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). This feature does not claim full compliance with that guide.

## Persistence and contributors

Schema 5 adds `worker_access` and `worker_access_events` in one explicit SQLite migration. No access row means enabled; existing and newly invited workers keep working without backfills. Each real access change updates its version, stores manager/time metadata, records a durable event, and, when disabling, deletes the target sessions in the same transaction. A failed audit or session write rolls back the entire change. The UI shows the latest change; the full event history currently has no viewer or API.

Back up the database and committed WAL before upgrading, then let the new server apply schema 5. Tests reconstruct schema 4, preserve workspace records, reopen disabled accounts, and inject a migration failure before a clean retry. A full rollback needs the complete pre-upgrade backup and previous server. Older servers do not enforce these new access flags, so do not run one against a database containing disabled accounts. Never delete live migration markers.

- Contracts and transport: `packages/contracts/src/index.ts`, `packages/sdk/src/index.ts`.
- Access transactions and enforcement: `apps/api/src/workers.ts`, `store.ts`, `app.ts`.
- Manager UI: `apps/web/src/WorkerAccounts.tsx`, `Resources.tsx`, `Workspace.tsx`.
- Coverage: `tests/worker-access.test.ts`, `tests/sdk.test.ts`, `tests/e2e/worker-access.spec.ts`, and older schema-upgrade fixtures.

Password reset, manager lifecycle controls, account deletion, full access-history browsing, organization boundaries, physical-device acceptance, and a complete screen-reader audit remain separate work. Native workers use the same API enforcement; manager account controls are web-only.
