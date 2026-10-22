# Working on Fieldwork

Read README.md, CONTRIBUTING.md, and docs/architecture.md first. Preserve unrelated changes.

- Node 24 LTS, npm workspaces, TypeScript. Install with `npm ci`.
- `npm run check` is the baseline check; browser workflows use `npm run test:e2e` after building the web app.
- Domain contracts belong in packages/contracts. API methods belong in packages/sdk. Keep platform storage in adapters.
- Add regression tests for permission, persistence, and synchronization changes. Exercise retries with the same mutation ID and conflicts with a newer server version.
- Unsent reports must remain on the originating device until acknowledged. Never turn a network failure into a successful empty result.
- The API is a single-workspace server. Do not imply organization isolation until it exists and is tested.
- Demo fixtures must stay synthetic. Never commit tokens, .env files, SQLite databases, generated bundles, or customer data.
- Follow DESIGN.md for UI work. Test desktop and narrow screens, keyboard use, offline behavior, and errors.
- Keep PR descriptions short, factual, and focused on the final change and validation.
