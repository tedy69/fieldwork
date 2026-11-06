# Roadmap

The first milestone is a reliable inspection loop. A checked item below means implemented; device acceptance is recorded separately in docs/verification.md.

## 0.1 · Inspection foundation

- [x] Manager and field worker roles.
- [x] Sites, checklists, assignment, and inspection reports.
- [x] Web dispatch desk and offline browser notebook.
- [x] Expo worker notebook with local SQLite drafts and secure session storage.
- [x] English and Indonesian sign-in on web and Expo, with a saved device preference.
- [x] First-open language follows the device, with explicit choices saved on web and Expo.
- [x] English and Indonesian invitation and password-reset pages that share the web sign-in preference.
- [x] The web document language follows the selected language through sign-in, the workspace, and account recovery.
- [x] English and Indonesian assignment and outbox screens in the Expo worker notebook.
- [x] Localized Expo sync recovery with a retry action that keeps saved work visible during an outage.
- [x] Retry web sync from the notebook warning while keeping saved work visible.
- [x] English and Indonesian inspection forms and saved reports in Expo, including reading and photo guidance.
- [x] English and Indonesian web worker lists and outbox, with localized date filters and draft export.
- [x] English and Indonesian manager dispatch list, planners, single assignment form, and export controls.
- [x] English and Indonesian manager report review, worker handover, and due-date editing.
- [x] English and Indonesian web worker inspection forms and saved reports, with localized photo and reading feedback.
- [x] English and Indonesian report history and printable reports for web workers, with localized dates and UTC timestamps in print.
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
- [x] Overdue filter with search and offline support in the Expo notebook.
- [x] Due today filter for open work on web and Expo, with offline search and the device’s local date.
- [x] Next 7 days filter on web and Expo, with offline search and a rolling local date range.
- [x] Urgent work filter on web and Expo that combines with search and excludes approved orders.
- [x] To do filter in the web and Expo worker notebooks for new assignments and requested corrections.
- [x] Pencil marker for saved local drafts in web and Expo assignment lists.
- [x] Drafts filter to resume saved inspections offline on web and Expo.
- [x] Localized Expo due dates in saved assignment rows, screen-reader hints, and inspection details.
- [x] Copy an inspection reference from saved assignments in Expo, including offline.
- [x] CSV exports for filtered manager report lists, including saved offline reports.
- [x] CSV exports for the filtered manager work schedule, including offline assignments.
- [x] All-day calendar exports for filtered manager schedules and planner days, including offline.
- [x] Personal calendar exports from the web worker's week and month planners.
- [x] Inclusive due-date ranges in the web list, combined with search, status filters, and offline records.
- [x] Printable saved inspection reports in the web app, including offline access and browser PDF output.
- [x] Web weekly planner with daily workloads, offline browsing, and date-preset new assignments.
- [x] Online manager rescheduling of unfinished assignments, with version checks, action history, and preserved worker drafts.
- [x] Online manager reassignment of unfinished web orders, with version checks, action history, and preserved local drafts and queued reports.
- [x] Web report revision history with saved submissions, review feedback, stable pagination, and a tested SQLite upgrade.
- [x] Monthly web planner with daily workloads, keyboard navigation, filtered exports, offline browsing, and date-preset assignments.
- [x] Jump directly to a date in the web week and month planners, including offline.
- [x] Read-only server search API and SDK with text, status, worker, priority, date filters, and cursor pagination.
- [x] Web server search with combined filters, incremental result loading, fresh authorization on opening, and preserved offline drafts.
- [x] Bounded recurring assignment API and SDK with daily/weekly dates, atomic creation, and durable retry receipts.
- [x] Web recurring assignment creation with a date preview, planner date preset, and durable recovery after uncertain writes.
- [x] English and Indonesian recurring assignment creation, date exceptions, and saved-request recovery.
- [x] Recurring batch overview with paginated API/SDK, planned/current order comparison, and fresh individual-order opening.
- [x] English and Indonesian recurring batch browsing, visit filters, and individual rescheduling.
- [x] Recurring batch search by title, worker, site, ID, or work order reference, with paginated matches and retry.
- [x] Recurring batch frequency and open-work filters combined with search and pagination.
- [x] Filters for upcoming, overdue, rescheduled, closed-site, submitted, and approved visits in a loaded recurring batch.
- [x] Offline CSV export of filtered batch visits with planned and current dates.
- [x] Reschedule one unfinished order from its recurring batch while keeping the planned date visible.
- [x] Reuse a recurring batch with a new first date, preview, and the standard duplicate-safe save.
- [x] Optional coordinates on new sites/assignments and opt-in web maps with configurable raster tiles, attribution, keyboard controls, and offline-readable coordinates.
- [x] Manager coordinate editing for existing sites, with conflict recovery, explicit clearing, and unchanged inspection snapshots.
- [x] English and Indonesian site creation, coordinate editing, and closure dates.
- [x] Weekday-only recurring batches with Monday–Friday previews, saved-request recovery, and batch browsing.
- [x] Weekend-only recurring batches with Saturday–Sunday previews and skipped dates.
- [x] Weekly batches on selected days with date previews and saved-request recovery.
- [x] Monthly recurring batches with original-day anchoring, shorter-month handling, date previews, saved-request recovery, and batch browsing.
- [x] Month-end recurring batches that stay on each month's last day, with date previews and saved-request recovery.
- [x] Recurring batches on the last weekday of each month, with weekend adjustment and saved-request recovery.
- [x] Recurring batches every two weeks, with date previews, skipped dates and duplicate-safe recovery.
- [x] Recurring batches every three months, with original-day anchoring and shorter-month handling.
- [x] Recurring batches that end on a date, with an inclusive preview and duplicate-safe recovery.
- [x] Per-batch dates to skip for holidays/site closures, with extended previews, preserved order counts and duplicate-safe recovery.
- [x] Reusable site closure dates that managers can copy into new recurring batches.
- [x] Flag planned visits that fall on a site closure before assigning a recurring batch.
- [x] Show site closure dates when a manager creates or moves an individual visit.
- [x] Flag and filter unfinished visits on site closure dates in the manager dispatch desk.
- [x] Mark days with unfinished closure visits in the manager's week and month planners.
- [x] Suggest the next open date when a manager assigns or moves a visit onto a site closure.
- [x] Checklist-wide photo requirements, web/Expo guidance, offline draft protection, and server enforcement.
- [x] Photo evidence for individual checklist items, with offline attachments and labeled report history.
- [x] Repeatable Android smoke test for item photos, offline restart, and duplicate-safe reconnect.
- [x] Repeatable iOS smoke test for draft retention, offline restart, and duplicate-safe reconnect.
- [x] Expo outbox recovery that keeps blocked reports through outages and reassignment, with an iOS conflict smoke test.
- [x] Offline assignment status filters in Expo that combine with search and follow the worker's language.
- [x] One-tap clearing of Expo assignment search and filters, independently and offline.
- [x] One-tap clearing of the web work-order filter without clearing search or dates.
- [x] Expo report history with saved revisions, review feedback, and retry without changing the active draft.
- [x] Offline site coordinates in Expo inspections, taken from the saved assignment snapshot.
- [x] Copy saved site coordinates in web and Expo inspections, including offline.
- [x] Copy the summary from a saved report or loaded revision on web and Expo.
- [x] Repeatable Android and iOS smoke tests for copying the exact saved coordinates during an API outage.
- [x] Expo sign-in recovery from the notebook and outbox with the current server, account, and local reports retained.
- [x] Repeatable Android smoke test for Expo sign-in recovery, assignment filters, saved coordinates, report history, and Back navigation.
- [x] Web worker sign-in recovery in English and Indonesian, with queued reports retained through session expiry.
- [x] Text-response checklist fields on web and Expo, including mixed API templates, offline drafts and saved report exports.
- [x] Numeric checklist readings on web and Expo, with partial offline input, zero/negative decimals, type validation and saved report exports.
- [x] Mixed checklist creation on web, with a response type per question and a bulk entry shortcut.
- [x] English and Indonesian checklist creation, including mixed answers, reading limits, and photo requirements.
- [x] Optional units and inclusive limits for numeric checklist items, with offline guidance and server validation.
- [x] Worker invitations with one-time expiring links, a paginated manager ledger, revocation, browser password setup, and preserved device notebooks.
- [x] English and Indonesian manager invitation creation, copying, and revocation.
- [x] Worker deactivation and reactivation with manager confirmations, session revocation, active assignment choices, version conflicts, and preserved offline reports.
- [x] English and Indonesian worker account status, access confirmations, and access history.
- [x] Manager worker-access history with actor/time details, stable pagination, retry/restart, and temporary offline browsing.
- [x] Manager-assisted worker password recovery with one-hour links, replacement/revocation, browser password confirmation, session revocation, and preserved offline reports.
- [x] English and Indonesian manager controls for creating, copying, replacing, and revoking password reset links.

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
