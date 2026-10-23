# Recurring assignments

Managers can create a finite batch of daily, weekly, or weekday assignments through `POST /api/v1/work-order-series` or `client.createOrderSeries(input)`. Each occurrence becomes an ordinary work order immediately, visible in the existing list, search, planner, and worker sync. Managers use **Assign recurring work** beside ordinary assignment in the web dispatch desk. A selected planner date becomes the first date. The form previews every occurrence before creating the batch.

## Contract

Use the ordinary assignment fields (`title`, `instructions`, `siteId`, `templateId`, `assigneeId`, `priority`, `dueDate`) plus:

```json
{
  "mutationId": "7f801668-8c5c-4f48-9262-3cc91ba4b1bd",
  "frequency": "weekly",
  "occurrences": 3
}
```

`dueDate` is the first occurrence. `daily` advances by one calendar day; `weekly` advances by seven. `weekdays` advances to the next Monday–Friday date, skipping Saturday and Sunday. A weekday batch must start on a weekday; weekend starts return 422 without creating any work. The form disables creation for that schedule and explains the weekday requirement. A planner weekend preset stays visible so the manager can choose a weekday or another frequency rather than silently shifting the first assignment.

Weekday schedules include public holidays. They are a Monday–Friday calendar rule, not a locale-specific business-day or holiday calendar. For example, a seven-occurrence batch starting Friday 2026-12-25 produces Dec 25, 28, 29, 30, 31, Jan 1, and Jan 4. Those dates are synthetic planning examples.

Counts must be integers from 2 through 52, including the first occurrence. Dates use UTC calendar arithmetic without a time-of-day or daylight-saving adjustment. Every generated date, including weekend skips, must fit a four-digit year. Past dates are allowed, as with ordinary assignments. The exported `recurrenceDates` helper validates the same schedule for a client preview; `RecurrenceFrequencySchema` defines all three supported values consistently across requests, receipts, and batch summaries. Existing daily/weekly calculations and receipts remain unchanged.

The web selector, recovered request, and batch ledger use **Weekdays (Mon–Fri)** for the new rule. Lost-response recovery retains and replays the original `weekdays` payload and mutation ID. No recurrence edits, background scheduling, holiday configuration, new dependency, or database migration are introduced. Update the server and web bundle together when enabling the new frequency; older clients with a two-value frequency schema cannot parse weekday batch metadata.

A new batch returns 201 with `{ id, createdAt, frequency, orders }`. Each order has its own ID, reference, version 1, ASSIGNED status, and site/worker/checklist snapshots. The series definition, original receipt, all orders, membership, and assignment events commit together. Invalid catalog choices return 422 `INVALID_ASSIGNMENT`; malformed recurrence returns 422 `VALIDATION`. Missing sessions and worker accounts cannot create batches.

## Retry and recovery

Generate one UUID mutation ID before the first request and durably retain the full input with it until acknowledgment. After a timeout, connection failure, expired session, or lost response, sign into the same manager account and resend that same input and ID. Identical retries return 200 with the original receipt, including after a server restart. JSON property order does not matter. A different normalized input under the same manager/ID returns 422 `MUTATION_REUSED`. Distinct manager accounts have separate retry identities.

The receipt is an acknowledgment of creation, not a current order feed. If an occurrence was later rescheduled, reassigned, or reported, replay still returns its original creation snapshot. Refresh ordinary authorized order endpoints before opening or editing it. Do not replace a complete offline cache with this partial batch, and never overwrite a worker draft or outbox from a receipt.

Do not generate a new mutation ID merely because a response failed. That can create a second batch. Clients should keep pending dispatch separate from worker report drafts, account-scoped, and recoverable after reload. The web app saves the pending input in an account-scoped IndexedDB journal before sending it. **Recover recurring batch** reopens an uncertain batch after closing, reload, offline use, or signing back into the same account. It never sends automatically. The saved request locks editing until confirmed; a definitive 422 validation/assignment rejection offers **Edit declined batch**. Other failures keep the original request for retry. Storage failures block sending, and competing tabs cannot overwrite a pending batch. Receipt cleanup failures also retain it for duplicate-safe confirmation. Unreadable saved data blocks creation and offers a read retry without silently erasing it.

