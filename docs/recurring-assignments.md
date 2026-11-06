# Recurring assignments

Managers can create a finite batch of daily, weekday, weekly, two-week, monthly, month-end, last-weekday or quarterly assignments through `POST /api/v1/work-order-series` or `client.createOrderSeries(input)`. Each occurrence becomes an ordinary work order immediately, visible in the existing list, search, planner, and worker sync. Managers use **Assign recurring work** beside ordinary assignment in the web dispatch desk. A selected planner date becomes the first date. The form previews every occurrence before creating the batch.

## Contract

Use the ordinary assignment fields (`title`, `instructions`, `siteId`, `templateId`, `assigneeId`, `priority`, `dueDate`) plus:

```json
{
  "mutationId": "7f801668-8c5c-4f48-9262-3cc91ba4b1bd",
  "frequency": "weekly",
  "occurrences": 3
}
```

`dueDate` is the first occurrence. `daily` advances by one calendar day, `weekly` by seven, and `biweekly` by fourteen. Choose **Every two weeks** in the web form to keep the original weekday and repeat every fourteen days. `weekdays` advances to the next Monday–Friday date, skipping Saturday and Sunday. A weekday batch must start on a weekday. Weekend starts return 422 without creating work, and the form explains how to choose a valid date.

Choose **Weekends (Sat–Sun)** to schedule each Saturday and Sunday. The first visit must fall on a weekend. Use **Weekly** from a Saturday or Sunday to schedule just that day each week.

Choose **Selected days** for a schedule such as Monday and Thursday. Include the day of the first visit in the selection. The API accepts the selected days in `repeatDays` using `mon` through `sun`. Skipped dates apply to the selected days as usual.

Weekday schedules include public holidays. They are a Monday–Friday calendar rule, not a locale-specific business-day or holiday calendar. For example, a seven-occurrence batch starting Friday 2026-12-25 produces Dec 25, 28, 29, 30, 31, Jan 1, and Jan 4. Those dates are synthetic planning examples.

`monthly` repeats on the original day of each month. If that day is unavailable, the occurrence uses that month's last day. For example, Jan 31, 2027 produces Jan 31, Feb 28, Mar 31, Apr 30. Jan 30 produces Jan 30, Feb 28, Mar 30. Starting Feb 28 repeats on the 28th; this is an original-day rule rather than an end-of-month mode. Weekend and holiday dates remain included. The selector explains the shorter-month behavior before assignment, and recovered batches retain the same rule and preview.

`quarterly` advances three calendar months from each scheduled month and uses the same original-day rule. Choose **Every three months** for seasonal inspections. Starting Aug 31, 2026 produces Aug 31, Nov 30, Feb 28, and May 31. If a date is skipped, the next occurrence stays on the same three-month schedule.

Choose **Last day of month** to use `month-end`. The first date must be the last day of its month. A batch beginning February 29, 2028 repeats on March 31 and April 30. Skip dates and the inclusive end date use the same calendar as the preview.

Choose **Last weekday of month** to use `month-end-weekday`. Start on the last Monday through Friday of a month. Saturday and Sunday month ends move back to Friday. Add a site closure or holiday as a skip date to leave out that visit and keep the later months on schedule.

Counts must be integers from 2 through 52, including the first occurrence. Dates use UTC calendar arithmetic without a time-of-day or daylight-saving adjustment. Every generated date, including monthly advances and weekend skips, must fit a four-digit year. Past dates are allowed, as with ordinary assignments. The exported `recurrenceDates` helper validates the same schedule for a client preview. `RecurrenceFrequencySchema` defines the supported values across requests, receipts, and batch summaries.

The web selector, recovered request and batch ledger use **Weekdays (Mon–Fri)** and **Monthly** for these rules. Lost-response recovery retains and replays the original frequency, payload and mutation ID. No recurrence edits, background scheduling, shared holiday calendar, new dependency or database migration are introduced. Update the server and web bundle together when enabling a new frequency; older clients cannot parse batch metadata for frequencies absent from their schema. Native workers continue to receive ordinary materialized orders without recurrence metadata.

A new batch returns 201 with `{ id, createdAt, frequency, orders }`. Each order has its own ID, reference, version 1, ASSIGNED status, and site/worker/checklist snapshots. The series definition, original receipt, all orders, membership, and assignment events commit together. Invalid catalog choices return 422 `INVALID_ASSIGNMENT`; malformed recurrence returns 422 `VALIDATION`. Missing sessions and worker accounts cannot create batches.

## End on a date

Choose **On a date** under **Ends**, then enter an end date or use its calendar. The preview includes an occurrence on that date if it falls on the schedule. Skipped visits inside the range reduce the count. For example, a daily batch from December 28 through December 31 with December 29 skipped creates three orders.

