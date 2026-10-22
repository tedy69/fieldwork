# Kokonut UI in Fieldwork

Fieldwork uses [Kokonut UI](https://kokonutui.com/docs) across its web workspace while retaining the industrial notebook direction in DESIGN.md. The app combines adapted registry components with the shadcn foundation primitives in Kokonut's own repository. Shared controls keep the same charcoal, amber, and workflow-status colors throughout sign-in, dispatch, inspection, review, resources, and offline work.

## Component coverage

| Area                                 | Shared components                    | Fieldwork behavior                                                                                    |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Sign-in and forms                    | Button, Input, Textarea, Card, Alert | Native form submission, labels, validation, password autocomplete, and error feedback                 |
| Workspace navigation and account     | Button, Card, Phosphor icons         | Existing role-specific destinations and sign-out; drafts remain account-scoped                        |
| Work list and planner                | SmoothTab, Card, Badge               | Controlled view/status filters, arrow/Home/End keys, real saved-record counts, existing status colors |
| Work finder                          | CommandButton, ActionSearchBar       | Visible shortcut keycaps, real navigation/search, host-managed modal and keyboard shortcut            |
| Assignment, rescheduling, and review | Shared buttons and fields            | Existing permissions, online requirements, conflict handling, and saved-report behavior               |
| Inspection photos                    | FileUpload                           | File picker or drop zone writes photos into the durable draft; submission still happens explicitly    |
| Outbox, resources, and empty states  | Card, Alert, Button                  | Real queued items, catalog forms, errors, notices, and empty-state instructions                       |
| CSV and print actions                | Button                               | Existing download/print behavior; controls remain excluded from paper output                          |

`Select` is a Fieldwork-authored native select styled with the same tokens. The native date, radio, and file inputs retain browser behavior; the component foundation wraps these controls rather than replacing them with fake widgets. No chart, trend, sample account, or demo navigation action was added.

## Find saved work

Choose **Find work**, or press **Cmd+K** / **Ctrl+K** while signed in. Search references, titles, sites, or assignee names. The finder uses fuzzy matching and searches the account's saved orders, independently of the list's current filters. Sync first when you need recent server changes; saved records remain searchable offline.

Arrow keys, Home, and End change the active result. Enter opens it. Escape or Close finder dismisses the modal and restores focus. Tab stays within the modal. Selecting a result moves focus to the destination. The shortcut leaves other open dialogs alone.

Work orders and Sync outbox are available to both roles. Sites & checklists is a manager action. Workers search the assignments already available to their account; the finder adds no server endpoint or permission mechanism. No theme switch, invitation, or other upstream demo action is included.

Searching does not submit reports, clear drafts, or flush the outbox. Search history is not persisted, and signing out removes the finder and its shortcut handler.

## Source and license

- Upstream: [action-search-bar.tsx at b7bb822](https://github.com/kokonut-labs/kokonutui/blob/b7bb822b46d3dfdb7976963a8b86d3ff37df4e8d/components/kokonutui/action-search-bar.tsx), component version 2.0.0.
- Local source: `apps/web/src/components/kokonutui/action-search-bar.tsx`.
- Copyright (c) 2025 kokonutUI, MIT. The [full notice](../apps/web/public/licenses/kokonut-ui-MIT.txt) ships with the built web app at `/licenses/kokonut-ui-MIT.txt`.

The same pinned commit supplies `command-button.tsx`, `smooth-tab.tsx`, and `file-upload.tsx` under `components/kokonutui/`, plus the `button`, `input`, `textarea`, `card`, `alert`, and `badge` primitives under `components/ui/`. Their local copies live in the corresponding web directories. The [shadcn MIT notice](../apps/web/public/licenses/shadcn-ui-MIT.txt) ships alongside the Kokonut notice, including in the offline precache.

Adaptations are deliberate:

- ActionSearchBar removes demo commands/default recents, requires real handlers, uses Phosphor icons, disables transitions, removes the artificial completion delay, encodes group IDs, and lets its host modal manage focus.
- CommandButton retains shortcut keycaps and the upstream keyboard parsing. Global handling is off by default because WorkFinder owns Cmd/Ctrl+K and its modal checks. Motion and default sample labels/shortcuts are removed from the product configuration.
- SmoothTab is a controlled selection strip for one work list. Demo panels, swipe physics, and animation are omitted. Native buttons expose `aria-pressed`, retain Enter/Space, add arrow/Home/End navigation, and keep the selected filter visible when used from a keyboard.
- FileUpload retains file-drop and picker interaction but requires a real `onFiles` handler. Simulated progress, remote upload scheduling, retries, and temporary upload queues are omitted because photos belong to Fieldwork's existing durable draft and report outbox. Existing MIME, 2 MB, and three-photo limits remain in OrderDetail.
- Foundation primitives use Fieldwork's colors, small corners, 44px controls, and existing status colors. Native button props/ref/form semantics are preserved. Unused Slot/CVA dependencies and demo variants are omitted; `unstyled` supports work-order rows and calendar-day buttons with their own layouts.

## Icons

Use [Phosphor React](https://github.com/phosphor-icons/react) (`@phosphor-icons/react`) for web icons. Import individual icons from `@phosphor-icons/react/dist/csr/<Name>` so development builds load only the modules needed. Use the regular weight at 16px for compact controls, inheriting the surrounding text color. The finder uses a magnifying glass for search, a caret for nested pages, an outward arrow for links, and progress/check icons for action state.

The package's [MIT notice](../apps/web/public/licenses/phosphor-icons-MIT.txt) ships at `/licenses/phosphor-icons-MIT.txt` and is cached offline with the application.

Keep visible action labels. Icons that repeat a label should have `aria-hidden="true"`; an icon-only control still needs an accessible name. Add icons only when they help identify an action or state. When copying another registry component, replace its icon imports with Phosphor equivalents rather than adding a second icon library. Native components need a React Native-compatible package and separate validation.

## Adding another component

`apps/web/components.json` configures the `@kokonutui` registry, local aliases, and Tailwind v4 stylesheet. Registry components belong in `apps/web/src/components/kokonutui/`. Follow the [upstream installation instructions](https://kokonutui.com/docs), review the copied code/dependencies, and retain the license notice. Review updates as diffs against the pinned source; do not overwrite local adaptations without checking them.

Tailwind is integrated through the Vite plugin. `src/kokonut.css` imports theme variables and utilities only, with automatic source detection disabled and explicit registry/foundation directories. [Preflight is omitted](https://tailwindcss.com/docs/preflight#disabling-preflight). `workspace-ui.css` applies the shared controls and layout tokens after the existing application styles. The HTML root has the chosen dark brand theme, including when the OS requests light mode; the charcoal/amber palette stays unchanged.

Prefer the shared primitives for application controls. Retain a button's native submit/type/ref behavior, and use `variant="unstyled"` for a record row or calendar day with its own layout. Keep async state in its workflow component, and retain visible names for buttons and fields. Inspect copied components for fake actions, timers, progress, or sample data before integration. Updating a registry source must preserve these adaptations and both MIT notices.

Keep wrappers responsible for Fieldwork data and actions. New components must work with the established keyboard, responsive, offline, and print workflows. Run `npm ci`, `npm run check`, `npm run check:expo`, and `npm run test:e2e`. Web dependencies must not change Expo's supported React versions.
