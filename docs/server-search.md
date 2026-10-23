# Server work-order search

`GET /api/v1/work-orders/search` returns `{ data: WorkOrder[], total, nextCursor }`. Use `client.searchOrders(query)` from the SDK. This is an additive endpoint; `/work-orders?limit=100&offset=0` and the existing browser/native offline sync protocol are unchanged.

| Parameter               | Meaning                                                                                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`                     | Optional literal text, trimmed, at most 200 characters. Matches title, reference, site name, or assigned worker name. Unicode NFC normalization and locale-independent lowercasing apply; accents remain significant. `%`, `_`, and quotes have no special search meaning. |
| `status`                | `ASSIGNED`, `SUBMITTED`, `APPROVED`, or `CHANGES_REQUESTED`.                                                                                                                                                                                                               |
| `assigneeId`            | Existing worker ID; never expands a worker's access.                                                                                                                                                                                                                       |
| `priority`              | `routine` or `urgent`.                                                                                                                                                                                                                                                     |
| `dueFrom`, `dueThrough` | Inclusive date-only bounds; either may be omitted. An inverted range is invalid.                                                                                                                                                                                           |
| `overdueBefore`         | Explicit local calendar date. Matches unfinished work due before that date, excluding approved orders. The server never assumes the caller's time zone.                                                                                                                    |
| `limit`                 | 1–100, default 25.                                                                                                                                                                                                                                                         |
| `cursor`                | Last returned order ID from the same authorized filter set.                                                                                                                                                                                                                |

All filters combine with AND. Managers search the workspace; workers search only their current assignments. Filtering by another worker returns no matches rather than granting access. Requests require authentication, and every page reapplies authorization. Unknown parameters and invalid dates/enums/limits return 422.

Results sort by creation time descending, then order ID descending. The cursor uses this immutable creation key rather than an offset, so newly created work does not shift older pages. `total` counts all current matches before the cursor boundary; `nextCursor: null` means no older matches. This is a live query, not a frozen snapshot. Edits may change which records match between requests.

An unknown cursor, inaccessible order, or cursor that no longer matches the current filters returns 422 `INVALID_CURSOR` with **Search results changed. Start a new search.** Restart from the first page after changing filters or receiving this error. Cursors are navigation values, not credentials.

```ts
const first = await client.searchOrders({
  q: 'north gate',
  priority: 'urgent',
  dueFrom: '2026-10-01',
  dueThrough: '2026-10-31',
});
const next = first.nextCursor
  ? await client.searchOrders({
      q: 'north gate',
      priority: 'urgent',
      dueFrom: '2026-10-01',
      dueThrough: '2026-10-31',
      cursor: first.nextCursor,
    })
  : null;
```

Search is read-only. It does not replace the offline cache, submit reports, change drafts, or mark an offline sync complete. SQL conditions use parameters; a connection-local SQLite function normalizes literal text. No migration or dependency is added. Text/date filters scan saved JSON and are not an indexed full-text search engine; large-workspace performance has not been benchmarked.

Contributors can start in `apps/api/src/order-search.ts`, the shared query/page contracts, and the SDK. API tests cover permissions, literal text, date bounds, overdue semantics, tie-breaking, new arrivals, changed access/filter cursors, validation, and legacy endpoint compatibility. The web search interface is a separate follow-up.
