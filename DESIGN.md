---
version: alpha
colors:
  ink: '#151d20'
  surface: '#1c2629'
  raised: '#243034'
  foreground: '#edf1ee'
  muted: '#adbbb6'
  primary: '#f5c66d'
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 15px
    lineHeight: 1.5
  heading:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: 34px
    lineHeight: 1.25
  reference:
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace'
    fontSize: 12px
    lineHeight: 1.5
rounded:
  control: 6px
  panel: 10px
spacing:
  field: 12px
  section: 24px
  page: 36px
omitted:
  - section: components
    reason: 'Existing runtime component recipes own state styling; mapping is documented below.'
---

# Fieldwork design direction

## Overview

Direction chosen by Tedy: **Industrial field notebook: charcoal, amber, dense operational screens.**

Reading this as an operations notebook for dispatch managers and field workers, in a practical industrial style. ENERGY 2 / RHYTHM 2 / MOTION 1.

- Charcoal surfaces reduce glare and give the notebook a consistent identity across web and native screens.
- Amber marks the primary action, urgent work, and review states so attention follows the operational task.
- Light text and clearly separated muted text keep dense records readable.
- Lists carry the workload: references, sites, people, dates, and status should be easy to scan.
- A wider dispatch layout supports comparison; the field layout stacks the same information for one-handed use.
- The weekly planner compares seven days in columns on desktop and uses daily ledger rows on phones. Its amber selection rule echoes the notebook's margin motif and identifies the active day.
- The monthly planner uses a Monday-first calendar grid to compare real daily workloads. On phones it becomes a chronological two-column ledger with complete day labels and 44px-plus targets. Charcoal cells and the existing amber selected-day rule connect it to the weekly notebook; the grid represents actual calendar dates rather than decoration. Arrow navigation follows the visible row width without changing the selection until activation. ENERGY 2 / RHYTHM 2 / MOTION 1 remains unchanged.
- Small corners and flat surfaces keep forms and records distinct. Shadows are reserved for the modal dialog.
- A narrow rule beside the active navigation item carries the notebook's margin motif. Status shapes communicate state rather than decoration.
- System fonts work offline. Monospace is limited to record references and code.
- Motion is limited to short interaction feedback and respects reduced-motion settings.
- Kokonut UI and its shared shadcn foundation are used across the web workspace. Buttons, fields, cards, notices, status badges, selection strips, the finder, and photo attachment share the existing charcoal/amber palette. Workload counts form a compact summary. Cards group the work board, catalog sections, and reports; small corners distinguish controls without adding pill shapes or broad shadows.
- The finder keeps visible shortcut keycaps. Selection strips show the active filter with the existing amber rule, and photo attachment names its local-draft destination. Demo charts, sample navigation/accounts, artificial progress, and motion effects are excluded from the product.
- Phosphor regular icons provide consistent action and state symbols on the web. Compact 16px icons inherit the text color, retain visible labels, and identify search, nested navigation, links, or progress rather than adding decoration.
- Clipboard, tray, and buildings identify work orders, the report outbox, and workspace resources. The upload glyph identifies photo attachment to a local draft. Labels remain visible; navigation glyphs are omitted at the narrowest phone width to keep the destinations readable.
- Rescheduling expands in the order tools alongside the inspection, with current metadata above both columns. The amber margin rule identifies the active edit; existing date inputs, buttons, and typography keep the operation part of the notebook rather than a separate calendar screen.
- Worker reassignment uses the same order tools group, with a native worker selector and a handover note explaining where reports and device drafts stay. Shared Kokonut controls keep the charcoal/amber palette, 44px targets, system type, and compact spacing; the amber rule marks the active edit without extra decoration or animation.
- Report history uses a shadcn dialog to compare saved submissions without leaving a correction draft. A compact version ledger sits beside the selected read-only report, then stacks above it on phones. Amber identifies the selected version; flat charcoal surfaces, checklist rows, and grouped metadata keep the report primary. Phosphor's counterclockwise clock identifies the real history action. No animation or new palette is introduced.
- Server search uses a separate shadcn dialog for current online records, alongside the cached-work finder. Shared fields group real search constraints above a compact result ledger. Narrow forms and result metadata stack; the header wraps so both search actions retain readable labels and 44px targets. Amber identifies the search action, while flat charcoal rows and existing status colors keep work records primary. ENERGY 2 / RHYTHM 2 / MOTION 1 remains unchanged.
- Recurring dispatch uses a secondary action beside ordinary assignment, with the same brief fields inside a shadcn dialog. A compact chronological ledger previews actual dates before creation. A saved uncertain batch replaces editable fields with a recovery notice and the original dates, making its retry scope clear. Shared controls, flat charcoal surfaces, system type, amber confirmation, and stacked phone fields retain ENERGY 2 / RHYTHM 2 / MOTION 1 without additional icons or animation.
- The recurring batch overview pairs a bounded schedule ledger with current occurrence details in a shadcn dialog. Original and current due dates are explicitly labeled to make independent rescheduling visible. The ledger stacks above the selected batch on phones; flat charcoal occurrence groups, amber selection, system type, and existing status badges retain ENERGY 2 / RHYTHM 2 / MOTION 1. No new illustration, icon, or animation is needed for this comparison.
- Site location groups saved coordinates, the named tile provider, and an explicit load action in a flat charcoal card. Map data retains the provider's geographic colors for legibility; Fieldwork's shared controls, amber site point/focus, system type, and grouped metadata keep the surrounding notebook identity. The map has no inertia or animation, does not capture scroll-wheel zoom, and offers labeled zoom/recenter/hide actions plus keyboard panning. Attribution stays visible on the map. Coordinate fields are optional and paired; ENERGY 2 / RHYTHM 2 / MOTION 1 remains unchanged.
- Existing-site coordinate editing stays inline beside the saved location so managers can compare loaded and proposed values. The amber edit rule repeats rescheduling/reassignment, while shared fields and wrapping actions retain compact charcoal forms. Errors lock saving until a fresh site read; proposed values remain visible. Updating the point closes any active catalog map so a new area needs a fresh load action. ENERGY 2 / RHYTHM 2 / MOTION 1 remains unchanged.

