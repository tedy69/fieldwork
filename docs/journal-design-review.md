# Light field journal review

2026-11-03. Scope: shared web UI, account entry/recovery, authenticated workspace and native worker notebook. Direction selected by the owner: Light field journal. ENERGY 2 / RHYTHM 2 / MOTION 1. The inspection sheet, record references and selection margin give the product its identity. Amber identifies actions and selection; white sheets separate records from the warm paper canvas.

## Evidence

The Expo assignment filter uses the Phosphor funnel beside the search field. It reveals labeled status choices, with amber marking the selection and a small count beneath the controls. The assignment ledger remains the main content. Expo Go on iOS verified the filter and empty state with the API unavailable, a retained search after opening an inspection, and localized labels. At the largest Dynamic Type setting, long status labels wrap and the controls remain reachable by scrolling.

Expo report history uses the same Phosphor clock as the web action. A separate native screen keeps revision reading away from draft editing. The current and historical reports share the same report layout. The iOS fixture checks the modal safe area and back action, reads two saved versions with their original feedback, retries an older page after an API outage, and returns to the original draft.

A small map pin marks saved site coordinates beneath the address in Expo. The iOS fixture reads the original zero latitude and negative longitude during an outage in both languages, then opens an older assignment without coordinates.

The Expo sync notice pairs a sign-in icon with a short recovery action. It keeps cached assignments visible and brings the current server and account into the sign-in form. An iOS test exercised a revoked session, an intact queued report after restarting, and a single saved revision after sign-in.

The sign-in language switch pairs a globe with the destination language in the existing journal layout. Chromium covers keyboard switching, 320px and desktop layouts, translated validation, and an offline reload. On iOS, the same choice survives restart and translates the server and password controls.

Invitation and password-reset pages share the same globe control and language preference. Chromium verifies keyboard switching, 390px and desktop layouts, preserved password entries, offline feedback, completion, and opening a used link.

The web worker list and outbox use a globe in the top bar and share the sign-in preference. Chromium verifies keyboard switching with an active search and status filter, 320px and desktop layouts, date validation, an offline draft export, reload, and reconnect.

The web worker inspection follows the same language choice. Chromium verifies that switching keeps the active draft, invalid readings and missing photos explain how to recover, and a zero reading plus its required photo survive offline reload and sync.

Report history and the printable report use the worker's language while preserving the saved answers and manager feedback. Chromium verifies keyboard focus, loaded history during an outage, and an offline print containing the latest saved revision.

The week and month planners follow the worker's language for dates, counts, and navigation. Chromium verifies day selection by keyboard, an active search, 320px and desktop layouts, and offline navigation across a year boundary.

Site maps use named zoom and recenter icons and show opt-in and recovery guidance in the worker's language. Chromium verifies the disclosure before any tile request, retry after a tile error, keyboard zoom, and offline coordinates.

The saved work finder pairs destination icons with readable names and uses the worker’s language for controls and feedback. Chromium exercises it offline at 320 pixels, including keyboard access, clearing the query, and opening cached assignments and the outbox.

Server search has a distinct database icon so it can be distinguished from the language globe. Chromium verifies Indonesian filter validation, retry, result dates, worker permissions, and the loaded result state during an outage at 320 pixels.

Rescheduling from a recurring batch uses the same calendar icon and date field as an order. Planned and current dates remain side by side on desktop and stack on narrow screens. Chromium verifies keyboard entry and Escape, focus after saving, conflict recovery with the proposed date intact, offline controls, and 320px reflow.

The recurring batch detail keeps a labeled visit filter beside the named refresh icon. The ledger remains the focus, with counts shown when a filter is active. Chromium verifies the 320px layout, offline filtering, keyboard refresh, and focus returning to the filter when a rescheduled visit leaves the view.

The visit filter keeps its own row on narrow screens, with named refresh and download icons below. Chromium checks keyboard download at 320 pixels, error recovery, and a CSV containing only the filtered visits with both due dates.

