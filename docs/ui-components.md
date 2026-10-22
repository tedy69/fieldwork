# Kokonut UI in Fieldwork

Fieldwork adopts [Kokonut UI](https://kokonutui.com/docs) gradually, keeping the industrial notebook direction in DESIGN.md. The first component is its command palette, connected to actual workspace navigation and the current account's saved work orders.

## Find saved work

Choose **Find work**, or press **Cmd+K** / **Ctrl+K** while signed in. Search references, titles, sites, or assignee names. The finder uses fuzzy matching and searches the account's saved orders, independently of the list's current filters. Sync first when you need recent server changes; saved records remain searchable offline.

Arrow keys, Home, and End change the active result. Enter opens it. Escape or Close finder dismisses the modal and restores focus. Tab stays within the modal. Selecting a result moves focus to the destination. The shortcut leaves other open dialogs alone.

Work orders and Sync outbox are available to both roles. Sites & checklists is a manager action. Workers search the assignments already available to their account; the finder adds no server endpoint or permission mechanism. No theme switch, invitation, or other upstream demo action is included.

Searching does not submit reports, clear drafts, or flush the outbox. Search history is not persisted, and signing out removes the finder and its shortcut handler.

## Source and license

- Upstream: [action-search-bar.tsx at b7bb822](https://github.com/kokonut-labs/kokonutui/blob/b7bb822b46d3dfdb7976963a8b86d3ff37df4e8d/components/kokonutui/action-search-bar.tsx), component version 2.0.0.
- Local source: `apps/web/src/components/kokonutui/action-search-bar.tsx`.
- Copyright (c) 2025 kokonutUI, MIT. The [full notice](../apps/web/public/licenses/kokonut-ui-MIT.txt) ships with the built web app at `/licenses/kokonut-ui-MIT.txt`.

Local adaptations remove demo commands/default recents, require real items and handlers, use Phosphor icons, disable transitions by default, remove the artificial completion delay, encode group IDs containing spaces, and allow the host modal to retain focus when Tab leaves the search input. The original fuzzy matching, grouping, result highlighting, keyboard navigation, and optional nested-page behavior are retained.

## Icons

Use [Phosphor React](https://github.com/phosphor-icons/react) (`@phosphor-icons/react`) for web icons. Import individual icons from `@phosphor-icons/react/dist/csr/<Name>` so development builds load only the modules needed. Use the regular weight at 16px for compact controls, inheriting the surrounding text color. The finder uses a magnifying glass for search, a caret for nested pages, an outward arrow for links, and progress/check icons for action state.

The package's [MIT notice](../apps/web/public/licenses/phosphor-icons-MIT.txt) ships at `/licenses/phosphor-icons-MIT.txt` and is cached offline with the application.

Keep visible action labels. Icons that repeat a label should have `aria-hidden="true"`; an icon-only control still needs an accessible name. Add icons only when they help identify an action or state. When copying another registry component, replace its icon imports with Phosphor equivalents rather than adding a second icon library. Native components need a React Native-compatible package and separate validation.

## Adding another component

`apps/web/components.json` configures the `@kokonutui` registry, local aliases, and Tailwind v4 stylesheet. Registry components belong in `apps/web/src/components/kokonutui/`. Follow the [upstream installation instructions](https://kokonutui.com/docs), review the copied code/dependencies, and retain the license notice. Review updates as diffs against the pinned source; do not overwrite local adaptations without checking them.

Tailwind is integrated through the Vite plugin. `src/kokonut.css` imports theme variables and utilities only, with automatic source detection disabled and an explicit component directory. [Preflight is omitted](https://tailwindcss.com/docs/preflight#disabling-preflight) to preserve existing forms, print styles, and layouts. The palette's dark selector and color tokens are scoped to the component; no application-wide theme toggle is introduced.

Keep wrappers responsible for Fieldwork data and actions. New components must work with the established keyboard, responsive, offline, and print workflows. Run `npm ci`, `npm run check`, `npm run check:expo`, and `npm run test:e2e`. Web dependencies must not change Expo's supported React versions.
