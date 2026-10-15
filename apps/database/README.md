# Local PostgreSQL

First database milestone for SRS §7.1: one `recipes` table, no extra indexes or
entities. PostgreSQL is authoritative; YAML parsing and full recipe validation
belong to the API. This is **local development setup**, not the complete
same-origin application deployment or release acceptance evidence.

## Start

Requires Docker with Compose (or a compatible Podman Compose installation).
From `apps/database`:

```sh
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD to a generated password, never commit it.
docker compose up -d
docker compose ps
```

Wait for the database to be healthy before connecting. Only host loopback is
published. The API running on the host connects to `127.0.0.1:5432`, database
`ryouri`, user `ryouri`, with the password from `.env`. Set `POSTGRES_PORT` if
5432 is occupied. Never send this credential to the browser. This local user
owns the schema; deployment privilege decisions belong to the operations slice.

The named `postgres-data` volume survives `docker compose down`, restarts and
container recreation. **`docker compose down -v` deletes the database.** Changing
the configured password does not change an already initialized database's
password. Keep the PostgreSQL major version fixed until an explicit upgrade.

## Versioned schema

On an **empty** data volume the official PostgreSQL entrypoint applies
`migrations/*.sql` in filename order. `001_create_recipes.sql` is transactional.
It intentionally fails if reapplied rather than silently accepting schema drift.
Do not edit an already applied migration; add the next numbered SQL file.

Initialization scripts do not run again on existing volumes. Record the applied
filenames with your deployment and explicitly apply each new migration once,
after backing up, for example:

```sh
docker compose exec -T postgres psql -U ryouri -d ryouri -v ON_ERROR_STOP=1 \
  < migrations/002_example.sql
```

That is a future-migration command template, not an existing file. No migration
framework or additional metadata table is needed for this first schema.

The database enforces required columns, unique identity, nonnegative times,
positive servings, nonempty JSON ingredient arrays, and nonempty step arrays.
The API must additionally validate the full SRS import contract: slug/lengths,
trimmed cuisine, groups/items/headings, entry limits, and nonblank steps. JSONB
arrays and `text[]` retain order. `image_path` is a nullable server-managed
relative reference, not image bytes. API writes must use parameterized SQL and
one transaction for complete recipe inserts/replacements; never blindly upsert
an unconfirmed existing ID. No SQL API/write behavior is implemented here.

## Runnable checks

Against a healthy local database:

```sh
docker compose exec -T postgres psql -U ryouri -d ryouri < check.sql
```

The check exits nonzero on failure. It tests unique identity, each required
column, negative times, nonpositive servings, empty/non-array ingredients, empty
steps, nullable optional fields, and ingredient/step order. Its fixture rolls
back; if its reserved ID already exists, it fails without changing that recipe.
For an independently managed test PostgreSQL, use
`psql "$DATABASE_URL" -f check.sql` after applying migration 001.

## Database backup and restore

Pause imports for the entire database **and image** backup window. For the
local database:

```sh
docker compose exec -T postgres pg_dump -U ryouri -d ryouri -Fc > recipes.dump
# Restore only into a clean database with no initialized recipes table:
docker compose exec -T postgres pg_restore -U ryouri -d ryouri \
  --exit-on-error < recipes.dump
```

The dump already contains the schema: a clean restore target must not also run
migration 001 before restoring. Test restoration in a separate empty PostgreSQL
instance, not over live recipes. Dumps may contain private recipe content;
store them outside the repository. Database dumps alone do **not** back up
images. The operations milestone owns coordinated image-volume backup, clean
full-deployment restore proof and retained-volume image verification.

## First-milestone validation evidence

Validated with PostgreSQL 17 through Docker's Podman/Compose compatibility
runtime (Podman 5.8.7, podman-compose 1.6.0):

- Fresh-volume initialization applied migration 001; `check.sql` passed.
- Inserted a probe recipe, ran Compose down/up retaining the volume, and checked
  that its row and relative image reference survived container recreation.
- Dumped with `pg_dump -Fc`, restored into a separate empty database without
  running initialization, and verified ingredients, steps and image reference.
  `check.sql` also passed against that restored database. Removed test fixtures.
- `vp install`, `vp test` (one existing test), and `vp run -r build` passed.
  `vp check` was blocked by existing formatting in `SRS.md`,
  `docs/activity-network.md`, and generated `apps/api/obj/*.json`; these are
  outside this component's ownership and were left unchanged.

No image files or running API were part of these checks. Database-only proof
is not AC-13/AC-14 full-application acceptance or release acceptance.