Quarterly recurrence adds one choice to Repeat and uses the existing date preview and recovery panel. Chromium verifies keyboard entry, shorter-month dates, a 320px layout, and recovery of a saved request after the response is lost.

The recurring form groups repeat, end rule, and count or date. The existing named calendar icon identifies the date picker. Chromium checks keyboard focus and narrow reflow, validates the inclusive preview with skips, and confirms that retry uses the original schedule.

Per-item photo evidence: the attachment action sits by the required question and uses the existing photo icon, outline button and draft panel. Text names the required and attached states. Captions in drafts and saved reports identify the linked questions. The scoped web gate passes at 320px and 1440px with keyboard setup and upload, removal, offline reload, missing evidence feedback and reconnect. The existing site-photo flow stays available for general evidence.

Two-week recurrence uses one option in the existing Repeat selector. Preview and recovery keep the schedule alongside the selected dates and use the existing light journal controls. The scoped web gate passes at 390px with keyboard entry, skipped dates, failed-save recovery, offline reload and batch browsing. The daily comparison runs at 390px and 1440px.

Site closure dates use the existing site catalog form and Skip dates disclosure. Managers see the saved dates while reviewing a competing edit, and copied dates join the normal removable batch list. The scoped gate passes with keyboard editing and copying, 320px and desktop layouts, invalid date feedback, offline edit recovery, and real batch creation.

Numeric units and limits (2026-11-05): the reading remains the focal point. The unit sits beside the question and a short range hint becomes specific recovery text when the reading is invalid. The manager's unit and limit fields sit inside the numeric item, preserving the existing reading order and light-journal accent. The scoped R-01 through R-40, craft, UI and mobile checks remain PASS: Chromium covers 320/390/1440px, invalid bounds and focus, type changes, row removal, offline draft recovery and actual reports. Android covers the labeled field, range feedback, disabled submission, restart, outage, correction and the saved report. No new navigation, media, animation or theme was introduced.

Mixed checklist editor (2026-11-05): the item sequence is the focal point. Numbered fieldsets and spacing separate questions in the existing journal form. Plus adds a row and the named Trash action removes it; both return focus to a useful question. Existing light-journal colors, focus rings and control sizes carry through, with no new theme, motion or assets. The scoped R-01 through R-40, craft, UI and mobile checks remain PASS: the recorded browser workflow covers keyboard conversion and removal, adding a row, required-field recovery, failed offline save, real creation and the worker's offline reload. Layout checks include 320, 390 and 1440px.

Numeric-field follow-up: the scoped R-01 through R-40, craft, UI and mobile findings below remain PASS for the additional response option and existing labeled Input/Field controls. Zero contributes to real completion counts; partial input remains editable and has specific inline guidance. No new icon, asset, theme, motion or surface is introduced. Keyboard and narrow/desktop workflows verify the selector, invalid input, partial offline reload, conflict recovery and saved numeric output. Android execution verifies partial and queued restart persistence, negative/zero readings, outage handling and exactly-once sync; the saved native report was visually inspected. Standard numeric precision and unrun iOS runtime are stated in the feature and verification docs.

Text-field follow-up: the scoped R-01 through R-40, craft, UI and mobile findings below remain PASS for the existing response selector and labeled web/Expo fields. No new layout, icon, palette, asset or motion is introduced. Progress counts completed responses from real draft state. Whitespace-only submission shows a specific error; saved text retains its accessible name after reload. Keyboard and 320/390/1440px browser checks exercise creation, offline text/photo recovery, export, saved history and print output. Android execution verifies editing, app restart, an unavailable server, queued persistence and exactly-once acknowledgement. The API 35 native report was visually inspected; iOS execution remains outside this evidence.