The preview must contain 2–52 work orders. The web app saves the calculated count and the original skip list in the existing batch request. Recovery shows the same scheduled dates and retries the saved request.

## Skip holidays or site closures

Open **Skip dates (optional)** in the assignment form. Choose a date, then use **Add date**. Remove a date with its named trash button. A date left in the input must be added or cleared before assigning. The preview shows the actual order dates before the write. The recovery view and saved batch details retain the selected exclusions.

API/SDK callers may supply `skipDates`, an optional array of up to 52 distinct `YYYY-MM-DD` dates. Every skipped date must be after `dueDate`; change the first due date rather than skipping it. `occurrences` remains the number of orders created (2–52), so skipped occurrences extend the schedule. Daily and weekly rules advance to the next candidate; weekday rules still skip weekends; monthly rules retain the original day even when a month is excluded. For example, three monthly orders starting Jan 31, 2027 with Feb 28 excluded fall on Jan 31, Mar 31 and Apr 30. A date not reached by the chosen recurrence has no effect. Dates generated after exclusions must still fit a four-digit year.

Managers can save up to 52 closure dates per site in **Sites & checklists**. In the recurring form, choose the site, open **Skip dates**, and use **Copy site closure dates**. The action copies dates after the first due date into the batch list. The date preview marks every visit that falls on a closure. Choose a different first date if the site is closed that day, then review the revised schedule. Copied dates can be removed from the same list as manual exclusions.

The saved batch carries the exact copied dates. Later edits to the site calendar do not change batches or pending retries. The calendar uses manager-entered dates.

Nonempty exclusions are sorted and stored with the original input, creation receipt, batch summary and details. Retries with the same set in a different order replay the original receipt; changing that set under the same mutation ID returns 422 `MUTATION_REUSED`. Omitted and empty lists use the legacy business hash and omit the extra receipt/summary field. Saved requests keep their full list and mutation ID through offline reload, account changes and response loss. Editing a definitively declined request retains the list and creates a new intent ID on submission.

There is no database or device-notebook migration. Deploy the new server and web bundle together before using exclusions: older servers reject the new request field, and older web bundles cannot recover saved requests containing it. Older clients can continue creating ordinary batches without the field. Worker apps receive ordinary materialized assignments. Importing a holiday calendar, sharing exclusion lists and modifying future series remain separate work.

## Retry and recovery

Generate one UUID mutation ID before the first request and durably retain the full input with it until acknowledgment. After a timeout, connection failure, expired session, or lost response, sign into the same manager account and resend that same input and ID. Identical retries return 200 with the original receipt, including after a server restart. JSON property order does not matter. A different normalized input under the same manager/ID returns 422 `MUTATION_REUSED`. Distinct manager accounts have separate retry identities.

The receipt is an acknowledgment of creation, not a current order feed. If an occurrence was later rescheduled, reassigned, or reported, replay still returns its original creation snapshot. Refresh ordinary authorized order endpoints before opening or editing it. Do not replace a complete offline cache with this partial batch, and never overwrite a worker draft or outbox from a receipt.

Do not generate a new mutation ID merely because a response failed. That can create a second batch. Clients should keep pending dispatch separate from worker report drafts, account-scoped, and recoverable after reload. The web app saves the pending input in an account-scoped IndexedDB journal before sending it. **Recover recurring batch** reopens an uncertain batch after closing, reload, offline use, or signing back into the same account. It never sends automatically. The saved request locks editing until confirmed; a definitive 422 validation/assignment rejection offers **Edit declined batch**. Other failures keep the original request for retry. Storage failures block sending, and competing tabs cannot overwrite a pending batch. Receipt cleanup failures also retain it for duplicate-safe confirmation. Unreadable saved data blocks creation and offers a read retry without silently erasing it.

Web requests include optional `expectedActorId`. The API checks this against the authenticated manager before creating or replaying a batch and returns 403 `ACTOR_CHANGED` if another account signed in. This authorization guard does not change the business-input hash, so an existing receipt can be retried with the guard. API/SDK callers may omit it.

## Persistence and upgrade

Schema 3 adds `order_series` and `order_series_members` in one explicit SQLite transaction. Existing order JSON, report acknowledgments, photos, report revisions, and local notebook formats remain unchanged. Series IDs and membership are stored separately so current clients still read ordinary orders. Failed batch writes roll back every occurrence and acknowledgment; retrying after fixing the failure creates one complete batch.

Back up the database, including committed WAL content, before deploying an upgrade. Open it with the new server to apply schema 3. Upgrade tests preserve schema 2 data, reopen without duplicate migrations, and inject a migration failure to prove rollback and retry. Restore the backup with the previous server for a full rollback; do not remove migration markers from a live database.

## Browse saved batches

