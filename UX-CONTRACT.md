# Fieldwork UX contract

## Product context

Field workers inspect a site and keep their notes through poor connectivity. Dispatch managers assign work and review reports. The web workspace uses English, Gregorian date-only values, and the device's locale for dates and times. No Japan-specific market or data policy is defined. Accessibility target: WCAG 2.2 AA. Visual decisions belong in [DESIGN.md](DESIGN.md).

## Business-context sources

| Domain / scope                       | Authoritative source                                                         | Source type                                 | Reviewed date |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------- | ------------- |
| Permissions and lifecycle            | docs/architecture.md, docs/api.md                                            | Domain/API contract                         | 2026-10-23    |
| Device retention and synchronization | docs/offline-sync.md, SECURITY.md                                            | Persistence/security policy                 | 2026-10-23    |
| Worker access and credential setup   | docs/worker-access.md, docs/password-recovery.md, docs/worker-invitations.md | Account lifecycle                           | 2026-10-23    |
| Maps and coordinate sharing          | docs/site-maps.md                                                            | Privacy and version contract                | 2026-10-23    |
| Billing and legal claims             | README.md project status                                                     | No billing workflow or certification claims | 2026-10-23    |

## Canonical UI Map

| Capability     | Canonical owner                                                   | Source of truth                       | Allowed variants                           | Verification                                                     |
| -------------- | ----------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| Select/Listbox | components/ui/native-select.tsx                                   | DESIGN.md and this contract           | native                                     | Assignment and search browser workflows; open popup and keyboard |
| Date           | components/ui/input.tsx                                           | Date-only contracts and this contract | native                                     | Date-range, rescheduling, week/month browser workflows           |
| Form           | components/ui/form.tsx with Input, Label, Textarea and FieldError | This contract                         | create / edit / sign-in                    | Validation, field focus and failure browser tests                |
| Scrollbar      | styles.css and tokens.css                                         | DESIGN.md                             | Global baseline; table/dialog geometry     | Computed styles and narrow/short layouts                         |
| Toast          | components/ui/alert.tsx                                           | This contract                         | Persistent inline status / warning / error | Live-region and retry browser workflows                          |
| CRUD           | Existing screen controllers through SDK                           | docs/api.md and flow ledger below     | return / stay / open-created-order         | Full browser workflow suite                                      |

Native selects and native date popups deliberately retain the operating system's geometry, language and interaction. Fieldwork owns the labeled trigger and stored values; it does not promise identical platform popups. Checklist choices use the shared Radix radio group. There is no bulk table selection.

## Controls and validation

- Shared Kokonut UI/shadcn buttons, cards, fields, dialogs, selection strips and tables remain canonical. Actions keep their visible label, keyboard behavior and 44px target. Phosphor icons identify actual actions.
- PanelHeader and ActionGroup in components.tsx own section headings and wrapping action groups. DialogHeader and DialogContent in components/ui/dialog.tsx own modal frames; form, directory, compare and finder are the only size variants. Feature CSS must not duplicate dialog geometry or colors.
- Form disables browser validation bubbles, checks native constraint metadata, associates text recovery guidance with invalid fields, and focuses the first invalid field. Domain validation remains in shared contracts and the API. A failed save retains entered values.
- Password fields are masked initially, allow paste/autofill, and have a keyboard-accessible reveal toggle. Account setup remains separate from normal sign-in and cached notebooks.
- SearchField owns immediate clearing and returns focus to its input. Cached search is immediate and local; server search uses explicit Search submission, not requests on each keystroke. The finder retains its local matching and composition-safe shortcuts.
- Textarea cannot be manually resized. Its initial rows remain usable in all browsers; supporting browsers grow it to a bounded height, with scrolling for long text.

## Dataset navigation

The cached assignment notebook remains a complete account-scoped collection, filtered locally. Its footer reports shown and cached counts. Online search, revisions, invitations, worker access, and audit ledgers retain their bounded server cursors and explicit Load more actions.

Cached filters and selection stay in workspace memory while opening and returning from an inspection. They deliberately stay out of shareable URLs: a device notebook can contain unsent, account-specific and stale records. This redesign does not change that persistence contract. Search results are cached individually, never treated as a full sync snapshot.

