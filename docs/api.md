# API reference · v1

Base path: `/api/v1`. JSON requests use `Content-Type: application/json`. Input/output definitions are in `packages/contracts`; use `packages/sdk` from a TypeScript client.

## Sessions

`POST /sessions` takes `{ "email": "...", "password": "..." }` and returns `{ user, token }`. The browser receives an HttpOnly cookie and does not persist the token from the response. Native clients put it in SecureStore and send `Authorization: Bearer <token>`.

`GET /me` returns `{ user }`. `DELETE /sessions/current` revokes the current session and returns 204. Cookie-authenticated writes must have an allowed Origin. This protects the web session; native bearer requests do not require a browser Origin.

## Workspace

| Method | Endpoint                                          | Access                     | Result                                                          |
| ------ | ------------------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| GET    | `/catalog`                                        | Signed in                  | Sites, templates, and visible users                             |
| POST   | `/sites`                                          | Manager                    | New site from `{ name, address }`                               |
| POST   | `/templates`                                      | Manager                    | New template from `{ name, items: string[] }`                   |
| GET    | `/work-orders?limit=100&offset=0&status=ASSIGNED` | Signed in                  | `{ data, total, limit, offset }`; workers see their assignments |
| GET    | `/work-orders/:id`                                | Assigned worker or manager | Work order                                                      |
| POST   | `/work-orders`                                    | Manager                    | Created order, status 201                                       |
| POST   | `/work-orders/:id/reports`                        | Assigned worker            | Confirmed order                                                 |
| POST   | `/work-orders/:id/reviews`                        | Manager                    | Reviewed order                                                  |
| GET    | `/work-orders/:id/events`                         | Assigned worker or manager | `{ data: [{ action, at, actor }] }`                             |
| GET    | `/photos/:id`                                     | Assigned worker or manager | Authenticated image bytes                                       |

List limit is 1–100. Offset is a non-negative integer. Status uses the uppercase enum in `packages/contracts`.

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

## Errors and health

Errors have `{ "error": { "code": "VERSION_CONFLICT", "message": "..." } }`. Common statuses: 401 session required, 403 permission/origin denied, 404 inaccessible resource, 409 version/state conflict, 422 invalid input, 429 rate limit. Unexpected internal details are logged on the server and not returned to clients.

`GET /health` is outside the versioned API and returns `{ "status": "ok", "version": "0.1.0" }` after checking database access. It does not expose users, reports, or credentials.
