# Kokonut UI and shadcn in Fieldwork

## Notebook redesign

The web workspace now uses `tokens.css` as its runtime theme source, documented in [DESIGN.md](../DESIGN.md). Page headings, compact workload summaries, record rows, question fieldsets, workspace setup and dialogs share the charcoal/amber direction. Exports follow the work list instead of interrupting its filters. The [UX contract](../UX-CONTRACT.md) names shared behavior and its domain sources.

The work board groups views, search, status filters, dates and records in one panel. Inspection content sits beside order tools on wide screens. Setup pairs each saved catalog with its form. These layouts use 10px panels, 6px controls, shared section spacing and the same sentence-case hierarchy. Expo retains its platform-native interface.

Use `PanelHeader` and `ActionGroup` from `components.tsx` for section titles and wrapping actions. Use `DialogHeader` within `DialogContent` for every modal; select `size="form"`, `"directory"`, `"compare"` or `"finder"` to fit the task. `workspace-ui.css` owns modal widths, insets, borders and title alignment. Feature CSS should only arrange the modal's contents. Eight dialog families have recorded phone/desktop checks for title/close separation, focus containment, return focus and viewport bounds.

`Form` composes the shadcn fields and Alert, owns constraint validation without browser bubbles, associates recovery text and focuses the first invalid control. Shared Input provides password reveal; SearchField provides immediate clearing and input focus. Label separates these controls from their action buttons, preserving a real label association. Textarea grows in supporting browsers up to a bounded height and remains scrollable everywhere. The global scrollbar baseline applies to all owned overflow regions, with forced-colors support.

The README gallery is captured from the production web build and a fresh in-memory synthetic workspace:

```sh
npm run build -w @fieldwork/web
UPDATE_README_IMAGES=1 npm exec -- playwright test tests/e2e/redesign.spec.ts
```

The screenshot workflow creates demo assignments through the SDK, renders desktop and phone views, and saves images only when `UPDATE_README_IMAGES=1` is set. The twelve captures cover sign-in, dispatch, assignment, planning, resources, worker accounts, inspection, report review, outbox and phone layouts. Without that flag, screenshots stay in ignored test output. Use a free port 4173; the fixture server never reads or overwrites a development database. One-time links and entered credentials are absent from the captures; the sign-in page labels the public local-demo credentials.

## Feature integrations

Worker password recovery uses shared Button, Input, Label, Badge, and Alert inside the existing Dialog. The shared AccountLink screen handles invitations and password reset with shadcn Card, fields, and explicit password confirmation. Amber focus marks headings and controls; no new primitive, palette, or animation is introduced. Link inputs are masked in documentation screenshots, and password fields are empty.

The worker access-history section uses shared Button, Badge, and Alert inside the existing manager Dialog. The selected worker heading receives amber focus; flat chronological rows show real actor/time metadata. Read errors retain loaded rows, offline controls disable, and narrow actions wrap without a new surface or animation.

Worker accounts reuses shared Dialog, Button, Badge, and Alert primitives, the flat worker ledger, and an inline confirmation. Access state has a text label, headings receive amber focus, and change failures require a fresh read. Loaded rows remain visible offline; controls keep 44px targets and wrap at narrow widths. See [worker access](worker-access.md).

Worker invitations use the shared Dialog, Button, Input, Label, FieldSet, FieldError, Badge, Alert, and Empty controls. A flat ledger sits below creation or the one-time link. The acceptance page reuses the notebook sign-in layout with labeled password fields and explicit account confirmation. Amber focus styling covers programmatically focused headings as well as controls; links are masked in documentation screenshots.

Weekday recurrence adds an option to the existing shadcn Native Select. The same Mon–Fri label appears in dispatch recovery and the batch ledger. Existing Button, FieldSet, Input, and Dialog behavior, the date preview, and the charcoal/amber styling remain the foundation.

Photo evidence uses the shared Native Select and Label in checklist setup. Required policies appear in catalog text and assignment options, while the worker notebook keeps guidance beside the existing Kokonut upload area and reports missing evidence through shadcn FieldError. A policy-only form change is protected by the existing map reload guard.

