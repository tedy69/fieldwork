# Report revision history

Open a web work order and choose **Report history** to read saved submissions and their reviews. Select a submission to read its original checklist answers, notes, summary, assignment details, and attachment links. **Load older submissions** loads another page without moving the selected report. This view is read-only and never changes a draft, the outbox, or the current report.

History needs a connection to load. An already opened view can keep its loaded text in memory while offline; attachment links and further loading need a connection. Closing the view clears that in-memory history. The latest saved report remains available through the existing offline notebook and print action. Historical reports are not added to the offline cache or the print action in this feature.

## API and storage contract

`GET /api/v1/work-orders/:id/history?limit=10&cursor=<report-id>` returns `{ data, total, nextCursor }`. Limits are 1–50, default 10. Records are ordered by their persisted submission sequence, newest first. The cursor is the last returned report ID, scoped to this order. New submissions do not shift older pages. `nextCursor: null` means there are no older records. Invalid or foreign-order cursors return 422; inaccessible orders return 404 before cursor lookup.

Each record includes a validated report/assignment `snapshot`, the original `submissionVersion` when known, a `source` (`submission` or `saved_snapshot`), a nullable `review`, and `reviewStatus` (`awaiting_review`, `reviewed`, or `not_retained`). A submission version is an order version, not a consecutive report number. Snapshot worker identity contains only an ID and name. Review status is separate from the current work-order state.

New submissions insert a snapshot in the same SQLite transaction as the work order, photos, action history, and idempotency acknowledgment. Retries with the same mutation ID do not add another revision. A review attaches its decision/note/actor/time to the matching saved submission in the review transaction. Report contents and assignment snapshots are never overwritten by a later submission, schedule change, or reassignment.

Managers and the currently assigned worker can read history. Reassignment moves history and historical photo access with the order. The original worker's device drafts remain account-scoped and are not uploaded by opening history. Native submissions use the same server recording behavior; the viewer is web-only.

## Upgrading schema 1 to schema 2

Back up the database and stop the old server before upgrading. `openStore` adds `report_revisions` and its order/sequence index in one migration transaction, then marks schema version 2. Fresh installations run the same migration. Reopening a migrated database does not repeat the backfill.

The migration recovers original snapshots from stored submission acknowledgments, ordered by their original order versions. It retains any review still present on the current saved report. Earlier review details that were overwritten before history existed are labeled **Review details unavailable**. This does not mean the report was never reviewed.

If an order has a saved report but no matching acknowledgment, its current saved snapshot is retained with `submissionVersion: null` and `source: saved_snapshot`. The view explains that the original assignment details/version may be unavailable, and identifies the submitter by their saved ID when the current assignee differs. The migration never invents missing submissions, notes, actors, or dates.

Existing orders, mutations, photo bytes, sessions, catalogs, and user records are preserved. A malformed stored acknowledgment fails and rolls back the migration, including the new table and version marker. Keep the backup and resolve the malformed record before retrying. Running an older server after migration would stop recording new history; restore a pre-upgrade backup to roll back the deployment instead.

## Contributor notes

Contracts live in `packages/contracts`; the SDK method is `client.reportHistory(orderId, cursor?)`. API authorization stays in `apps/api`, persistence and migration in `store.ts`, and the web viewer in `ReportHistory.tsx`. Shared Kokonut UI/shadcn Dialog, Button, Empty, Badge, Alert, and Table components retain the notebook palette and keyboard behavior.

Use the migration/API tests for upgrades, exact-once retries, review preservation, rollback, pagination, and permissions. Browser tests cover the read-only viewer, correction drafts, keyboard focus, loading/errors, pagination, narrow layouts, and connection changes.
