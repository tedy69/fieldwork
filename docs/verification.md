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
