# Local PostgreSQL

First database milestone for SRS §7.1: one `recipes` table, no extra indexes or
entities. PostgreSQL is authoritative; YAML parsing and full recipe validation
belong to the API. This is **local development setup**, not the complete
same-origin application deployment or release acceptance evidence.

## Start

Use rootless Podman with a Compose provider. Run as your normal user, never
with `sudo`. From `apps/database`:

```sh
cp -n .env.example .env
# Edit .env: set POSTGRES_PASSWORD to a generated password, never commit it.
# Before first start, verify the dedicated directory is absent or belongs to
# this Ryouri PostgreSQL 17 instance. Stop if its contents/ownership are unknown.
mkdir -p "${HOME}/.local/state/ryouri"
podman compose up -d
podman compose ps
```

Compose creates the dedicated `postgres` subdirectory on first start. Do not
start against an existing unknown directory, symlink, system database, or data
from another PostgreSQL version. Do not copy, delete, chown, or relabel existing
database files to make startup succeed; stop and investigate instead.

Wait for the database to be healthy before connecting. Only host loopback is
published. The API running on the host connects to `127.0.0.1:5432`, database
`ryouri`, user `ryouri`, with the password from `.env`. Set `POSTGRES_PORT` if
5432 is occupied. Never send this credential to the browser. This local user
owns the schema; deployment privilege decisions belong to the operations slice.

### Host source versus container destination

- **Host source:** `${HOME}/.local/state/ryouri/postgres`, e.g.
  `/home/akanksh/.local/state/ryouri/postgres`. This is the only host database
  storage location configured here; it is a bind mount, not a named volume.
- **Container destination:** `/var/lib/postgresql/data`, also explicitly set as
  `PGDATA`. This is PostgreSQL **17**'s internal data directory. It is **not**
  the host's `/var/lib`, and no host `/var/lib` or system PostgreSQL directory
  is mounted or modified. PostgreSQL 18+ has different image layout defaults;
  do not change the major version without an explicit upgrade plan.
- `:Z` gives this dedicated directory a private SELinux container label.
  Rootless Podman's entrypoint can set ownership inside its user namespace on
  the new directory; the host may show a subordinate UID. Do not use `sudo`,
  disable SELinux, or recursively chown/relabel a parent directory. Never mount
  all of `${HOME}` or `.local/state/ryouri` as PGDATA.
- Migration files are a separate read-only, SELinux-labeled repository mount,
  not database persistence.

The bind-mounted directory survives `podman compose down`, restarts and
container recreation. Never delete it as cleanup, and never use volume-pruning
or destructive reset commands. This configuration does not move or delete old
named-volume data; any previous storage remains untouched. Changing the
configured password does not change an initialized database's password.

## Versioned schema

On an **empty** dedicated data directory the official PostgreSQL entrypoint applies
`migrations/*.sql` in filename order. `001_create_recipes.sql` is transactional.
It intentionally fails if reapplied rather than silently accepting schema drift.
Do not edit an already applied migration; add the next numbered SQL file.

Initialization scripts do not run again on existing data directories. Record the applied
filenames with your deployment and explicitly apply each new migration once,
after backing up, as shown below.

Migration `003_allow_one_zero_time.sql` implements the latest user correction,
superseding 002's strictly-positive rule: **each time is nonnegative, and at least
one must be positive**. Salad with prep > 0 and cook = 0 is valid; prep = 0 and
cook > 0 is also valid; both zero is invalid. The combined check uses OR, not
integer addition, so valid signed-32-bit maxima cannot overflow.

Empty-directory initialization applies 001, 002, then 003 before storing any
recipes. Existing deployments on either 001 or 002 can apply 003 directly;
002 is superseded and must not be applied afterward. For a deployment still on
001, skip 002 to avoid rejecting valid single-zero recipes. Pause imports, back
up, inspect both-zero rows, then apply 003:

```sh
podman compose exec -T postgres psql -U ryouri -d ryouri -v ON_ERROR_STOP=1 \
  -c 'SELECT id, prep_minutes, cook_minutes FROM recipes WHERE prep_minutes = 0 AND cook_minutes = 0;'
podman compose exec -T postgres psql -U ryouri -d ryouri -v ON_ERROR_STOP=1 \
  < migrations/003_allow_one_zero_time.sql
```

If both-zero recipes exist, 003 fails atomically without rewriting any values
or leaving partially changed constraints. Obtain explicit corrections from the
maintainer before retrying; never silently replace zeros with invented times.
The API import contract must enforce the same new requirement. No existing host
database was migrated as part of this change. No migration framework or extra
metadata table is needed.

