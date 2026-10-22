# Rescheduling assignments

Managers can open an unfinished order in the web app and choose **Change due date**. Enter a new date and choose **Save due date**. This works for Assigned and Changes requested work. Submitted and Approved work must complete its review workflow instead.

The action needs a connection. It updates the saved order and the list/planner counts without clearing search, status, date-range, or selected-day filters. Moving an order away from the selected day may leave that day empty; choose Whole week to see its new position. Previously saved records remain available offline, but changing a due date is disabled.

Dates are calendar dates, without a time zone. A past date is allowed when recording an overdue commitment. The current date appears beside the input for comparison. Enter submits, Escape or Cancel closes the edit, and each action has a visible keyboard focus style. Saving or reloading moves focus to the updated order's main content.

## Conflicts and uncertain outcomes

Each save supplies the version that the manager saw. If another manager changes the schedule or a worker submits a report first, the server rejects the stale write. The selected date stays in the failed form; **Reload order** fetches the latest state before another attempt is allowed. A newer version resets the edit so the manager can review the new date/status. A successful reload also replaces any earlier success notice with the current due date.

A lost response can mean the server saved the change even though the browser did not receive confirmation. Reload before deciding whether another change is needed. Schedule writes are not added to the report outbox and are not automatically retried.

Workers see the new date on their next sync. Local drafts, answers, notes, and photo bytes remain saved. If a report was queued against an older order version, sync marks it as needing attention. **Keep draft and open latest order** retains the draft and removes the blocked queue entry. The worker reviews the updated assignment and explicitly resubmits using its current version. No automatic rebasing or discarding of the original report occurs.

## Contributor notes

- Input schema/type: `RescheduleOrderSchema` / `RescheduleOrder` in `packages/contracts`.
- SDK: `client.rescheduleOrder(id, { baseVersion, dueDate })`.
- API: `PATCH /api/v1/work-orders/:id/schedule`, manager-only, with the existing cookie-origin and authentication checks.
- Persistence: the existing order JSON and action history, updated in one transaction. No database migration is required.
- Web: `RescheduleOrder.tsx`, embedded beside order metadata; `cacheOrder` merges a confirmed record atomically without changing drafts, queued reports, unrelated records, or the full-sync timestamp. A late response cannot replace a newer cached version.

Full-list caching also keeps a newer confirmed version when an older list response arrives later. Records absent from the server list are still removed from the cached list; drafts and the outbox remain separate.

Use the API and offline-repository tests for permission, validation, concurrency, and preservation changes. Browser workflows cover the planner, retry/conflict UI, correction work, keyboard use, narrow layouts, and stale worker reports with a photo. Native clients receive the changed date and use the same version-conflict protocol; a native manager screen is outside this feature.
