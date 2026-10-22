# Security

Fieldwork 0.1 is pre-release software. There is no production support or compliance certification. Use synthetic data for evaluation until you have assessed the deployment and device controls for your team.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/tedy69/fieldwork/security/advisories/new) when enabled. Otherwise, use the contact method on the maintainer's [GitHub profile](https://github.com/tedy69). Do not publish credentials, operational reports, or an unpublished exploit in an issue.

Include the affected version, minimal local reproduction, expected behavior, observed impact, and relevant configuration. Please keep testing bounded and limited to systems you control. There is no bug bounty program.

## Current boundaries

- One workspace and one API process per installation. Managers can access all data in that workspace; workers can access their assigned orders and related photos.
- Passwords use scrypt with a per-user salt. Session tokens are random, hashed in the database, expire after 14 days, and are revoked on explicit online logout.
- Browser authentication uses HttpOnly, SameSite=Strict cookies and origin checks on authenticated writes. Use HTTPS and `COOKIE_SECURE=true` outside local development.
- Native tokens use Expo SecureStore. Reports, photos, cached names, and offline drafts use IndexedDB or SQLite and are **not application-encrypted**. A device user with access to the app's storage may read them. Use OS encryption, managed accounts, and appropriate device controls.
- Photo uploads are bounded to three attachments, 2 MB each. The server checks supported file signatures and serves them through authenticated endpoints with `nosniff`.
- Login and API requests are rate-limited. The server does not trust proxy headers by default. Review your reverse proxy configuration instead of blindly trusting forwarded client IPs.
- Demo credentials are public and intentionally documented. Never seed the demo into an installation holding real data.

The mobile development toolchain currently includes upstream advisories for `braces` and `node-forge`. `npm audit` should be reviewed after each dependency update. The runtime Docker image installs only the API workspace and its dependencies, not Expo tooling. Do not expose Metro to untrusted networks or use development signing tools with production keys. Follow [issue #8](https://github.com/tedy69/fieldwork/issues/8) for compatible patched releases.
