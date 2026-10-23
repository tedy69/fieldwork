# API reference · v1

Base path: `/api/v1`. JSON requests use `Content-Type: application/json`. Input/output definitions are in `packages/contracts`; use `packages/sdk` from a TypeScript client.

## Sessions

`POST /sessions` takes `{ "email": "...", "password": "..." }` and returns `{ user, token }`. The browser receives an HttpOnly cookie and does not persist the token from the response. Native clients put it in SecureStore and send `Authorization: Bearer <token>`.

`GET /me` returns `{ user }`. `DELETE /sessions/current` revokes the current session and returns 204. Cookie-authenticated writes must have an allowed Origin. This protects the web session; native bearer requests do not require a browser Origin.

## Workspace

[Worker access controls](worker-access.md) add manager-only `GET /workers`, `GET /workers/:id`, and `PATCH /workers/:id/access`, with bounded pagination and optimistic versions. Disabling a worker revokes their sessions and blocks sign-in and fresh assignments; reactivation requires fresh sign-in. `/catalog` includes active workers and managers, while historical order snapshots retain their original assignee.

Site creation accepts optional `coordinates: { latitude, longitude }` through `client.createSite(name, address, coordinates?)`. Both numbers are required when present and must be within geographic bounds. `GET /map-settings`, through `client.mapSettings()`, returns a validated raster provider or null for a disabled workspace. Reads require a session; site writes remain manager-only. Coordinates follow catalog visibility, and new assignment snapshots retain them. See [site maps](site-maps.md) for provider settings, consent, snapshot behavior, and the web viewer.

`GET /work-orders/search` provides combined text/status/assignee/priority/date filters and cursor pagination through `client.searchOrders(query)`. It returns `{ data, total, nextCursor }`; default limit is 25, maximum 100. Worker access is reapplied on each page. See [server search](server-search.md) for input fields, literal Unicode matching, cursor restart behavior, and performance limits. The original offset endpoint below continues to serve offline synchronization.

| Method | Endpoint                                               | Access                     | Result                                                          |
| ------ | ------------------------------------------------------ | -------------------------- | --------------------------------------------------------------- |
| GET    | `/catalog`                                             | Signed in                  | Sites, templates, and visible users                             |
| POST   | `/sites`                                               | Manager                    | New site from `{ name, address }`                               |
| GET    | `/sites/:id`                                           | Signed in                  | Current catalog site                                            |
| PATCH  | `/sites/:id/location`                                  | Manager                    | Compare and update coordinates; null clears them                |
| POST   | `/templates`                                           | Manager                    | New template from `{ name, items: string[] }`                   |
| GET    | `/work-orders?limit=100&offset=0&status=ASSIGNED`      | Signed in                  | `{ data, total, limit, offset }`; workers see their assignments |
| GET    | `/work-orders/:id`                                     | Assigned worker or manager | Work order                                                      |
| POST   | `/work-orders`                                         | Manager                    | Created order, status 201                                       |
| PATCH  | `/work-orders/:id/schedule`                            | Manager                    | Confirmed order with updated due date                           |
| PATCH  | `/work-orders/:id/assignee`                            | Manager                    | Confirmed order with updated field worker                       |
| POST   | `/work-orders/:id/reports`                             | Assigned worker            | Confirmed order                                                 |
| POST   | `/work-orders/:id/reviews`                             | Manager                    | Reviewed order                                                  |
| GET    | `/work-orders/:id/events`                              | Assigned worker or manager | `{ data: [{ action, at, actor }] }`                             |
| GET    | `/work-orders/:id/history?limit=10&cursor=<report-id>` | Assigned worker or manager | `{ data: ReportRevision[], total, nextCursor }`                 |
| GET    | `/photos/:id`                                          | Assigned worker or manager | Authenticated image bytes                                       |

List limit is 1–100. Offset is a non-negative integer. Status uses the uppercase enum in `packages/contracts`.

`POST /work-order-series` creates 2–52 daily, weekly, or weekday assignments as one atomic batch. It accepts the ordinary order fields plus `mutationId`, `frequency`, and `occurrences`; the first date is `dueDate`. `weekdays` requires a Monday–Friday start and skips weekends while including holidays. New batches return 201 and identical retries return 200 with the original `{ id, createdAt, frequency, orders }` receipt. Manager access and cookie-origin checks apply. Optional `expectedActorId` binds a pending dispatch to its originating account; a mismatch returns 403 `ACTOR_CHANGED` before any batch lookup or write. See [recurring assignments](recurring-assignments.md) before implementing retry behavior.

