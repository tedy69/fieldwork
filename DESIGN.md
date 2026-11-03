---
version: alpha
colors:
  canvas: '#f5f4ef'
  surface: '#ffffff'
  raised: '#eeefe9'
  foreground: '#202b23'
  muted: '#58635a'
  primary: '#915014'
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 15px
    lineHeight: 1.5
  heading:
    fontFamily: "'Avenir Next', 'Segoe UI', sans-serif"
    fontSize: 36px
    lineHeight: 1.2
  reference:
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace'
    fontSize: 12px
    lineHeight: 1.5
rounded:
  control: 8px
  panel: 14px
spacing:
  field: 8px
  section: 24px
  page: 48px
omitted:
  - section: components
    reason: 'Runtime component recipes and their platform adapters are mapped below.'
---

# Fieldwork design direction

## Direction

Tedy selected **Light field journal** on 2026-11-03 for the complete web and native rework. This supersedes the earlier charcoal workspace direction.

Reading this as a field-operations product for dispatchers and inspectors, with an editorial journal style. ENERGY 2 / RHYTHM 2 / MOTION 1.

Warm paper gives work a quiet background; white marks the record or form being used. Dark green-black text and muted olive secondary surfaces provide reading contrast without a second strong brand color. Burnt amber identifies a commitment, an active location, or work needing attention. Neutral zero counts stay quiet. Error red and approval green are semantic exceptions, always paired with text.

The identity comes from clear record references, notebook selection margins, editorial task headings and readable inspection sheets. It uses the existing Fieldwork name and system type; no new logo, photo, illustration, font download, gradient, glow or decorative background is needed. The Style UI directory informs component selection, while the product retains its existing Kokonut/shadcn foundation and native controls.

## Reading and layout

- One task title leads each screen. Record titles have more weight than dates and references. Sentence case keeps task labels readable.
- Spacing follows 4, 8, 12, 16, 24, 32 and 48. Page gutters scale with width; forms use a comfortable reading width instead of stretching across a monitor.
- Web sign-in, invitation acceptance and password recovery share `AuthLayout`. Desktop pairs a short product explanation with the actual account task. Phones show the account task first without the desktop introduction. Account guidance names invitation/reset links instead of inventing public registration or recovery endpoints. Demo credentials sit in an explicit disclosure.
- The dispatch ledger groups view selection, search, status, dates, records and exports. Real workload counts remain a quiet summary. A wrapping filter band connects constraints with the affected records. Expanded dates have their own row.
- Desktop navigation is a compact top bar beside the brand and account. Intermediate widths wrap destinations into their own header row; phones keep labeled bottom destinations. Content/footer spacing reserves navigation height and safe areas. Active selection has a meaningful amber rule.
- Phone work records label the worker and date because column headings are absent. Dates use semantic `time`; an explicit Overdue label supplements color and follows the existing device-local rule. Approved work remains neutral.
- Weekly and monthly planners represent real calendar dates and counts. Calendar grids are functional data, never background decoration. Phone calendars become readable day ledgers, with keyboard behavior matching the visible grid.
- Inspection metadata appears before the work. The brief, checklist and report form a reading column, with tools/location alongside on wide screens and after the inspection on phones. Real answered-check counts orient the worker without implying the report is submitted. Each question remains an independent labeled fieldset.
- Setup places saved sites and checklists before their creation forms in document order. Wide screens pair records with forms; tablet and phone layouts stack them. Worker invitations, access and history retain their actual account states and pending guards.
- Report history and recurring batches put the selection ledger beside the detail, then stack at narrow widths. Primary content gets the space; temporary tools have a bounded modal or inline form.

## Components

Web tokens in `apps/web/src/tokens.css` own color, spacing, radii, type and layer roles. `styles.css` owns page composition and domain layouts; `workspace-ui.css` owns shared primitive recipes. Feature CSS owns only its internal geometry and uses these tokens. Hard-coded screen colors do not create a second theme. The map keeps geographic imagery and its existing provider attribution; print keeps a separate ink-on-paper output.