- Worker access uses the existing compact shadcn dialog and flat worker ledger. An inline confirmation makes the specific worker, session impact, and retained notebook visible before a change. Amber marks the confirmation and focus, while real Active/Disabled badges keep access legible without relying on color. Shared controls wrap on phones; system type, charcoal surfaces, and ENERGY 2 / RHYTHM 2 / MOTION 1 remain unchanged.
- Access history opens a selected worker's chronological ledger within the same dialog. The amber-framed section and focused worker heading identify the selected record; flat event rows separate the action, manager, and time. Explicit labels distinguish the historical enabled state from current account access. Shared controls wrap on phones, with no added palette, icons, or animation; ENERGY 2 / RHYTHM 2 / MOTION 1 stays unchanged.
- Password recovery reuses the selected-worker section and the notebook invitation/password layout. The one-time reset link is the manager's focal task; the worker sees account identity, session consequences, and labeled password confirmation before changing credentials. Shared fields, wrapped actions, flat charcoal surfaces, amber focus, and an amber copy/confirmation action retain ENERGY 2 / RHYTHM 2 / MOTION 1 without new icons or animation. Documentation masks link inputs and shows empty password fields.

Use explicit labels, 44px targets where practical on mobile, visible focus, semantic headings, and useful loading/error/empty states. Never fabricate customer logos, usage numbers, testimonials, or reports. Documentation screenshots use seeded demo data and say so.

Worker invitations use a compact shadcn dialog beside the existing worker directory. A flat ledger shows real recipients, expiry, and status; a newly created link becomes the focal task until copied or dismissed. The acceptance page reuses the notebook sign-in layout, with invited identity above password fields and explicit confirmation before normal sign-in. Shared controls, charcoal surfaces, amber confirmation, wrapped phone actions, and ENERGY 2 / RHYTHM 2 / MOTION 1 remain unchanged.

Weekday recurrence extends the existing dispatch selector and date ledger. The Mon–Fri label appears consistently in creation, saved-request recovery, and batch browsing. Plain guidance explains weekend starts and included holidays beside the preview. No new navigation, surface, color, or motion is needed; ENERGY 2 / RHYTHM 2 / MOTION 1 remains unchanged.

Photo evidence is a real checklist policy, chosen with the existing shared Native Select in setup and identified in the catalog/assignment options. Worker guidance stays beside the existing photo count and upload actions, with the same rule in Expo. Missing evidence uses the existing field-error treatment while the draft remains editable. No new surface, navigation, icon, palette, or motion is introduced; ENERGY 2 / RHYTHM 2 / MOTION 1 remains unchanged.

All web UI primitives come from Kokonut UI or shadcn. Shadcn's Radix dialogs own modal focus and dismissal, its radio groups own checklist selection and arrow-key navigation, and its labels, fields, Native Select, empty state, avatar fallback, and table components complete the foundation. Brand tokens, flat surfaces, compact spacing, readable report pagination, and labeled 44px answer targets remain the direction. Page layouts, record metadata, and screen composition remain semantic HTML built from these primitives. ENERGY 2 / RHYTHM 2 / MOTION 1 is unchanged.

## Colors

The 2026-10-23 redesign retains the user's charcoal and amber palette. `apps/web/src/tokens.css` is the canonical runtime owner (existing-runtime model); the frontmatter mirrors its accepted roles. `--ink`, `--surface`, `--surface-raised`, `--ui-foreground`, `--muted`, and `--amber` implement the six colors above. The sidebar and input are darker related neutrals. Amber is reserved for the primary commit, current selection and work needing attention, rather than every heading or count. Error and approved tones remain semantic exceptions with text labels.

## Typography

System body fonts stay readable without a download. Avenir Next gives headings the open, readable shapes of printed inspection sheets; it falls back to Segoe UI or sans-serif. Monospace remains confined to record references. The 15px body, 16px fields, 14px actions, 12px metadata and 28–34px page titles give records a clear hierarchy. The inspection title can reach 36px, and the public sign-in introduction 52px. Sentence-case headings identify the task without repeated category labels. Dense information does not require tiny labels.