Skipped-date follow-up: the existing per-rule report also covers the recurring form's optional native disclosure, shared date picker and named Plus/Trash actions. The disclosure keeps the primary form brief; exclusions use real dates and the existing spacing/type/tokens. Calendar Escape leaves the parent dialog open, removing a date restores input focus, and an unadded/duplicate/first-date choice blocks assignment with visible guidance. Phone/desktop cases verify real previews, declined-request editing, lost-response recovery, offline reload and the saved batch list. No new asset, navigation, native screen or motion is introduced. The full R-01 through R-40, craft and supplement findings below remain PASS within this scope, backed by these recorded controls and the baseline workflow suite.

Monthly recurrence follow-up: the per-rule PASS findings below remain applicable within the existing assignment dialog and batch viewer. Monthly adds one labeled selector option, a short original-day explanation and real dates in the shared preview; its recovered request uses the same controls. No new layout, surface, icon, motion, media asset or native UI is introduced. Calendar/SDK/API tests cover the rule and persistence; phone/desktop browser workflows cover keyboard entry, invalid schedules, lost responses, offline recovery and planned/current dates. This is the scoped R-01 through R-40, liveliness/craftsmanship and UI/mobile supplement review for the addition.

Local draft export follow-up: the existing per-rule review below also applies to this small web addition. A regular Phosphor download glyph and visible “Export draft” label use the existing quiet button and report-export layout. Private-file guidance sits beside the action. Real downloads, keyboard activation, incomplete answers, photo bytes, offline pending/blocked reports, failed-download recovery and unchanged local data are covered at 390 and 1440px. No new surface, navigation, motion, media asset, theme or native UI is introduced. Source edits use direct patches. This preserves the PASS outcomes for R-01 through R-40, liveliness/craftsmanship and both supplements within this scope; native runtime evidence below belongs to the prior UI changes.

`npm run check` passes formatting, strict web/mobile types, 517 unit/API tests and the production web build. All 107 Chromium workflows pass, including text/numeric checklist fields, skipped dates, local draft export, monthly recurrence, invitation acceptance and password recovery, permissions, offline drafts/photos, retries/conflicts, review, planners, catalog management and account access. Expo dependency compatibility and iOS/Android Hermes exports succeed. Native execution for text/numeric fields is recorded above and in verification; earlier UI evidence remains scoped below.

Follow-up click-through: Export draft prepares an offline JSON download with photo bytes; an injected download failure displays a retry message and leaves the blocked queue intact after reload. Repeat → Monthly previews Jan 31, Feb 28, Mar 31 and Apr 30; a year-overflow schedule disables assignment. Assign 4 work orders creates four real records even when its response is lost. Retry saved batch stays disabled offline, then confirms the same mutation after reconnect. Recurring batches opens the saved ledger; selecting the monthly batch compares planned and independently rescheduled dates. Open order fetches and displays the current assignment. These cases pass by keyboard and at 390/1440px, without uncaught page errors in the monthly flow.

The icon refinement reduces repeated toolbar labels and introductory copy. A dedicated workflow verifies accessible names, actual SVG glyphs, 44px targets, keyboard tooltips, Escape, dialogs and return focus at 320, 390, 768 and 1440px. Pending-batch recovery keeps a visible label on the same DOM button, so lost-response recovery restores focus. Native uses twelve licensed Phosphor paths with a bundled SVG renderer. Navigation, photo-source actions, submission, reviews, warnings and state messages retain text.

The journal browser checks exercise 320, 390, 768, 1024 and 1440px widths, OS dark preference, one sign-in heading, keyboard disclosure, destination navigation, finder focus restoration and offline checklist progress. The existing responsive suite additionally exercises intermediate widths, bottom navigation clearance and modal/form recovery. Documentation captures come from the actual synthetic fixture walkthrough.

Android native execution and its platform limits are recorded in [verification](verification.md). This report does not certify iOS execution, physical cameras, full screen-reader traversal or app-store readiness. No performance score is claimed.

## Antislop Delivery Gate

### Hard gate

