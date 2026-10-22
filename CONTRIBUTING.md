# Contributing to Fieldwork

Thanks for helping build Fieldwork. The aim is a useful field operations platform that teams can run themselves and developers can extend.

## Your first change

1. Read the README and run the local demo.
2. Choose an issue, or open a discussion for a larger idea. Leave a short comment if you are working on an issue so others can avoid duplicating the work.
3. Fork the repository and create a branch from `main`.
4. Make one focused change and add tests when behavior changes.
5. Run `npm run check`. Run `npm run test:e2e` for workflow or UI changes.
6. Open a pull request explaining the problem, the change, and what you checked. A few plain sentences are enough.

You do not need to ask permission for a small bug fix or documentation improvement. For changes to sync, authentication, data storage, or the public API, discuss the approach first so contributors can agree on the contract.

## Development

Use Node 24 (`nvm use`) and the committed npm lockfile. `npm ci` installs every workspace. `npm run db:seed` creates a local demo; `npm run dev` runs the API and web app. Configuration examples are in `.env.example`; do not commit `.env` files or real reports.

Useful commands:

```sh
npm test
npm run typecheck
npm run check:expo
npm run format
npm run build
npm run test:e2e
npm exec -w @fieldwork/mobile -- expo export --platform ios --output-dir dist
```

The browser tests use a separate in-memory database. API tests use isolated stores. Neither should modify your development data. See [architecture](docs/architecture.md) for module boundaries and [mobile development](docs/mobile.md) for device checks.

React and React Native upgrades must match the installed Expo SDK. Run `npm run check:expo` before changing native dependencies; a successful bundle export alone does not verify SDK compatibility. Keep Node type definitions on the same major version as the supported Node runtime.

## How we work

- Prefer small, reviewable pull requests over unrelated improvements bundled together.
- Keep input and output contracts in `packages/contracts`; both clients should consume the SDK.
- Keep network transport out of the offline engine. Use a storage adapter for platform-specific persistence.
- Never drop an unsent report to fix a sync problem. Add a test for retries, conflicts, and persistence failures.
- Keep existing work-order checklist snapshots stable when a template changes.
- Use synthetic fixtures. Screenshots must not contain real people, addresses, tokens, or customer data.
- Add keyboard support, visible focus, labels, and useful empty/error states to UI changes.
- Use a plain commit title such as `fix: retain queued photos after a failed sync`.

## Reviews and community

Explain tradeoffs, ask questions, and be kind. Maintainers may request a narrower scope or a design discussion. A label is an invitation to help, not a guarantee of immediate review. Please respond to review comments and say when you can no longer continue a change.

Ownership can grow with sustained contributions: start with a change, help review an area, and discuss becoming an area maintainer. Decisions affecting contributors belong in public issues or discussions.

See [GOVERNANCE.md](GOVERNANCE.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and the [roadmap](ROADMAP.md).
