# Roadmap

The first milestone is a reliable inspection loop. A checked item below means implemented; device acceptance is recorded separately in docs/verification.md.

## 0.1 · Inspection foundation

- [x] Manager and field worker roles.
- [x] Sites, checklists, assignment, and inspection reports.
- [x] Web dispatch desk and offline browser notebook.
- [x] Expo worker notebook with local SQLite drafts and secure session storage.
- [x] Notes, photo attachments, durable outbox, and idempotent submissions.
- [x] Version conflicts, approval, requests for changes, and action history.
- [x] API and sync tests, browser workflow checks, Docker setup, contributor documentation.
- [x] Overdue filter with search and offline support in the web notebook and dispatch desk.
- [x] CSV exports for filtered manager report lists, including saved offline reports.
- [x] Inclusive due-date ranges in the web list, combined with search, status filters, and offline records.
- [x] Printable saved inspection reports in the web app, including offline access and browser PDF output.
- [x] Web weekly planner with daily workloads, offline browsing, and date-preset new assignments.
- [x] Online manager rescheduling of unfinished assignments, with version checks, action history, and preserved worker drafts.

## Next · Make daily work easier

- Search, server-side filtering, and incremental list loading.
- Richer calendar views, recurring assignments, and reassignment workflows.
- Maps with opt-in site coordinates and a documented tile provider.
- Accessible checklist field types: readings, numbers, text, and required evidence.
- Report revision history.
- User invitation and account lifecycle UI.
- Automated native flows on Android and iOS.
- Translations, beginning with English and Indonesian.

## Later · Teams and extensibility

- Organization isolation, scoped roles, and a migration plan for existing workspaces.
- PostgreSQL storage and safe multi-process operation.
- Object storage, attachment retention, and media processing.
- Email and push notifications with user preferences.
- Webhooks, integration examples, and a versioned extension contract.
- Background synchronization with explicit OS and battery constraints.

Discuss substantial changes before implementation. Roadmap entries are directions, not delivery promises. Independent modules should grow from real workflows and public design discussions.