Managers browse saved batches with `GET /work-order-series?limit=20&cursor=<batch-id>` through `client.orderSeries(query)`. The response is `{ data: OrderSeriesSummary[], total, nextCursor }`, ordered by creation time and ID descending. Limits are 1–50. `GET /work-order-series/:id`, through `client.orderSeriesDetail(id)`, adds ordered `{ occurrence, plannedDueDate, order }` members with current order state. These read-only results must not replace a complete offline cache. See [batch browsing](recurring-assignments.md#browse-saved-batches) for fields, errors, and cursor behavior.

Checklist creation accepts optional boolean `requiresPhoto` through `POST /templates` or `client.createTemplate(name, items, requiresPhoto?)`. Required-photo assignment snapshots reject report inputs without attachments with 422 `PHOTO_REQUIRED`; drafts and rejected writes remain intact. See [photo evidence](photo-evidence.md) for policy scope, corrections, compatibility, and persistence.

Managers can [invite workers](worker-invitations.md) with `POST /invitations`, browse them through `GET /invitations?limit=20&cursor=<id>`, and revoke unused invitations with `DELETE /invitations/:id`. Only creation returns a raw token. Public `POST /invitations/preview` and `/invitations/accept` take the token in a body; acceptance returns a worker without a session. See the guide before implementing retry or link handling.

Create an order:

```json
{
  "title": "Inspect the north gate",
  "instructions": "Check access and record any defects.",
  "siteId": "existing-site-id",
  "assigneeId": "existing-worker-id",
  "templateId": "existing-template-id",
  "dueDate": "2026-10-24",
  "priority": "routine"
}
```

Submit a report:

```json
{
  "mutationId": "7f801668-8c5c-4f48-9262-3cc91ba4b1bd",
  "baseVersion": 1,
  "answers": [{ "itemId": "existing-item-id", "value": "pass", "note": "" }],
  "summary": "Access checked and clear.",
  "photos": []
}
```

Answer every checklist item once. Values are `pass`, `fail`, or `na`. Photos have a UUID `id`, supported `mimeType`, and base64 `data` without a data-URL prefix; at most 3 photos of 2 MB each. Report retries must reuse their mutation ID and body. See [offline sync](offline-sync.md).

Reviews take `{ baseVersion, decision, note }`. Decision is `APPROVED` or `CHANGES_REQUESTED`; requesting changes requires a nonempty note. Review writes use optimistic concurrency. After an uncertain review outcome, fetch the latest order before deciding whether to retry.

Rescheduling takes `{ "baseVersion": 1, "dueDate": "2026-10-27" }`. The date is a calendar date, without a time zone; past dates are allowed. Only `ASSIGNED` and `CHANGES_REQUESTED` orders may change. The transaction checks the current version, changes only `dueDate` and `version`, and records the previous/new dates in action history. Existing reports, photos, feedback, assignees, and checklist snapshots remain unchanged. An identical date returns the existing order without a new version or event, provided the supplied version is current.

A stale version returns 409 `VERSION_CONFLICT`; a closed workflow state returns 409 `INVALID_STATE`. This endpoint does not queue offline writes or accept a mutation ID. After a timeout or uncertain response, fetch the latest order and review its date/version before retrying. The browser requires Reload order after a failed save. See [rescheduling](rescheduling.md) for worker draft conflicts.

## Reassignment

Reassignment takes `{ "baseVersion": 1, "assigneeId": "existing-worker-id" }`. Only `ASSIGNED` and `CHANGES_REQUESTED` orders can move to an existing worker account. It changes the embedded/indexed worker and version atomically and records the old/new workers in history. Saved reports and feedback remain with the order; local drafts are not transferred. Current-version no-op requests create no version/event; stale versions return 409 `VERSION_CONFLICT`, closed states return 409 `INVALID_STATE`, and missing/non-worker accounts return 422 `INVALID_ASSIGNMENT`. Reload after uncertain outcomes before saving again. The original worker loses server access; blocked queued reports remain on their device. See [reassignment](reassignment.md) for the handover and recovery flow.

## Errors and health

Report history returns saved report/assignment snapshots with original `submissionVersion` (nullable for recovered saved orders), `source`, `reviewStatus`, and nullable `review`. History limits are 1–50, default 10. Use `nextCursor` for the next older page; new submissions do not shift older pages. Unknown or foreign-order cursors return 422 `INVALID_CURSOR`. Authorization is checked before cursor lookup. Reassignment transfers historical report/photo access to the new worker. See [report history](report-history.md) for response fields, legacy review limits, and upgrade behavior.

Errors have `{ "error": { "code": "VERSION_CONFLICT", "message": "..." } }`. Common statuses: 401 session required, 403 permission/origin denied, 404 inaccessible resource, 409 version/state conflict, 422 invalid input, 429 rate limit. Unexpected internal details are logged on the server and not returned to clients.

`GET /health` is outside the versioned API and returns `{ "status": "ok", "version": "0.1.0" }` after checking database access. It does not expose users, reports, or credentials.