Web requests include optional `expectedActorId`. The API checks this against the authenticated manager before creating or replaying a batch and returns 403 `ACTOR_CHANGED` if another account signed in. This authorization guard does not change the business-input hash, so an existing receipt can be retried with the guard. API/SDK callers may omit it.

## Persistence and upgrade

Schema 3 adds `order_series` and `order_series_members` in one explicit SQLite transaction. Existing order JSON, report acknowledgments, photos, report revisions, and local notebook formats remain unchanged. Series IDs and membership are stored separately so current clients still read ordinary orders. Failed batch writes roll back every occurrence and acknowledgment; retrying after fixing the failure creates one complete batch.

Back up the database, including committed WAL content, before deploying an upgrade. Open it with the new server to apply schema 3. Upgrade tests preserve schema 2 data, reopen without duplicate migrations, and inject a migration failure to prove rollback and retry. Restore the backup with the previous server for a full rollback; do not remove migration markers from a live database.

## Browse saved batches

Managers open **Recurring batches** beside assignment creation. The ledger shows original schedules, workers, and occurrence counts. Selecting a batch loads its current orders, with planned and current due dates labeled separately. Independent rescheduling, reassignment, and report status appear in those current orders. **Refresh batch details** reloads that comparison; **Refresh batches** restarts the ledger. Loaded data represents the time of its last successful read.

The ledger loads 20 batches at a time and offers **Load more batches**. Failed pages keep earlier rows and the selected comparison available for retry. Offline transitions retain loaded details but disable server actions. Closing the viewer discards its temporary data. Opening an order fetches fresh authorization/state and awaits individual-order persistence before navigation; it does not replace the saved collection or change drafts, outbox entries, assignment versions, or reports. A failed open or local write leaves the viewer available for retry.

Read-only API methods, restricted to current manager accounts:

- `GET /api/v1/work-order-series?limit=20&cursor=<batch-id>`, through `client.orderSeries(query)`, returns `{ data, total, nextCursor }`. Limits are 1–50, default 20. Rows contain `id`, `title`, `createdAt`, `createdBy` (ID/name), `frequency`, `occurrences`, `firstDueDate`, `lastDueDate`, and original `assignee` (ID/name). Mutation IDs, hashes, full request bodies, and original receipts are omitted.
- `GET /api/v1/work-order-series/:id`, through `client.orderSeriesDetail(id)`, returns that summary plus `orders: [{ occurrence, plannedDueDate, order }]`. Members stay in original occurrence order, while each `order` contains its current complete work-order state. Creator names use the current account display name; original worker/date metadata uses the creation snapshot.

Lists sort newest first by creation timestamp, then batch ID. The cursor anchors the next older page; later arrivals do not shift that boundary. Totals reflect the current database, not a frozen historical snapshot. Unknown cursors return 422 `INVALID_CURSOR`; malformed queries/IDs return 422 `VALIDATION`; unknown valid batch IDs return 404. Authorization runs before pagination or lookup. An incomplete membership record returns an error rather than a successful partial batch. These reads use existing schema 3 tables without a new migration; large-scale indexed querying remains separate work.

## Boundaries and contributor entry points

There is no background scheduler, infinite series, weekend/holiday policy, monthly rule, bulk editing, or series cancellation. Each materialized order can be rescheduled, reassigned, submitted, and reviewed independently through the existing versioned workflow. Template changes do not rewrite its saved checklist. Future scheduling rules and series management need their own contract and migration discussion.

- Contracts and date generation: `packages/contracts/src/index.ts`.
- HTTP creation and transaction: `apps/api/src/app.ts`.
- Migration: `apps/api/src/store.ts`.
- Transport and response validation: `packages/sdk/src/index.ts`.
- Web form and recovery: `apps/web/src/RecurringDispatch.tsx`, shared `AssignmentFields.tsx`, and `pending-series.ts`.
- Browser recovery and cross-tab checks: `tests/e2e/recurring-dispatch.spec.ts`.
- Read-only queries and viewer: `apps/api/src/order-series.ts`, `apps/web/src/SeriesOverview.tsx`, `tests/order-series.test.ts`, and `tests/e2e/series-overview.spec.ts`.
- Permission, retry, rollback, and upgrade regressions: `tests/recurring-orders.test.ts`.
