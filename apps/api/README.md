# Recipe reader API

.NET 10 Minimal API using Npgsql and the SRS `recipes` table. This first slice
provides reads only; it does not create the database schema, import recipes,
write data, or serve image files.

## Run

1. Provision PostgreSQL and apply the database lane's versioned migration:
   `apps/database/migrations/001_create_recipes.sql`.
2. Set `ConnectionStrings__Recipes` to a PostgreSQL connection string supplied
   through local/deployment configuration, not a committed settings file.
3. From the repository root:

   ```sh
   dotnet run --project apps/api/Api.csproj --no-launch-profile --urls http://localhost:5101
   ```

Use `Api.http` for example requests. Deploy the browser and API on the same
origin; this API enables no cross-origin policy. Production proxy/container
configuration belongs to the later operations slice.

## HTTP behavior

- `GET /api/recipes?sort=asc|desc&cuisine=...` returns summary objects with
  `id`, `title`, `cuisine`, `cookMinutes`, and nullable `imageUrl`. No pagination,
  ingredients, or steps. The default is ascending cooking time; title then ID
  are ascending ordinal tie-breaks in both directions.
- Cuisine filtering trims whitespace and ignores case. Missing or whitespace-only
  cuisine selects all recipes. `GET /api/cuisines` returns trimmed,
  case-insensitively unique labels from the whole collection, preserving one
  stored casing per label.
- `GET /api/recipes/{id}` returns all SRS recipe fields plus nullable `imageUrl`.
  Missing descriptions are represented as `null`. Ingredients retain the stored
  group-array structure, including omitted headings, and group/item/step order.
- `image_path` is a server-managed relative filename; non-null references become
  `/images/{filename}` URLs. Image uploads, validation, and file serving are not
  part of this milestone. Missing files must still use the frontend placeholder.
- Invalid sort values (including an explicitly empty value) return 400 Problem
  Details with an `errors.sort` array. Unknown IDs return 404 Problem Details.
  Database failures return sanitized 500 Problem Details, not an empty success,
  including when running in Development.

## Build and real PostgreSQL tests

From the repository root:

```sh
dotnet build apps/api/Api.csproj --configuration Release --warnaserror
export RYOURI_TEST_CONNECTION='<connection string for a disposable PostgreSQL database>'
# Optional: use the migration from a database worktree before its PR is integrated.
# export RYOURI_TEST_SCHEMA='/absolute/path/to/001_create_recipes.sql'
dotnet test apps/api/tests/Api.Tests.csproj --configuration Release -warnaserror
dotnet format apps/api/Api.csproj --verify-no-changes
dotnet format apps/api/tests/Api.Tests.csproj --verify-no-changes
```

The test database user needs permission to create/drop schemas and tables. Tests
create uniquely named populated and empty schemas, apply the actual database
migration in each, seed recipes, exercise the real HTTP endpoints and SQL, and
drop those schemas on teardown. They never truncate an existing `recipes` table.
Missing database configuration or migration files fail tests rather than silently
skipping integration proof. The migration defaults to
`apps/database/migrations/001_create_recipes.sql` in this checkout.

Coverage includes default/ascending/descending cooking-time ordering with title/ID
ties, simultaneous normalized cuisine filtering, SQL-like input as literal data,
global cuisine deduplication, ordered grouped/plain detail ingredients, nullable
images, missing IDs, rejected sort values, an empty collection, sanitized database
errors, and removal of the weather endpoint. Import, replacement, image/security,
and deployment acceptance remain later milestones.