Loading, empty, no-results, stale, unavailable and blocked states retain actionable text. A refresh never replaces saved work with a successful empty result after an error.

## Flow ledger

| Operation         | Trigger                                    | Pending                            | Success destination    | Success feedback                 | Failure recovery                 | Focus outcome   | Source ref                                                    |
| ----------------- | ------------------------------------------ | ---------------------------------- | ---------------------- | -------------------------------- | -------------------------------- | --------------- | ------------------------------------------------------------- |
| Assign work       | Assign work order                          | Disable repeated save              | Newly created order    | Assignment status                | Retain form and retry            | Main content    | docs/api.md                                                   |
| Catalog create    | Add site / Add checklist                   | Disable save                       | Same catalog           | Inline saved status              | Retain fields                    | Existing form   | docs/architecture.md                                          |
| Inline edit       | Save date / Save worker / Save coordinates | Lock current write                 | Same order/site        | Inline status                    | Retain proposal, reload conflict | Saved section   | docs/rescheduling.md, docs/reassignment.md, docs/site-maps.md |
| Worker access     | Disable / Reactivate                       | Lock dialog dismissal during write | Same directory         | Account status                   | Fresh read before retry          | Selected worker | docs/worker-access.md                                         |
| Password recovery | Create / Replace / Revoke reset link       | Lock write                         | Same worker section    | Metadata and copy feedback       | Fresh read after uncertain write | Current section | docs/password-recovery.md                                     |
| Inspection        | Submit inspection / Save report for sync   | Preserve local draft               | Same inspection/outbox | Explicit local and server states | Retain notes/photos and retry    | Current context | docs/offline-sync.md                                          |
| Review            | Approve inspection / Request changes       | Disable repeat review              | Same report            | Persistent review status         | Keep feedback and retry          | Current report  | docs/api.md                                                   |

## Navigation and responsive behavior

The three existing workspace destinations remain Work orders, Sync outbox, and manager-only Sites & checklists. Desktop uses a sidebar; narrow screens show the same labeled navigation in normal document flow. No hidden icon-only destinations or invented navigation are introduced.

Document titles use `Page · Fieldwork`; inspection titles use their reference, never credentials or link tokens. Public setup and sign-in own their titles. Permission and server failures remain actionable inline and leave navigation available; API access rules remain authoritative.

Work rows stack on phones while keeping reference, site, worker, due date and status. Week/month planners retain their established keyboard date selection and narrow ledger layouts. The document owns page/form scrolling; only dialogs, maps, and bounded ledgers own internal overflow. Focus must remain visible at narrow/short heights.

The work board keeps view selection, search, filters, dates and exports with their records. Inspection metadata precedes the content and tools columns; narrow layouts stack the tools after the inspection. Setup sections show saved records before their creation form in document order, with columns on wide screens. These compositions reuse the same headings, panel radius, action spacing and field controls.

## Overlays and feedback

Radix Dialog owns modality, focus containment, Escape and restoration. Existing per-workflow guards block dismissal during writes or uncertain operations. Long dialogs scroll within the viewport, with a 16px minimum outer inset and a shared title/description/close alignment. The eight dialog families are checked at 390px and 1440px for non-overlapping titles/actions, bounded geometry, tab containment and return focus. Alerts stay next to the affected task; normal status is polite, errors remain until corrected, and no credential is included in notification text.

The existing confirmation and retained-draft policies remain in their domain controllers. No browser alert/confirm/prompt, automatic dismissal timer, new hard-delete action, or automatic sign-in is added.

## Async and resilience

Manager writes wait for server confirmation. Inspections may queue only through the durable offline repository. Drafts, photos, receipt IDs, version conflicts, access revocation, session boundaries and uncertain recurring dispatch recovery retain the contracts cited above. Theme changes do not clear caches, outboxes, or form state.

## Verification and migration

Shared tokens and primitives migrate first, followed by sign-in/account setup, permission dialogs, assignment/planning, inspection/review, resources and outbox. The browser suite verifies these complete workflows after the migration; tests/e2e/redesign.spec.ts covers the shared control changes and responsive screens. Existing feature CSS keeps only geometry and domain-specific layouts, rather than a second theme. Rollback is a source revert; no schema or storage migration is required.
