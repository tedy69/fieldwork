# Self-hosting

Fieldwork currently runs one workspace on one API process with SQLite. Start with synthetic data and read SECURITY.md before using real operational information.

## Local server

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

The API serves the built web app at http://localhost:3001. Use `npm run db:seed` only on an empty demo database. For your own workspace, create accounts instead:

```sh
read -s FIELDWORK_NEW_PASSWORD
export FIELDWORK_NEW_PASSWORD
npm run user:create -- --email manager@example.com --name "Workspace Manager" --role manager
unset FIELDWORK_NEW_PASSWORD
```

Enter a password of at least 12 characters when the shell waits for input. Passwords are not passed as command-line arguments. Sign in as manager and use [Worker invitations](worker-invitations.md) in **Sites & checklists** to create an expiring link for a worker to choose their own password. Copy and share it directly; no email is sent automatically. You can also create workers with the CLI using `--role worker`. Add a site and checklist, then assign an order. Password-reset UI remains roadmap work.

## Docker

```sh
docker compose up --build -d
docker compose exec -e FIELDWORK_NEW_PASSWORD fieldwork npm run user:create -- \
  --email manager@example.com --name "Workspace Manager" --role manager
```

Set and export `FIELDWORK_NEW_PASSWORD` as above before the account command. Repeat for a worker. The runtime container runs as an unprivileged user, persists its database in a named volume, and installs only API dependencies. Expo/Metro tooling stays in the development build stage.

For a disposable Docker demo, run `docker compose exec fieldwork npm run db:seed` before creating any users. The seed refuses a database that already contains accounts.

## Configuration

| Variable        | Default                   | Purpose                                                      |
| --------------- | ------------------------- | ------------------------------------------------------------ |
| `DATABASE_PATH` | `./data/fieldwork.sqlite` | SQLite file, relative to the repository root unless absolute |
| `HOST`          | `127.0.0.1`               | API bind address; Docker sets `0.0.0.0` inside the container |
| `PORT`          | `3001`                    | HTTP port                                                    |
| `WEB_ORIGIN`    | `http://localhost:5173`   | Allowed browser origin, or comma-separated origins           |
| `COOKIE_SECURE` | `false`                   | Set `true` when served through HTTPS                         |

Put an HTTPS reverse proxy in front of the API for remote use. Set `WEB_ORIGIN` to the actual public HTTPS origin and `COOKIE_SECURE=true`. The web app and API should share that origin. Configure the proxy's body limit to permit the API's 9 MB request limit and avoid logging credentials or report bodies. There is no automatic TLS or hosted deployment in this repository.

## Backups and upgrades

Stop the API before taking a filesystem backup of the database directory, including any SQLite WAL files. Store backups with access controls appropriate to their data, and test restoration into a separate installation. Never commit them to Git.

For an upgrade, back up first, review CHANGELOG.md and migration notes, install the new lockfile, and rebuild. The server applies schema 2 for [report history](report-history.md#upgrading-schema-1-to-schema-2), schema 3 for [recurring batches](recurring-assignments.md#persistence-and-upgrade), schema 4 for [worker invitations](worker-invitations.md#persistence-and-contributors), and schema 5 for [worker access](worker-access.md#persistence-and-contributors) on startup. Existing users and inspection data are preserved. Older overwritten review details cannot be recovered. Review those guides before upgrading or restoring a backup with an older server; do not delete live migration markers. Older servers do not enforce disabled-worker flags, so a rollback requires the complete pre-upgrade backup and previous server. Do not point multiple API processes at a shared network filesystem. Multi-process and PostgreSQL support are roadmap work.
