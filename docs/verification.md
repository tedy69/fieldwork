# Verification

Recorded on 22 October 2026 for the initial 0.1 foundation. Release acceptance is kept separate from implemented features.

[The first GitHub CI run passed](https://github.com/tedy69/fieldwork/actions/runs/39742878468): clean Linux installation, all checks, three Chromium workflows, and both native JavaScript exports.

| Check                 | Evidence                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clean install         | `npm ci` passed on macOS; Docker installed the same lockfile on Linux.                                                                                                                                 |
| Formatting and types  | `npm run check` includes Prettier, strict TypeScript, and the mobile workspace.                                                                                                                        |
| Unit and API behavior | 21 tests cover roles, session expiry, origin checks, report validation, photos, duplicate retries, conflicts, persistence, outbox recovery, and stalled requests.                                      |
| Production web build  | Vite and the service-worker precache build successfully.                                                                                                                                               |
| Browser workflows     | Playwright exercises offline reload with a photo, durable drafts, reconnection, manager approval, sites/checklists, assignment, search, empty states, change requests, and sign-out.                   |
| Responsive layout     | Browser checks at 390px and desktop; narrow-screen overflow assertion and inspected screenshots in `docs/images`.                                                                                      |
| Keyboard and labels   | Tests use accessible form labels and radio groups. The assignment dialog handles Escape; focus styles and a skip link are present.                                                                     |
| Native JavaScript     | Expo exports iOS and Android Hermes bundles. Expo Go on an iPhone simulator opened the app, signed in, and loaded the three demo assignments.                                                          |
| Docker runtime        | Built the image, seeded an isolated volume, loaded the web app, signed in, submitted an inspection, restarted the container, and verified the record persisted. Expo is absent from the runtime image. |

Run the checks yourself:

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm exec -w @fieldwork/mobile -- expo export --platform all --output-dir dist
docker build -t fieldwork:local .
```

## Still needed before a native release

The simulator smoke test is not full native acceptance. Real-camera permissions, library photos, offline app restart, session recovery with a pending native report, Android runtime behavior, large text, and screen-reader testing remain on the [mobile checklist](mobile.md). No store binary, public deployment, load test, penetration test, or compliance assessment has been completed.

The development dependency tree has known upstream Expo/Metro advisories for `braces` and `node-forge`; see [SECURITY.md](../SECURITY.md). A passing build does not clear those advisories.

## UI delivery gate

Scope: the web inspection workflow and its responsive layout. The native companion has the separate acceptance gates above.

- Hard gate PASS: no fabricated customer claims or testimonials; demo fixtures and screenshots are labeled synthetic. Navigation opens implemented screens. Forms create records; reports sync and reach review. Offline, loading, empty, and error states are implemented. The browser workflow records no uncaught page errors.
- Contrast PASS: calculated text/surface ratios include primary text 14.99:1, muted text 7.77:1, placeholders 7.71:1, and the dimmest secondary text 5.16:1. Amber primary actions have 10.73:1 contrast.
- Purpose gate PASS: the flat charcoal palette, amber task emphasis, record references, compact rows, margin rule, system fonts, and dialog elevation have written reasons in [DESIGN.md](../DESIGN.md). There are no stock illustrations, decorative gradients, glass panels, or template animations.
- Liveliness PASS: the user chose an industrial field notebook. ENERGY 2 / RHYTHM 2 / MOTION 1 is recorded in DESIGN.md. Work orders, inspection, and review each have a primary task; spacing separates instructions, findings, and decisions.
- Craftsmanship PASS: desktop and narrow layouts use the same records with different density; explicit checklist choices prevent accidental all-pass reports. Controls name the action, and report data remains visible through offline, queued, submitted, and reviewed states.

This gate documents the evidence above; it is not a complete accessibility certification or a claim that every device configuration has been tested.

## Overdue filter

The web filter uses the device's local calendar date. Orders due today or later and approved orders are excluded. A midnight timer updates open notebooks; focus and visibility changes recalculate the date after a device resumes.

Three additional browser tests cover managers and workers, yesterday/today/tomorrow, all four workflow states, Jakarta and Los Angeles time zones, midnight rollover, search, offline reload, and empty results. The original three browser workflows also pass. A deliberate off-by-one change that included today's work made the new test fail; restoring the strict date comparison returned the suite to green.

- Hard gate PASS: the Overdue button filters actual cached records and exposes its selected state with `aria-pressed`. Enter and Space operate it. Tests assert no horizontal overflow at 390px and no uncaught page errors; desktop and narrow screenshots were inspected.
- Purpose gate PASS: the filter reuses the existing status controls, palette, focus treatment, and typography from DESIGN.md. No new decorative elements or assets were added.
- Liveliness PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 remains appropriate for the chosen industrial notebook. The work list stays the focal point, with the filter beside search.
- Craftsmanship PASS: the filter works offline and across midnight. Separate empty states explain an empty overdue list and a search with no matches. Text contrast is 10.76:1 on the selected control and 8.60:1 on the normal surface; the existing focus accent is 10.73:1.

## CSV report exports

The manager's current filtered list exports the latest saved report snapshots. The suite now passes 35 unit/API tests and eight browser workflows. CSV tests cover quoted and multiline Unicode text, CRLF records, formula-like text, omitted drafts and attachment data, and unchanged source records. Removing the formula-text prefix deliberately made all 12 formula cases fail; restoring it returned the checks to green.

- Hard gate PASS: real downloads work online and after an offline reload. Enter and Space activate the control, zero reports disables it, and workers do not see it. Browser tests assert no horizontal overflow at 390px and no uncaught page errors. The [desktop](images/report-export-desktop.png) and [narrow](images/report-export-mobile.png) screenshots were inspected; all records shown are synthetic test fixtures.
- Purpose gate PASS: the export uses the existing quiet button, focus treatment, typography, and charcoal palette. Its position beside the filtered list explains what will be downloaded without adding another navigation screen.
- Liveliness PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 is retained. The work list remains primary; the export is a secondary action with a report count and a short scope note.
- Craftsmanship PASS: search and status filters constrain the downloaded rows. The UTF-8 byte-order mark, review details, and photo counts are checked in actual browser downloads. An induced download error shows a retry instruction. The export reuses the existing high-contrast text and amber focus styles.

These checks used Chrome on macOS. Spreadsheet formula handling follows the documented mitigation in [Report CSV exports](report-export.md); no Excel or other spreadsheet application acceptance test was performed. The existing native release and accessibility gaps above remain separate.

## Due-date ranges

The web list now accepts inclusive and open-ended due-date ranges. Date-only comparisons avoid shifting a due date across time zones. Eleven unit cases cover the bounds, reversed ranges, a year boundary, and leap day. Two additional browser workflows exercise managers in Los Angeles and workers in Jakarta, bringing the suite to 46 unit/API tests and ten browser workflows. Deliberately excluding the start date made three boundary tests fail; restoring the inclusive comparison returned the checks to green.

- Hard gate PASS: labeled native date inputs filter saved records, and Clear dates works by keyboard. Reversed ranges mark both inputs invalid and explain the correction. Valid empty ranges have a separate empty state. Tests assert no uncaught page errors or horizontal overflow at 390px and 320px; desktop and narrow screenshots were inspected using synthetic test records.
- Purpose gate PASS: the controls reuse the notebook's date inputs, quiet button, charcoal surfaces, and amber focus treatment. Grouping them directly below search and status makes their combined scope visible. No decorative assets, effects, or animation were introduced.
- Liveliness PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 is retained. The work list remains primary, and the date controls form a compact planning group within its existing toolbar area.
- Craftsmanship PASS: browser tests cover inclusive start/end dates, equal dates, either open bound, status and Overdue intersections, search, manager CSV rows, and offline reload. Opening an order and returning preserves the range; Clear dates preserves search and status. Existing high-contrast labels, input text, help text, and focus styles are reused.

Screenshots: [desktop](images/due-range-desktop.png), [390px](images/due-range-mobile.png), and [320px](images/due-range-small.png). These checks used Chrome on macOS. Calendar scheduling and native date-range controls remain roadmap work; the native release and accessibility gaps above are unchanged.

## Printable reports

Three additional browser workflows bring the suite to 13, alongside the 46 unit/API tests. They cover manager and worker reports, approved/pending/changes-requested review states, offline reload, keyboard activation, retry after a print error, and cleanup after leaving the report or signing out. Tests distinguish the printable submitted snapshot from an unsent correction. Deliberately substituting the draft summary made that regression test fail; restoring the saved report returned the checks to green.

Chrome generated a one-page A4 PDF from the short fixture and a 19-page PDF from 50 items with long notes. Local PDF text extraction found the Unicode summary, review, and final checklist item. The first short-report page and a continuation page were rendered and inspected. Screenshots show synthetic test data: [paper layout](images/print-report-paper.png) and [desktop action](images/print-report-desktop.png).

- Hard gate PASS: Print report calls the browser's print action by mouse, Enter, and Space. It appears only when a saved submitted report exists. Tests confirm no horizontal overflow at 390px, no uncaught page errors, a useful print-error message, and an ordinary visible workspace after leaving the report. Printed content contains no form controls, unsent corrections, photo files, or unrelated records.
- Purpose gate PASS: the screen action reuses the notebook's quiet button, typography, charcoal surface, and amber focus ring. Paper uses black text on white to remain readable without color printing; metadata, results, and review have separate sections for operational use.
- Liveliness PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 is retained on screen. The report stays primary; print is a secondary action. The paper hierarchy uses the report title, grouped metadata, and a checklist table rather than application navigation.
- Craftsmanship PASS: the print stylesheet hides application chrome only while a selected report exists. A4 margins, wrapping, preserved line breaks, repeated table headings, and pagination are checked in generated PDFs. Canceling printing does not report success or change workflow state. The screen control retains existing contrast; print text is black on white.

Automated checks used Chrome/Chromium print media and PDF generation. The print-button call is observed with a test spy; operating-system print dialogs, physical printers, and mobile print sheets were not automated. Native release and full accessibility acceptance remain separate.

## Weekly planner

The suite now has 57 unit/API tests and 16 browser workflows. Eleven new calendar cases cover Monday/Sunday boundaries, a year boundary, leap day, and daylight-saving dates. Deliberately switching the week start to Sunday made seven boundary cases fail; restoring Monday returned the checks to green.

Browser coverage uses managers in Los Angeles and workers in Jakarta. It checks search/status counts, Overdue intersections, week/day CSV rows, day selection, previous/next/current week, empty days/weeks, preserved list ranges, and offline reload. A manager creates a real assignment with the selected due date; a simulated failed request retains the date and title for retry. The ordinary form defaults to the local date when UTC is already the following day.

- Hard gate PASS: native buttons expose selected/current states and work with Enter and Space. Creation is unavailable to workers and disabled offline. Empty-day/week messages explain the next action, and failed creation shows an error. Browser tests assert no horizontal overflow at 390px or 320px and no uncaught page errors. The [desktop](images/week-planner-desktop.png) and [narrow](images/week-planner-mobile.png) screenshots were inspected; records and counts are synthetic test data.
- Purpose gate PASS: DESIGN.md records the seven-column desktop comparison, daily ledger rows on phones, and amber selection rule. Existing typography, charcoal surfaces, quiet controls, and focus treatment are reused; all workload counts come from the filtered saved records.
- Liveliness PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 remains appropriate. The selected day's work list stays primary; the week strip provides its planning context without animation or decorative assets.
- Craftsmanship PASS: navigating weeks clears the selected day, Whole week restores seven days, and returning from an order preserves the selection. The viewed week stays anchored over a local week boundary until This week is chosen. Text contrast is 5.41:1 for secondary text on a selected day, 9.44:1 for its primary text, and 6.76:1 for the Today accent. New planner controls have at least 44px targets; daily phone rows are at least 48px high.

Local checks used Chrome on macOS; CI runs the same workflows in Chromium. Rescheduling existing orders, recurring work, native calendar controls, physical-device acceptance, and full accessibility acceptance remain separate.

## Kokonut UI work finder

The first Kokonut UI component adds fuzzy search over saved work and workspace pages. Eight matching cases bring the suite to 65 unit/API tests; two new browser workflows bring it to 18. A clean installation, formatting, strict types, production web build, and Expo dependency compatibility all pass. Deliberately exposing the manager's Sites & checklists action to a worker made the browser test fail; restoring the role condition returned the suite to green.

- Hard gate PASS: results come from the signed-in account's saved records, and each action opens an implemented destination. Workers cannot find another worker's assignment or the manager action. Browser tests cover pointer selection, both keyboard shortcuts, arrows/Home/End, Tab containment, Escape/focus restoration, rapid reopening, and leaving another open dialog alone. No uncaught page errors or horizontal overflow at 390px and 320px were observed. Inspected [desktop](images/kokonut-finder-desktop.png) and [phone](images/kokonut-finder-mobile.png) screenshots use synthetic fixtures.
- Purpose gate PASS: the copied MIT-licensed component retains Kokonut's matching, grouping, and keyboard behavior. The wrapper supplies Fieldwork data, native modal handling, and navigation. DESIGN.md records the charcoal surfaces, amber selection/focus, and Phosphor action/state icons. Tailwind imports theme variables and explicitly scanned utilities without Preflight, preserving existing forms and print layouts. The pinned upstream source, adaptations, and license notices are documented in [UI components](ui-components.md).
- Liveliness PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 is retained. Find work is a secondary header action; opening it makes search the immediate task. Transitions are disabled by default, and the phone workflow also runs with reduced motion and a light OS color preference while preserving the chosen notebook palette.
- Craftsmanship PASS: saved records remain searchable after an offline reload, independently of list filters. Navigation preserves an unsent inspection draft. Empty queries/results, role-specific actions, sign-out cleanup, and offline delivery of both license notices are tested. Options and Close finder have at least 44px targets; selected-row secondary text measures 6.24:1 contrast, with the existing amber focus accent at 10.73:1. The pilot adds about 40kB of compressed JavaScript and 2.6kB of compressed CSS to the production build.

These checks used Chrome on macOS; CI runs the same browser workflows in Chromium. This is incremental web adoption. Native UI, physical-device acceptance, and full screen-reader testing remain outside this change.

## Assignment rescheduling

The suite passes 81 unit/API tests and 21 browser workflows. New cases cover manager permissions, cookie-origin and PATCH preflight checks, invalid dates/extra fields, no-op dates, correction work, closed workflow states, concurrent edits, and retained local work. Removing the manager check deliberately failed the permission test. Removing the cache's version guard deliberately failed the late-list-response test. Both guards were restored before the final passing run.

The browser workflows exercise a manager in Los Angeles and worker drafts with an attachment. They cover planner/day counts, Enter/Space, Escape/Cancel focus, empty days, offline disabling/reload, a failed save, a competing manager edit, and a server-confirmed save whose response is deliberately lost. Reloading recovers the current date without repeating that write. An older worker report is blocked on sync; its answers, summary, and photo survive explicit draft recovery and resubmission. A broad existing seeded-reference selector was also tightened after a generated reference with the same prefix caused a test collision.

- Hard gate PASS: the manager action changes real unfinished orders through the validated API. Workers have no control, and submitted/approved orders stay locked. Failed saves retain the chosen date and require a reload; no failed request is presented as a successful empty result. All three new browser workflows check for uncaught page errors. Tests assert no horizontal overflow at 390px and 320px; the [desktop](images/reschedule-desktop.png) and [phone](images/reschedule-mobile.png) screenshots were inspected and contain synthetic fixtures.
- Purpose gate PASS: the date edit expands beside current order metadata, with its purpose recorded in DESIGN.md. It reuses the existing native date input, typography, charcoal surfaces, amber margin/focus rule, and labeled controls. No new visual assets, icon library, animation, or theme behavior is introduced.
- Liveliness PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 is retained. The work order remains the focal point, and the amber rule distinguishes the active schedule edit. Spacing groups the current date, proposed date, and save/cancel actions.
- Craftsmanship PASS: optimistic concurrency protects both schedule changes and older queued worker reports. Atomic cache merging retains drafts, photos, outbox entries, unrelated orders, and newer versions while still removing absent list records. New date/button controls have at least 44px targets and retain the established high-contrast text and amber focus styling. No-op saves create no version/event, and correction reports/feedback remain unchanged.

Local checks used Chrome on macOS. CI runs Chromium workflows and exports native JavaScript. There is no new native manager UI; physical-device and full accessibility acceptance remain separate from these checks.