Existing-site coordinate editing uses shared Button, Input, Label, FieldSet, FieldLegend, and FieldError primitives. The inline charcoal form repeats the amber edit rule used for rescheduling, separates loaded and proposed coordinates, and wraps actions on phones. Conflict recovery preserves the proposal and requires a fresh site read before saving.

The [site map](site-maps.md) uses shared Card, Button, and Alert primitives around Leaflet's geographic canvas. Default Leaflet controls are disabled; Fieldwork supplies labeled zoom/recenter/hide controls, visible attribution, and the existing charcoal/amber theme. Leaflet handles tile geometry and pointer interaction, while map-only keyboard handlers disable animated movement. Its BSD notice is shipped alongside the existing component licenses.

The [web server-search dialog](server-search.md#web-search) uses the shared Dialog, Button, Input, Native Select, Label, FieldSet, Badge, Alert, and Empty foundation. Screen composition groups actual filters and temporary server results; opening a result uses the existing local cache adapter.

The [monthly planner](month-planner.md) uses the shared Kokonut selection strip and Button foundation. Its calendar and phone date ledger are screen composition around those controls, with existing theme tokens and no new library dependency.

The [report history viewer](report-history.md) also uses the shared shadcn Dialog, Button, Badge, Alert, Empty, and Table. Its version ledger is screen composition around these primitives; charcoal/amber tokens and Phosphor icons remain unchanged.

Fieldwork uses [Kokonut UI](https://kokonutui.com/docs) and [shadcn/ui](https://ui.shadcn.com/docs/components) throughout its web workspace while retaining the industrial notebook direction in DESIGN.md. Kokonut provides the finder, shortcut button, selection strips, and photo uploader. The shared shadcn foundation supplies the remaining UI primitives. Controls keep the same charcoal, amber, and workflow-status colors throughout sign-in, dispatch, inspection, review, resources, and offline work.

## Component coverage

| Area                                 | Shared components                    | Fieldwork behavior                                                                                    |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Sign-in and forms                    | Button, Input, Textarea, Card, Alert | Native form submission, labels, validation, password autocomplete, and error feedback                 |
| Workspace navigation and account     | Button, Card, Phosphor icons         | Existing role-specific destinations and sign-out; drafts remain account-scoped                        |
| Work list and planner                | SmoothTab, Card, Badge               | Controlled view/status filters, arrow/Home/End keys, real saved-record counts, existing status colors |
| Work finder                          | CommandButton, ActionSearchBar       | Visible shortcut keycaps, real navigation/search, host-managed modal and keyboard shortcut            |
| Assignment, rescheduling, and review | Shared buttons and fields            | Existing permissions, online requirements, conflict handling, and saved-report behavior               |
| Inspection photos                    | FileUpload                           | File picker or drop zone writes photos into the durable draft; submission still happens explicitly    |
| Outbox, resources, and empty states  | Card, Alert, Button, Empty           | Real queued items, catalog forms, errors, notices, and empty-state instructions                       |
| CSV and print actions                | Button                               | Existing download/print behavior; controls remain excluded from paper output                          |

| Additional area                            | Shared components                                                        | Behavior retained                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Assignment and finder modals               | Dialog, DialogContent, DialogTitle, DialogDescription                    | Radix focus containment, background hiding, Escape, focus restoration, and protected in-flight assignment saves |
| Checklist answers                          | RadioGroup, RadioGroupItem, Label, FieldSet, FieldLegend                 | Required answers, pass/issue/N/A values, arrow-key selection, local draft persistence                           |
| Forms and validation                       | Input, Textarea, NativeSelect, NativeSelectOption, Label, FieldError     | Native date/file/select behavior, browser validation, real errors and form submission                           |
| Empty/loading screens and account initials | Empty, EmptyHeader, EmptyTitle, EmptyDescription, Avatar, AvatarFallback | Actual empty/loading messages and initials derived from the signed-in account                                   |
| Printable report                           | Table, TableHeader, TableBody, TableRow, TableHead, TableCell            | Semantic row/column headers, wrapped notes, repeated print headings, and multi-page output                      |

`NativeSelect` comes from shadcn's [official native select](https://ui.shadcn.com/docs/components/radix/native-select), with a Phosphor caret and Fieldwork's field tokens. It keeps browser/OS option selection and FormData behavior. File inputs use shadcn Input; checklist answers use the Radix-backed RadioGroup. Textarea has its own module.

All web dates use `DatePicker`, composing the [shadcn date picker](https://ui.shadcn.com/docs/components/radix/date-picker) pattern from Calendar, Radix Popover, Input and Button. Use `value`/`onValueChange` for controlled dates or `defaultValue`/`onValueChange` for FormData fields, and supply a descriptive `calendarLabel`. Label keeps the calendar button outside the input's real label. Typed values retain the YYYY-MM-DD contract; impossible or incomplete dates show local recovery text and block submission. Date filters show no results for invalid values. The calendar supports arrow keys, Page Up/Down, Enter, Escape, Today and Clear date. It fits narrow viewports, scrolls at short heights, and layers above dialogs without closing the parent on Escape. No native `type="date"` field remains in the web app. Expo's native inputs are unchanged.

Use components from `src/components/ui/` or `src/components/kokonutui/` for web UI primitives. Do not add another local button, field, modal, or selection widget in a screen. Application screens still compose semantic forms, navigation, sections, lists, headings, record metadata, and layout containers; these are product structure rather than a second component library. This migration is for the DOM-based web app. Expo keeps its platform-native interface.

## Find saved work

Choose **Find work**, or press **Cmd+K** / **Ctrl+K** while signed in. Search references, titles, sites, or assignee names. The finder uses fuzzy matching and searches the account's saved orders, independently of the list's current filters. Sync first when you need recent server changes; saved records remain searchable offline.

Arrow keys, Home, and End change the active result. Enter opens it. Escape or Close finder dismisses the modal and restores focus. Tab stays within the modal. Selecting a result moves focus to the destination. The shortcut leaves other open dialogs alone.

Work orders and Sync outbox are available to both roles. Sites & checklists is a manager action. Workers search the assignments already available to their account; the finder adds no server endpoint or permission mechanism. No theme switch, invitation, or other upstream demo action is included.

Searching does not submit reports, clear drafts, or flush the outbox. Search history is not persisted, and signing out removes the finder and its shortcut handler.

## Source and license

- Upstream: [action-search-bar.tsx at b7bb822](https://github.com/kokonut-labs/kokonutui/blob/b7bb822b46d3dfdb7976963a8b86d3ff37df4e8d/components/kokonutui/action-search-bar.tsx), component version 2.0.0.
- Local source: `apps/web/src/components/kokonutui/action-search-bar.tsx`.
- Copyright (c) 2025 kokonutUI, MIT. The [full notice](../apps/web/public/licenses/kokonut-ui-MIT.txt) ships with the built web app at `/licenses/kokonut-ui-MIT.txt`.

The same pinned Kokonut commit supplies `command-button.tsx`, `smooth-tab.tsx`, and `file-upload.tsx` under `components/kokonutui/`, plus the original `button`, `input`, `card`, `alert`, and `badge` foundation under `components/ui/`. Their local copies live in the corresponding web directories.

The additional shadcn source is pinned at [3d98900](https://github.com/shadcn-ui/ui/tree/3d98900e9b73c45f035f8109e9d41ba6a51685e7/apps/v4/registry/new-york-v4/ui): `dialog.tsx`, `radio-group.tsx`, `label.tsx`, `native-select.tsx`, `textarea.tsx`, `field.tsx`, `empty.tsx`, `avatar.tsx`, `table.tsx`, `calendar.tsx`, `popover.tsx`, and Button's `asChild`/Slot support. Local files retain source notices. The used exports are adapted to Fieldwork's styles rather than bringing in default registry colors, animation utilities, or unused variants. EmptyTitle renders a real heading, the table container permits print pagination, and the radio indicator uses a CSS dot instead of another icon dependency.

`radix-ui` is pinned to 1.8.1 in the web workspace for Dialog, Popover, RadioGroup, Label, Avatar, and Slot behavior. Calendar uses `react-day-picker` 9.14.0, matching the pinned shadcn adapter's API. React, React Native, and Expo versions are unchanged. The [shadcn MIT notice](../apps/web/public/licenses/shadcn-ui-MIT.txt), [DayPicker MIT notice](../apps/web/public/licenses/react-day-picker-MIT.txt) and [Radix MIT notice](../apps/web/public/licenses/radix-ui-MIT.txt) ship alongside the Kokonut notice and are cached offline.

Adaptations are deliberate:

- ActionSearchBar removes demo commands/default recents, requires real handlers, uses Phosphor icons, disables transitions, removes the artificial completion delay, and encodes group IDs. Its input, label, and button use shared primitives; its shadcn host modal manages focus and ignores the shortcut while another modal is open.
- CommandButton retains shortcut keycaps and the upstream keyboard parsing. Global handling is off by default because WorkFinder owns Cmd/Ctrl+K and its modal checks. Motion and default sample labels/shortcuts are removed from the product configuration.
- SmoothTab is a controlled selection strip for one work list. Demo panels, swipe physics, and animation are omitted. Native buttons expose `aria-pressed`, retain Enter/Space, add arrow/Home/End navigation, and keep the selected filter visible when used from a keyboard.
- FileUpload retains file-drop and picker interaction but requires a real `onFiles` handler. Simulated progress, remote upload scheduling, retries, and temporary upload queues are omitted because photos belong to Fieldwork's existing durable draft and report outbox. Existing MIME, 2 MB, and three-photo limits remain in OrderDetail.
- Foundation primitives use Fieldwork's colors, small corners, 44px controls, and existing status colors. Native button props/ref/form semantics are preserved, with Radix Slot for `asChild`. Unused CVA variants are omitted; `unstyled` supports work-order rows and calendar-day buttons with their own layouts.
- Dialog delegates focus trapping, background hiding, and dismissal to Radix. The host restores the launch control on cancellation and the main content after navigation/creation. Assignment creation blocks Escape and dismissal while saving. NativeSelect supplies its standard wrapper/option structure; RadioGroup keeps browser required validation and forwards each explicit answer into the durable draft.

## Icons

Use [Phosphor React](https://github.com/phosphor-icons/react) (`@phosphor-icons/react`) for web icons. Import individual icons from `@phosphor-icons/react/dist/csr/<Name>` so development builds load only the modules needed. Use the regular weight at 16px for compact controls, inheriting the surrounding text color. The finder uses a magnifying glass for search, a caret for nested pages, an outward arrow for links, and progress/check icons for action state.

The package's [MIT notice](../apps/web/public/licenses/phosphor-icons-MIT.txt) ships at `/licenses/phosphor-icons-MIT.txt` and is cached offline with the application.

Keep visible action labels. Icons that repeat a label should have `aria-hidden="true"`; an icon-only control still needs an accessible name. Add icons only when they help identify an action or state. When copying another registry component, replace its icon imports with Phosphor equivalents rather than adding a second icon library. Native components need a React Native-compatible package and separate validation.

## Adding another component

`apps/web/components.json` configures the `@kokonutui` registry, local aliases, and Tailwind v4 stylesheet. Registry components belong in `apps/web/src/components/kokonutui/`. Follow the [upstream installation instructions](https://kokonutui.com/docs), review the copied code/dependencies, and retain the license notice. Review updates as diffs against the pinned source; do not overwrite local adaptations without checking them.

Tailwind is integrated through the Vite plugin. `src/kokonut.css` imports theme variables and utilities only, with automatic source detection disabled and explicit registry/foundation directories. [Preflight is omitted](https://tailwindcss.com/docs/preflight#disabling-preflight). `workspace-ui.css` applies the shared controls and layout tokens after the existing application styles. The HTML root has the chosen dark brand theme, including when the OS requests light mode; the charcoal/amber palette stays unchanged.

Prefer the shared primitives for application controls. Retain a button's native submit/type/ref behavior, and use `variant="unstyled"` for a record row or calendar day with its own layout. Keep async state in its workflow component, and retain visible names for buttons and fields. Inspect copied components for fake actions, timers, progress, or sample data before integration. Updating a registry source must preserve these adaptations and both MIT notices.

Keep wrappers responsible for Fieldwork data and actions. New components must work with the established keyboard, responsive, offline, and print workflows. Run `npm ci`, `npm run check`, `npm run check:expo`, and `npm run test:e2e`. Web dependencies must not change Expo's supported React versions.
