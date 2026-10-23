# Changelog

## Unreleased · 0.1 foundation

- Manager access-history browsing for worker accounts, with actor/time details, stable cursor pages, read recovery, and temporary offline viewing. Uses existing schema-5 events.

- Manager worker-account deactivation/reactivation with session revocation, active assignment choices, version checks, access events, and preserved offline reports. Includes an additive schema-5 upgrade.

- Web server search with combined filters, paged results, retry/restart actions, and a fresh permission check when opening an order. Browsing preserves saved work and drafts.

- Read-only server work-order search with combined filters, literal Unicode text matching, and cursor pagination. The original offset-based sync endpoint remains compatible.

- Monthly web planner with daily workloads, keyboard date selection, filtered exports, and offline browsing. Managers can assign work for a selected date, including leap days.

- Saved report history in the web app, including original answers, photos, assignment details, and manager feedback. Schema 2 recovers earlier submission acknowledgments and labels unavailable legacy reviews.

- Complete the web component foundation with shadcn dialogs, radio groups, labels, fields, native selects, empty states, avatars, and report tables. Existing Kokonut components, colors, offline drafts, and print behavior are retained.

- Managers can reassign unfinished web orders to another worker. Version checks protect concurrent work, and unavailable assignments keep their blocked reports and photos in the original worker's outbox.

- Shared Kokonut UI controls across the web workspace, with the existing charcoal-and-amber palette, keyboard filter navigation, and photo drop/picker support that preserves offline drafts.

- Managers can change due dates on unfinished web assignments. Version checks prevent stale writes; older offline reports remain available for review and resubmission.

- Kokonut UI command palette for finding saved work and workspace pages, with keyboard shortcuts and offline support. Tailwind utilities are available for gradual component adoption without a global reset.

- Weekly web planner with daily workloads, search/status filters, offline browsing, and date-preset new assignments. Unselected assignment dates now default to the device's local calendar date.

- Printable saved inspection reports for managers and workers, with offline access and a paper layout for browser PDF output.

- Inclusive due-date ranges for manager and worker web lists, with open-ended bounds and offline support.

- CSV exports for the manager's filtered reports, including offline downloads and spreadsheet text handling.

- Overdue work-order filter using the device's local calendar date, with search and offline support.

- Dispatch desk, sites, checklists, and assigned inspections.
- Offline web and Expo worker notebooks with notes and photo attachments.
- Durable outbox, idempotent submissions, version conflicts, and manager review.
- SQLite API, session authentication, role checks, and action history.
- Contributor guides, API and architecture documentation, tests, and CI.

This is the initial development version. See docs/verification.md for validation boundaries.