- R-02 PASS: source search finds no em dash in web/native application TypeScript copy.
- R-03 PASS: browser workflows verify narrow through desktop layouts without document overflow; native uses scrollable, wrapping controls.
- R-17 PASS: counts and inspection progress derive from saved assignments, queued reports and actual answers.
- R-18 PASS: no testimonial or profile image was introduced.
- R-23 PASS: the owner requested all components/pages and mobile redesign; existing destinations were rearranged, and synthetic screenshots document the implementation. No artwork or logo was created.
- R-24 PASS: navigation opens real Work orders, Sync outbox and manager Resources; native destinations render actual assignments and queued reports.
- R-25 PASS: calculated text contrast across canvas, sheet, raised and selected surfaces is at least 5.40:1; field boundaries are 3.08:1 against fields.
- R-26 PASS: the 107 browser workflows exercise real forms, filters, dialogs and record operations, including the recorded text/numeric/skipped-date/export/monthly click-through above; native browsing exercises actual search and inspection editing.
- R-27 PASS: loading, empty search/outbox, failed sign-in, offline, invalid-field and conflict states retain actionable guidance.
- R-28 PASS: no FAQ was introduced.
- R-32 PASS: disclosure, finder, filters, calendar, dialogs, focus restoration and form errors retain keyboard coverage and visible focus. Icon tooltips appear on focus and dismiss on Escape.
- R-33 PASS: source changes use direct patches; no external source-rewriting script was used.
- R-34 PASS: the selected light theme remains legible under OS dark preference; there is no theme toggle.
- R-35 PASS: production build, browser interaction suite and native Android flows run against synthetic records; their results and limits are recorded separately.
- R-36 PASS: no invented customer, performance, security or compliance claim was introduced.
- R-37 PASS: the owner selected Light field journal before implementation; DESIGN.md records the Design Read and dials.
- R-38 PASS: demo fixtures remain explicitly synthetic; no product capabilities or people were invented for the design.
- R-39 PASS: shared native/web controls retain labels, roles, selected/checked/disabled states and focus treatment. Glyphs are decorative within named buttons; navigation and consequential actions retain text. Native scalable text remains enabled; no new animation or zoom restriction was added.
- R-40 PASS: existing report media retain bounded dimensions; no new runtime media download, blocking script or unmeasured performance score was introduced.

### Purpose gate

- R-01 PASS: flat semantic surfaces establish the reading order; no gradient or glow was added.
- R-04 PASS: regular Phosphor utility glyphs identify real actions. Plus adds a selected skipped date; named Trash removes one, and Download prepares a private local file. Names, hints and the written icon map in DESIGN.md establish their meaning.
- R-06 PASS: offline system type supports field use; monospace is limited to record references, as documented in DESIGN.md.
- R-07 PASS: the notebook motif uses selection margins and rules rather than a decorative background pattern.
- R-08 PASS: action labels use plain verbs without ornamental arrows.
- R-09 PASS: status tints reflect actual domain states, without promotional badges.
- R-10 PASS: no glass effects were added.
- R-12 PASS: shadow is limited to existing popup/dialog elevation; sheets and records stay flat.
- R-13 PASS: no glow was introduced.
- R-14 PASS: real work rows, metadata sheets and checklist groups follow their content roles rather than repeated marketing cards.
- R-19 PASS: native scrolling and existing interaction feedback fit MOTION 1; no looping or scroll animation was introduced.
- R-22 PASS: no illustration was introduced.

### Liveliness

- Dials PASS: DESIGN.md explicitly sets ENERGY 2 / RHYTHM 2 / MOTION 1.
- Consistency PASS: editorial task headings, quiet metadata and ruled records provide balanced emphasis without decorative motion.
- Focal point PASS: the sign-in form, work ledger or current inspection is the primary task on each screen.
- Whitespace PASS: shared 24-point section rhythm and responsive gutters separate task controls, records and evidence.
- Accent PASS: restrained amber identifies primary actions, current selection and attention.
- Identity PASS: warm paper, white inspection sheets, record references and notebook margins recur across web and native.
- Design Read PASS: direction and audience were declared before implementation.