The database enforces required columns, unique identity, nonnegative times with
at least one positive time,
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
podman compose exec -T postgres psql -U ryouri -d ryouri < check.sql
```

The check exits nonzero on failure. It tests unique identity, each required
column, valid single-zero times, invalid both-zero/negative times, signed-int
maxima without overflow, nonpositive servings, empty/non-array ingredients, empty
steps, nullable optional fields, and ingredient/step order. Its fixture rolls
back; if its reserved ID already exists, it fails without changing that recipe.
For an independently managed test PostgreSQL, use
`psql "$DATABASE_URL" -f check.sql` after applying the schema through migration 003.

## Optional persisted preview recipes

`seed.sql` is opt-in, outside migrations, and never runs automatically. It adds
seven `sample-*` recipes with `ON CONFLICT (id) DO NOTHING`: existing recipes,
including conflicting sample IDs, remain untouched. There is no cleanup script.
Against the running local database, explicitly run:

```sh
podman compose exec -T postgres psql -U ryouri -d ryouri < seed.sql
podman compose exec -T postgres psql -U ryouri -d ryouri < check-samples.sql
```

Examples cover Indian/Japanese/Arabic cuisines, case/whitespace variants for
read-side normalization (normal imports trim labels), cook times 0/5/10/20/30,
equal-time title/ID ties, preparation-only salad and cooking-only tofu. Optional
descriptions, different servings, plain groups, Dough/Stuffing headings, mixed
headed/unheaded groups, ordered items and steps are included. Images are NULL
placeholders, not fabricated references. The read-only sample check covers both
sort directions, normalized cuisine choices and representative detail fields.
It may fail if an existing conflicting sample ID differs; never overwrite that
recipe just to satisfy the examples.

### Running local connection (no secrets in logs)

The real rootless PostgreSQL instance is running as `database_postgres_1`:

- Host `127.0.0.1`, port `55432`, database `ryouri`, username `ryouri`.
- Password: read `POSTGRES_PASSWORD` locally from this worktree's ignored,
  mode-0600 `apps/database/.env`. Do not print, commit or send the value.
- Backend connection template:
  `Host=127.0.0.1;Port=55432;Database=ryouri;Username=ryouri;Password=<local value>`.
  Configure it only in the API's local environment/secret configuration.
- Host files persist in `${HOME}/.local/state/ryouri/postgres`, mounted at
  container `/var/lib/postgresql/data` with SELinux `:Z`. The earlier `database`
  directory and all pre-existing data were left untouched.

The dedicated `postgres` directory was absent before startup. Initialization
applied all three migrations; constraints passed. The explicit seed inserted
seven rows; rerunning inserted zero rows. Persisted sample reads passed. The DB
is available for live preview, but API connectivity/availability must still be
verified by the backend lane. No image files were added.

## Database backup and restore

Pause imports for the entire database **and image** backup window. For the
local database:

```sh
podman compose exec -T postgres pg_dump -U ryouri -d ryouri -Fc > recipes.dump
# Restore only into a clean database with no initialized recipes table:
podman compose exec -T postgres pg_restore -U ryouri -d ryouri \
  --exit-on-error < recipes.dump
```

The dump already contains the schema: a clean restore target must not also run
migration 001 before restoring. Test restoration in a separate empty PostgreSQL
instance, not over live recipes. Dumps may contain private recipe content;
store them outside the repository. Database dumps alone do **not** back up
images. The operations milestone owns coordinated image-volume backup, clean
full-deployment restore proof and retained-volume image verification.

## First-milestone validation evidence

The original named-volume setup was validated with PostgreSQL 17 through
Docker's Podman/Compose compatibility
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

### Rootless host-storage correction

Revalidated the bind-mount configuration with rootless Podman and SELinux both
enabled. The dedicated host `database` directory did not exist before this
check; no pre-existing database was opened or altered.

- Container inspection confirmed host
  `/home/akanksh/.local/state/ryouri/database` mounted at container
  `/var/lib/postgresql/data`; `PGDATA` matched and `PG_VERSION` was 17.
- The host directory received SELinux `container_file_t` with private MCS labels.
- `check.sql` passed after initialization and again after container recreation;
  logs confirmed existing data was detected and initialization was skipped.
- Component formatting and diff checks passed. No schema/application code
  changed in this correction; earlier workspace check limitations remain.

The validation container was stopped/removed with Compose down, **without**
removing data. The earlier `database` directory is retained untouched. An ignored,
mode-0600 `apps/database/.env` holds generated local credentials and validation
port 55432. No cleanup, migration or modification of existing system databases
or old named volumes was performed.

The final host-directory clarification changes the configured source to
`${HOME}/.local/state/ryouri/postgres`, keeping the same container destination
and `PGDATA`. The earlier runtime evidence above used `database`, not `postgres`.
The final configuration was checked for the exact new source/destination and
SELinux option without starting a server or changing either directory. Existing
files are **not** automatically moved from `database` to `postgres`; first start
with an absent `postgres` directory initializes a separate new database. If you
need existing content transferred, stop and plan an explicit backed-up migration
rather than assuming changing the mount path moves the files.

### Historical strictly positive times validation (superseded by 003)

Validated 001 then 002 in an isolated PostgreSQL 17 container with tmpfs data,
no host database mounts and no published ports. The updated check failed before
002 because zero preparation time was accepted, then passed after 002, including
separate zero and negative cases for both time fields. A zero-time probe also
proved 002 refuses existing invalid rows atomically: its stored values and the
original constraints remained unchanged after failure. The ephemeral validation
container was stopped; no existing host database was opened or migrated.

### Current nonnegative, not-both-zero validation

Validated in isolated PostgreSQL 17 tmpfs storage, with no host mounts or
published ports. The current check failed on 002's rejected salad case, then
passed after 003. It covers preparation-only, cooking-only, both-positive,
both-zero rejection, negative rejection, and both signed-int maxima without
overflow. Also verified direct upgrade from 001 to 003 preserves a stored salad;
a both-zero probe blocked migration atomically with its original data and
constraints unchanged. The validation container was stopped. No existing host
database was opened or migrated.

No image files or running API were part of these checks. Database-only proof
is not AC-13/AC-14 full-application acceptance or release acceptance.
