# Recurring assignments

Managers can create a finite batch of daily or weekly assignments through `POST /api/v1/work-order-series` or `client.createOrderSeries(input)`. Each occurrence becomes an ordinary work order immediately, visible in the existing list, search, planner, and worker sync. This first increment provides the API and SDK; the web dispatch form follows separately.

## Contract

Use the ordinary assignment fields (`title`, `instructions`, `siteId`, `templateId`, `assigneeId`, `priority`, `dueDate`) plus:

```json
{
  "mutationId": "7f801668-8c5c-4f48-9262-3cc91ba4b1bd",
  "frequency": "weekly",
  "occurrences": 3
}
```

`dueDate` is the first occurrence. Daily advances by one calendar day; weekly advances by seven. Counts must be integers from 2 through 52, including the first occurrence. Dates use UTC calendar arithmetic without a time-of-day or daylight-saving adjustment. Every generated date must fit a four-digit year. Past dates are allowed, as with ordinary assignments. The exported `recurrenceDates` helper validates the same schedule for a client preview.

A new batch returns 201 with `{ id, createdAt, frequency, orders }`. Each order has its own ID, reference, version 1, ASSIGNED status, and site/worker/checklist snapshots. The series definition, original receipt, all orders, membership, and assignment events commit together. Invalid catalog choices return 422 `INVALID_ASSIGNMENT`; malformed recurrence returns 422 `VALIDATION`. Missing sessions and worker accounts cannot create batches.

## Retry and recovery

Generate one UUID mutation ID before the first request and durably retain the full input with it until acknowledgment. After a timeout, connection failure, expired session, or lost response, sign into the same manager account and resend that same input and ID. Identical retries return 200 with the original receipt, including after a server restart. JSON property order does not matter. A different normalized input under the same manager/ID returns 422 `MUTATION_REUSED`. Distinct manager accounts have separate retry identities.

The receipt is an acknowledgment of creation, not a current order feed. If an occurrence was later rescheduled, reassigned, or reported, replay still returns its original creation snapshot. Refresh ordinary authorized order endpoints before opening or editing it. Do not replace a complete offline cache with this partial batch, and never overwrite a worker draft or outbox from a receipt.

Do not generate a new mutation ID merely because a response failed. That can create a second batch. Clients should keep pending dispatch separate from worker report drafts, account-scoped, and recoverable after reload. The web recovery UI is the next increment.

## Persistence and upgrade

Schema 3 adds `order_series` and `order_series_members` in one explicit SQLite transaction. Existing order JSON, report acknowledgments, photos, report revisions, and local notebook formats remain unchanged. Series IDs and membership are stored separately so current clients still read ordinary orders. Failed batch writes roll back every occurrence and acknowledgment; retrying after fixing the failure creates one complete batch.

Back up the database, including committed WAL content, before deploying an upgrade. Open it with the new server to apply schema 3. Upgrade tests preserve schema 2 data, reopen without duplicate migrations, and inject a migration failure to prove rollback and retry. Restore the backup with the previous server for a full rollback; do not remove migration markers from a live database.

## Boundaries and contributor entry points

There is no background scheduler, infinite series, weekend/holiday policy, monthly rule, bulk editing, or series cancellation. Each materialized order can be rescheduled, reassigned, submitted, and reviewed independently through the existing versioned workflow. Template changes do not rewrite its saved checklist. Future scheduling rules and series management need their own contract and migration discussion.

- Contracts and date generation: `packages/contracts/src/index.ts`.
- HTTP creation and transaction: `apps/api/src/app.ts`.
- Migration: `apps/api/src/store.ts`.
- Transport and response validation: `packages/sdk/src/index.ts`.
- Permission, retry, rollback, and upgrade regressions: `tests/recurring-orders.test.ts`.
