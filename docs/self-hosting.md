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

Enter a password of at least 12 characters when the shell waits for input. Repeat for a worker with `--role worker` and a different password. Passwords are not passed as command-line arguments. Sign in as manager, add a site and checklist in **Sites & checklists**, then assign an order. Account invitations and password-reset UI are not implemented yet.

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

For an upgrade, back up first, review CHANGELOG.md and migration notes, install the new lockfile, and rebuild. Version 0.1 initializes schema version 1; future schema changes must ship migrations. Do not point multiple API processes at a shared network filesystem. Multi-process and PostgreSQL support are roadmap work.