| Component owner                         | Purpose and design treatment                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| AuthLayout                              | Shared brand header, restrained introduction, bounded account form and plain footer                               |
| PageHeading / PanelHeader / ActionGroup | Task hierarchy, section description and wrapping actions                                                          |
| Button                                  | Solid amber for committing work, bordered secondary actions, quiet supporting navigation; at least 44px           |
| Input / Textarea / Label / Form         | Visible labels, pale editable surfaces, clear boundaries, retained values, inline recovery and focused validation |
| SearchField                             | Immediate local clear with focus returned to the input                                                            |
| NativeSelect                            | Actual OS selection, with a visible label and consistent field boundary                                           |
| Card                                    | White record/form surface, 14px corners, no floating-card shadow                                                  |
| Alert / Empty / FieldError              | Specific state, cause and recovery; failures remain visible and never become successful empty data                |
| Badge                                   | Real state only, restrained semantic tint and text; 4–5px corners distinguish it from an action                   |
| SmoothTab                               | Existing view and status choices, meaningful selected treatment, arrow/Home/End keyboard behavior                 |
| Dialog / DialogHeader                   | One modal geometry, 16px minimum inset, readable title/action separation and contained scrolling                  |
| DatePicker / Calendar / Popover         | Editable date-only input with a bounded calendar, 44px day targets, focus restoration and no UTC conversion       |
| RadioGroup                              | Labeled inspection answers with a visible selected control and full-row target                                    |
| Table                                   | Readable report comparisons, wrapping cells and print pagination                                                  |
| WorkFinder                              | Local saved-work matching, visible shortcut, real destinations and no artificial delay                            |
| Photo attachment                        | Local draft ownership, native/file selection, real limits and retained evidence                                   |

Control corners are 8px, panels 14px and statuses 4–5px. List rows remain rectangular. Shadows are reserved for temporary dialogs and date popovers, where elevation explains the interaction layer. Motion is limited to short color feedback and is disabled under reduced-motion settings.

Phosphor icons use regular weight, 20px web utility glyphs and 22-point native glyphs. Familiar utility actions use compact icon buttons: search, server lookup, sync, sign-out, back, planner arrows, print, history and photo removal. Web actions have an accessible name and a tooltip on hover or keyboard focus; native actions retain an accessibility label and show their name on touch and hold. Hit areas remain 44px on web and 48 points on native. Calendar-plus identifies recurring dispatch; a stack identifies saved batches. Each opens a labeled form or ledger before a write.

Navigation keeps short visible labels, as do assignment, submission, review and photo-source actions. List/Week/Month views pair icons with concise text. State and error messages keep words: a glyph or color cannot replace an offline warning, queued state, permission explanation or submission outcome. Repeated introductory copy is removed where the task title and controls already explain the screen. Native uses the same Phosphor family through bundled SVG paths, so icons do not depend on a network font download.

## Native field journal

`apps/mobile/theme.ts` mirrors the web roles; `notebook-ui.tsx` owns scalable Copy, Brand, Button, Field, Panel, SectionHeading, Notice, StatusBadge and AnswerChoice. Existing React Native controls remain platform controls rather than embedding web components.

`workspace-page.tsx` owns a virtualized assignment list and a real outbox page. Search matches cached references, titles and sites immediately. Assignment/outbox selection and search remain in the notebook controller while an inspection is open. The outbox displays only actual queued reports and their confirmation/conflict state. Rows open their saved assignment; unavailable assignments explain why that action is disabled. No unsent work is moved to a different account or device.

Native screens use the same warm canvas and white records, with 48-point actions, 16-point body text and 30-point task headings. Android retains its back behavior and native keyboard. Both platforms retain safe areas, font scaling, password reveal, return-key behavior, Done editing and keyboard avoidance. Large text wraps actions and answer choices instead of clipping. The inspection scrolls naturally; a fixed control never covers the final field.

## State and evidence

Loading, empty, filtered-empty, stale, failed, offline, queued and blocked states remain distinct. A new palette does not alter contracts, permission checks, account creation, acknowledgments, draft persistence or mutation IDs. The application still has one workspace per server.

Validation covers desktop, tablet, narrow/short phones, keyboard operation, reduced motion, long text, forms, failure recovery and offline reload. Native execution, JavaScript export and physical-device acceptance are reported separately. Screenshots use synthetic fixtures and are identified as demo data. No customer logos, statistics, testimonials, security claims or unmeasured performance scores are invented.