Managers open **Recurring batches** beside assignment creation. The ledger shows original schedules, workers, and occurrence counts. Selecting a batch loads its current orders. Each visit shows its due date, with both planned and current dates shown when they differ. Independent rescheduling, reassignment, and report status appear in those current orders. **Refresh batch details** reloads that comparison and updates its **Loaded** time. **Refresh batches** restarts the ledger.

Use **Search batches** to find a saved batch by title, original worker or site name, batch ID, or the reference of any visit. Choose a **Frequency** to narrow the results to a schedule such as weekly or month-end. The server applies both filters before paging. Clearing the search keeps the selected frequency. The last loaded results stay visible if a request fails.

In a web work order, use the copy icon beside its reference to paste that number into the batch search.

Turn on **Open work** to see batches with at least one visit that has yet to be approved. The filter works with search and frequency.

Use **Show visits** to narrow a loaded batch. Upcoming field work includes unfinished assignments due today or later. Overdue follows the work-order list and uses the current due date and the device's local date. **Rescheduled** shows visits whose current due date differs from the planned date. **On a closure date** shows unfinished visits whose current due date falls on the saved site calendar. These filters work offline and stay selected when you refresh the same batch.

**Use batch as template** opens a new schedule with the original worker, assignment details, repeat rule, and visit count filled in. Choose a first date and add any holidays or closures for the new schedule. If a site, worker, or checklist is unavailable, select a current one. An unconfirmed saved request opens for recovery first.

**Export batch visits as CSV** downloads the visits in the current filter, including both due dates and the current worker and status. The export works from loaded batch data while offline. It contains schedule rows without inspection report content.

Use the calendar action beside an assigned order or an order with changes requested to edit its current due date from this view. The planned date and sibling orders stay as scheduled. If another update arrives first, **Reload order** refreshes the row and keeps the proposed date available for review. The action needs a connection. See [rescheduling](rescheduling.md) for version checks and worker sync behavior.

The ledger loads 20 batches at a time and offers **Load more batches**. Failed pages keep earlier rows and the selected comparison available for retry. Offline transitions retain loaded details but disable server actions. Closing the viewer discards its temporary data. Opening an order fetches fresh authorization/state and awaits individual-order persistence before navigation; it does not replace the saved collection or change drafts, outbox entries, assignment versions, or reports. A failed open or local write leaves the viewer available for retry.

Read-only API methods, restricted to current manager accounts:

- `GET /api/v1/work-order-series?limit=20&cursor=<batch-id>`, through `client.orderSeries(query)`, returns `{ data, total, nextCursor }`. Limits are 1–50, default 20. Optional `q` matches up to 200 characters of batch title, original worker or site name, batch ID, or work-order reference, regardless of case. Optional `frequency` and `state=open` narrow the matches before pagination. Keep the same filters when following the cursor. Rows include the batch and creator, original worker and site name, frequency, occurrence count, and the first and last scheduled dates. Selected-day batches include `repeatDays`. Batches with exclusions include `skipDates`.
- `GET /api/v1/work-order-series/:id`, through `client.orderSeriesDetail(id)`, returns that summary plus `orders: [{ occurrence, plannedDueDate, order }]`. Members stay in original occurrence order, while each `order` contains its current complete work-order state. Creator names use the current account display name; original worker/date metadata uses the creation snapshot.

Lists sort newest first by creation timestamp, then batch ID. The cursor anchors the next older page; later arrivals do not shift that boundary. Totals reflect the current database, not a frozen historical snapshot. Unknown cursors return 422 `INVALID_CURSOR`; malformed queries/IDs return 422 `VALIDATION`; unknown valid batch IDs return 404. Authorization runs before pagination or lookup. An incomplete membership record returns an error rather than a successful partial batch. These reads use existing schema 3 tables without a new migration; large-scale indexed querying remains separate work.

## Boundaries and contributor entry points

There is no background scheduler, infinite series, shared holiday calendar, configurable day-of-month, bulk editing or series cancellation. Each materialized order can be rescheduled, reassigned, submitted and reviewed independently through the existing versioned workflow. Template changes do not rewrite its saved checklist. Future scheduling rules and series management need their own contract and migration discussion.

- Contracts and date generation: `packages/contracts/src/index.ts`.
- HTTP creation and transaction: `apps/api/src/app.ts`.
- Migration: `apps/api/src/store.ts`.
- Transport and response validation: `packages/sdk/src/index.ts`.
- Web form and recovery: `apps/web/src/RecurringDispatch.tsx`, shared `AssignmentFields.tsx`, and `pending-series.ts`.
- Browser recovery and cross-tab checks: `tests/e2e/recurring-dispatch.spec.ts`.
- Read-only queries and viewer: `apps/api/src/order-series.ts`, `apps/web/src/SeriesOverview.tsx`, `tests/order-series.test.ts`, and `tests/e2e/series-overview.spec.ts`.
- Permission, retry, rollback, and upgrade regressions: `tests/recurring-orders.test.ts`.