### Craftsmanship and quality locks

- C-1 PASS: DESIGN.md gives concrete purposes for palette, type, sheets, top navigation, phone navigation and native list/outbox.
- C-2 PASS: affected controls have real handlers, with recorded browser and native interaction outcomes.
- C-3 PASS: sections represent actual sign-in, assignment, inspection, sync and management tasks.
- C-4 PASS: error/offline/empty states, keyboard workflows and responsive widths pass; platform execution limits are explicit.
- C-5 PASS: displayed counts, answers and statuses come from application state; screenshots use synthetic fixtures.
- R-05 PASS: composition follows an operations journal rather than a generic landing-page template.
- R-11 PASS: 8px controls, 14px panels and quieter status shapes establish a consistent radius hierarchy.
- R-15 PASS: actions describe outcomes, including Open notebook, Assign work order, Choose photo and Save and sync inspection.
- R-16 PASS: no generic AI marketing language was added.
- R-20 PASS: inspection sheets, references and selection margins remain distinctive when the product name is removed.
- R-21 PASS: the light theme follows the owner's explicit selection.
- R-29 PASS: neutral paper/ink roles and one amber accent are shared; error and approved colors encode domain state.
- R-30 PASS: the reference directory informed existing component choices; no reference-site layout was copied.
- R-31 PASS: each major visual choice has a written task or readability purpose in DESIGN.md.

### Mobile layout supplement

- Reflow PASS: phone uses labeled bottom navigation and stacked forms; native uses its own list and inspection composition.
- Intermediate widths PASS: tablet navigation and resource-form stacking bridge phone and desktop; browser tests include 768 and 1024px.
- Scale PASS: headings and gutters reduce at narrow widths; native text scales with system settings.
- Stacking PASS: metadata, management forms and answer choices wrap instead of retaining cramped columns.
- Overflow PASS: responsive browser assertions find no document overflow; native remains vertically scrollable.
- Targets PASS: primary web phone controls retain 44px targets; native actions are at least 48 points with spacing.
- Touch PASS: essential actions use click/tap controls; hover feedback has active and focus equivalents.
- Navigation PASS: actual destinations remain labeled on phones, including native Assignments and Outbox.
- Safe areas PASS: web reserves bottom-bar space and native uses SafeAreaView; final form actions remain scrollable.
- Verification PASS: narrow browser workflows and actual Android execution supplement source review and platform exports.

### UI supplement

- Palette PASS: DESIGN.md and shared web/native tokens define the selected light journal.
- Accent PASS: amber marks committing actions and selection; secondary text stays neutral.
- Copy PASS: no decorative emoji were introduced.
- Rhythm PASS: account forms, work ledgers and inspection sheets follow different task compositions.
- Layout PASS: there is no bento mosaic, fake terminal, pricing template or decorative stripe.
- Heading PASS: no promotional pill repeats the task title.
- Function PASS: actual destinations and recorded form/filter/picker outcomes back the controls.
- Motion PASS: MOTION 1 retains brief interaction feedback without loops.
- Effects PASS: flat sheets, restrained popup shadows and varied radii serve hierarchy.
- Status PASS: tints identify actual selected, queued, error or approved state.
- App composition PASS: the ledger or inspection is primary; navigation and metadata defer to the current task.
- Data PASS: saved records and answers drive every count and progress label.
- Fields PASS: fields retain labels and honest examples; demo credentials are explicitly disclosed.
- Recovery PASS: failed sign-in, invalid forms, empty search, queued reports and offline work provide specific next actions.
- Resilience PASS: browser keyboard and width coverage supplement native Android execution.
- Media/performance PASS: existing photo dimensions remain bounded; no blocking script or unmeasured performance claim was added.
