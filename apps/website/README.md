# Ryouri reader

React + TypeScript with shadcn/ui (Radix Nova), Tailwind CSS v4, and locally
bundled Geist. The generated UI components live in `src/components/ui/`;
`components.json` records their configuration. There are no CDN dependencies.

This milestone is read-only: collection, cuisine filter, cooking-time sort, and
recipe detail. Import and replacement confirmation are a later slice.

## Run and check

From the repository root:

```sh
vp install
vp run website#dev
vp check apps/website
vp test --run
vp run -r test
vp run website#build
```

The dev server proxies `/api/` and `/images/` to `http://localhost:5101`, matching
the API's HTTP launch profile. Start the real API and its database separately.
There is deliberately no mock data or fallback collection in the application.
An unavailable API displays a retryable error, never an empty collection.

Production must serve the built `dist/` and API on the same origin. Route
`/api/` and `/images/` to the backend before the frontend fallback; serve
`index.html` for `/` and `/recipes/:id`, including direct navigation and refresh.
Do not rewrite missing API/image responses to `index.html`. Production deployment
configuration belongs to the operations lane and is not delivered here.

Routing uses ordinary links and one parameterized recipe path. Sorting and
filtering are composed in requests to the shared HTTP contract; the API owns
case/whitespace matching, unique cuisine options, and deterministic cook-time,
title, and ID ordering. Changing either control retains the other selection.

## Reader verification

Automated tests replace only the external fetch boundary and render the real
components. Eleven tests cover summary links, combined sort/filter requests,
loading, empty collection, no matches and clearing the filter, errors from either
collection endpoint, retry, direct detail URLs, authored ingredient/step order,
unknown IDs, detail failure/retry, broken-image fallback, lazy card images, and
plain-text rendering. They do not prove the backend's ordering or persistence.

Browser checks performed for this slice:

- Chromium at 1280px and a 360px mobile viewport, using a temporary HTTP fixture
  behind the dev proxy, not the real backend.
- Card navigation, direct detail URL refresh, missing recipe, and broken/missing
  image placeholders; ingredient headings and numbered steps retain order.
- Keyboard skip link, Tab navigation, arrow-key cuisine and sort selection, and
  Enter to open a recipe. shadcn focus rings remain visible.
- Mobile collection/detail widths equal the 360px viewport (no horizontal
  overflow); select controls measure 44px tall.
- After stopping the fixture, the real network failure displays the shadcn Alert
  and retry action. The fixture was not committed and is no longer running.

### Remaining integration gates

- Run the above navigation/refresh and state checks against the real API and
  PostgreSQL, including successful server-managed images.
- Verify equal cook-time/title ties, case/whitespace cuisine deduplication, and
  combined filtering/sorting with persisted recipes (AC-04 through AC-07).
- Check long authored content and a representative 1,000-recipe collection on
  the target deployment. No performance or release acceptance is claimed.
- Confirm production fallback routing when deployment configuration exists.

### Known validation limitations

Repository-wide `vp check` stops on existing formatting in `SRS.md`,
`docs/activity-network.md`, and generated `apps/api/obj/*.json`. These paths are
outside frontend ownership and were not edited. `vp check apps/website` and
repository-wide `vp check --no-fmt` pass.

The production build succeeds but reports upstream `MODULE_LEVEL_DIRECTIVE`
warnings for Radix/Lucide `"use client"` directives in this client-only SPA.
They are not suppressed. .NET checks are not applicable to this frontend-only
slice. Real API/database integration was unavailable during these checks.
