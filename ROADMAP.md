# Roadmap

The first milestone is a reliable inspection loop. A checked item below means implemented; device acceptance is recorded separately in docs/verification.md.

## 0.1 · Inspection foundation

- [x] Manager and field worker roles.
- [x] Sites, checklists, assignment, and inspection reports.
- [x] Web dispatch desk and offline browser notebook.
- [x] Expo worker notebook with local SQLite drafts and secure session storage.
- [x] English and Indonesian sign-in on web and Expo, with a saved device preference.
- [x] English and Indonesian invitation and password-reset pages that share the web sign-in preference.
- [x] English and Indonesian assignment and outbox screens in the Expo worker notebook.
- [x] English and Indonesian inspection forms and saved reports in Expo, including reading and photo guidance.
- [x] English and Indonesian web worker lists and outbox, with localized date filters and draft export.
- [x] English and Indonesian web worker inspection forms and saved reports, with localized photo and reading feedback.
- [x] English and Indonesian report history and printable reports for web workers.
- [x] English and Indonesian week and month planners in the web worker notebook.
- [x] English and Indonesian site maps with named zoom and recenter icons in the web worker notebook.
- [x] English and Indonesian saved work finder with offline keyboard navigation and named destinations.
- [x] English and Indonesian server search for web workers, with localized filters, results and recovery.
- [x] Notes, photo attachments, durable outbox, and idempotent submissions.
- [x] Private local draft JSON exports in the web notebook/outbox, including offline photos and blocked submissions without changing the queue.
- [x] Indonesian contributor quick-start guide for local setup, demo accounts, offline production builds and checks.
- [x] Version conflicts, approval, requests for changes, and action history.
- [x] API and sync tests, browser workflow checks, Docker setup, contributor documentation.
- [x] Overdue filter with search and offline support in the web notebook and dispatch desk.
- [x] CSV exports for filtered manager report lists, including saved offline reports.
- [x] Inclusive due-date ranges in the web list, combined with search, status filters, and offline records.
- [x] Printable saved inspection reports in the web app, including offline access and browser PDF output.
- [x] Web weekly planner with daily workloads, offline browsing, and date-preset new assignments.
- [x] Online manager rescheduling of unfinished assignments, with version checks, action history, and preserved worker drafts.
- [x] Online manager reassignment of unfinished web orders, with version checks, action history, and preserved local drafts and queued reports.
- [x] Web report revision history with saved submissions, review feedback, stable pagination, and a tested SQLite upgrade.
- [x] Monthly web planner with daily workloads, keyboard navigation, filtered exports, offline browsing, and date-preset assignments.
- [x] Read-only server search API and SDK with text, status, worker, priority, date filters, and cursor pagination.
- [x] Web server search with combined filters, incremental result loading, fresh authorization on opening, and preserved offline drafts.
- [x] Bounded recurring assignment API and SDK with daily/weekly dates, atomic creation, and durable retry receipts.
- [x] Web recurring assignment creation with a date preview, planner date preset, and durable recovery after uncertain writes.
- [x] Recurring batch overview with paginated API/SDK, planned/current order comparison, and fresh individual-order opening.
- [x] Filters for upcoming, overdue, submitted, and approved visits in a loaded recurring batch.
- [x] Offline CSV export of filtered batch visits with planned and current dates.
- [x] Reschedule one unfinished order from its recurring batch while keeping the planned date visible.
- [x] Optional coordinates on new sites/assignments and opt-in web maps with configurable raster tiles, attribution, keyboard controls, and offline-readable coordinates.
- [x] Manager coordinate editing for existing sites, with conflict recovery, explicit clearing, and unchanged inspection snapshots.
- [x] Weekday-only recurring batches with Monday–Friday previews, saved-request recovery, and batch browsing.
- [x] Monthly recurring batches with original-day anchoring, shorter-month handling, date previews, saved-request recovery, and batch browsing.
- [x] Recurring batches every two weeks, with date previews, skipped dates and duplicate-safe recovery.
- [x] Recurring batches every three months, with original-day anchoring and shorter-month handling.
- [x] Recurring batches that end on a date, with an inclusive preview and duplicate-safe recovery.
- [x] Per-batch dates to skip for holidays/site closures, with extended previews, preserved order counts and duplicate-safe recovery.
- [x] Reusable site closure dates that managers can copy into new recurring batches.
- [x] Checklist-wide photo requirements, web/Expo guidance, offline draft protection, and server enforcement.
- [x] Photo evidence for individual checklist items, with offline attachments and labeled report history.
- [x] Repeatable Android smoke test for item photos, offline restart, and duplicate-safe reconnect.
- [x] Repeatable iOS smoke test for draft retention, offline restart, and duplicate-safe reconnect.
- [x] Expo outbox recovery that keeps blocked reports through outages and reassignment, with an iOS conflict smoke test.
- [x] Offline assignment status filters in Expo that combine with search and follow the worker's language.
- [x] Expo report history with saved revisions, review feedback, and retry without changing the active draft.
- [x] Offline site coordinates in Expo inspections, taken from the saved assignment snapshot.
- [x] Expo sign-in recovery from the notebook and outbox with the current server, account, and local reports retained.
- [x] Text-response checklist fields on web and Expo, including mixed API templates, offline drafts and saved report exports.
- [x] Numeric checklist readings on web and Expo, with partial offline input, zero/negative decimals, type validation and saved report exports.
- [x] Mixed checklist creation on web, with a response type per question and a bulk entry shortcut.
- [x] Optional units and inclusive limits for numeric checklist items, with offline guidance and server validation.
- [x] Worker invitations with one-time expiring links, a paginated manager ledger, revocation, browser password setup, and preserved device notebooks.
- [x] Worker deactivation and reactivation with manager confirmations, session revocation, active assignment choices, version conflicts, and preserved offline reports.
- [x] Manager worker-access history with actor/time details, stable pagination, retry/restart, and temporary offline browsing.
- [x] Manager-assisted worker password recovery with one-hour links, replacement/revocation, browser password confirmation, session revocation, and preserved offline reports.

## Next · Make daily work easier

- Broader scheduling rules and editing or retiring future series work.
- Automated native flows on Android and iOS.
- Application translations, beginning with English and Indonesian.

## Later · Teams and extensibility

- Organization isolation, scoped roles, and a migration plan for existing workspaces.
- PostgreSQL storage and safe multi-process operation.
- Object storage, attachment retention, and media processing.
- Email and push notifications with user preferences.
- Webhooks, integration examples, and a versioned extension contract.
- Background synchronization with explicit OS and battery constraints.
- Indexed text search and a scalable incremental full-sync protocol.

Discuss substantial changes before implementation. Roadmap entries are directions, not delivery promises. Independent modules should grow from real workflows and public design discussions.