## Layout

Keep the inspection ledger as the focal point. The signature is a notebook margin identifying the active destination or selected date, paired with plain, readable records. Workload counts form one quiet summary above a single work board. The board groups views, search, status, dates, records, and exports so controls stay connected to their results. A 216px desktop sidebar leaves room for work; page gutters scale from 18px to 36px. Phones preserve labeled navigation, stack record metadata, and allow the page to grow naturally.

Inspection questions use separate fieldsets because each requires an independent answer and optional note. Metadata leads the inspection; its content sits beside a narrower tools/location column on wide screens. Narrow screens stack these groups without hiding information. Resources place saved sites and checklists beside their respective forms; phones follow the same records-then-form reading order. Field workers use the same section header and action group. Empty and failed states explain the next available action.

PanelHeader and ActionGroup own section hierarchy and wrapping actions. DialogHeader and DialogContent own all eight modal families, with form, directory, comparison and finder widths. Each uses one title/description/action alignment, border, inset and scroll boundary. Feature stylesheets own only their internal content. The sign-in introduction explains the three real steps of work instead of using decorative notebook lines.

## Elevation & Depth

Flat surfaces distinguish records from editable fields. Shadows belong only to modal layers; no glow, decorative grid, gradient or floating-card treatment is added. The global scrollbar baseline inherits without an opt-in class and returns to platform colors in forced-colors mode.

## Shapes

Shared panels use a 10px radius, controls 6px, statuses 4px, and rule-separated list rows remain rectangular. This distinction keeps static metadata from looking like a button. Minimum 44px actions and explicit focus rings support touch and keyboard use.

## Components

| Runtime owner                                   | Adapter / consumers                                 | Rationale                                                                  |
| ----------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| tokens.css                                      | styles.css and workspace-ui.css                     | One runtime theme for page composition and shared primitives               |
| --font-body / --font-heading / --font-reference | body, headings, references                          | Separate reading, task hierarchy and identifiers without downloaded assets |
| --ui-radius / --ui-control-border / --ui-field  | shadcn Input, Native Select, Textarea, Button, Card | Consistent control geometry and visible boundaries                         |
| --space-page                                    | main and topbar                                     | A common alignment from desktop to phone                                   |
| --scroll-*                                      | Global standard scrollbar and engine fallback       | Visible navigation in every owned overflow region                          |
| --z-backdrop / --z-dialog                       | Radix overlays                                      | Predictable modal stacking above workspace content                         |
| PanelHeader / ActionGroup                       | Catalog sections and task actions                   | Shared heading rhythm and wrapping actions                                 |
| DialogHeader / DialogContent size               | All workspace dialogs                               | One modal frame with widths matched to the actual task                     |

Shared Form owns validation, Input owns password reveal, SearchField owns clear/focus, and Textarea owns bounded growth. Behavior is documented in [UX-CONTRACT.md](UX-CONTRACT.md). Existing Phosphor eyes and close glyphs identify reveal/clear actions; no new logo, avatar or illustration is needed. MOTION 1 means brief color feedback only, disabled under reduced motion.

## Do's and Don'ts

Use real seeded records in documentation and name them as synthetic. Keep every existing workflow available, preserve non-sensitive input after errors, and retain device drafts. Do not reduce information to unlabeled icons, add fabricated activity, rely on color alone, or add alternate screen-local themes.

## Expo worker notebook

The native worker app follows the same charcoal/amber roles through `apps/mobile/theme.ts`. Native components in `notebook-ui.tsx` own Button, Field, Copy, Panel, Notice, SectionHeading, StatusBadge and AnswerChoice. Web DOM components and CSS remain in the web app; the shared visual roles are implemented with React Native controls on iOS and Android.

- Color: the web ink, surface, raised surface, foreground, muted text, amber and field-boundary values repeat exactly so a worker recognizes the same notebook across devices. Approval/error colors remain semantic exceptions.
- Type: platform system text works offline and scales with accessibility settings. A 30px task title, 20px section heading, 16px body, 15px action/label and 13px caption keep the task readable; only record identifiers use platform monospace.
- Layout: assignments share one ruled ledger. An inspection leads with identity and site metadata, then brief, questions, summary, evidence and submission guidance. Reports use the same section hierarchy. The full notebook scrolls so a large header cannot trap content below the screen.
- Spacing: 20px screen/panel insets and 24px section gaps group related work. Actions are at least 48 points high. Panels use 10px corners, controls 6px and status labels 4px, matching the web hierarchy.
- Interaction: amber focus and selected-answer radio marks identify the current task. A focused Field offers Done editing beside its label; email advances to Password and the password key signs in. Large text stacks the header and answer choices without disabling font scaling. Android back returns from an inspection to assignments.
- Restraint: no new illustration, decorative icon, shadow, gradient, animation or navigation destination is added. ENERGY 2 / RHYTHM 2 / MOTION 1 remains unchanged. SecureStore, SQLite, drafts and outbox contracts retain their existing owners.
