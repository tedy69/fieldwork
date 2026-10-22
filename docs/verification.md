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
