# Software Requirements Specification — Ryouri

Version: 1.1  
Status: Requirements baseline for implementation planning

## 1. Purpose

Ryouri is a self-hosted recipe book for browsing a personal recipe collection and reading recipes while cooking. It also provides practical experience building a React frontend and a .NET backend.

The initial release prioritizes a small, usable application over speculative features or infrastructure.

## 2. Confirmed decisions

- Frontend: React with TypeScript.
- Backend: ASP.NET Core on .NET 10.
- Database: PostgreSQL running in Docker with persistent storage.
- YAML is an import format, not live storage. PostgreSQL is the source of truth.
- No application authentication or user accounts.
- The landing page presents recipes as a responsive grid of image cards, similar to a video browsing page.
- Recipe detail pages present an image, title, preparation and cooking metadata, ingredients, and ordered instructions.
- Readers can sort by cooking time and filter by cuisine.
- Ingredients support a plain list or one level of named groups, such as Dough and Stuffing.

The detailed behavior below establishes initial-release defaults where the original request did not specify an interaction.

## 3. Scope

### Included

- Recipe collection and detail pages.
- Cuisine filtering and cooking-time sorting.
- One-recipe YAML import with an optional image upload.
- Confirmed replacement of an existing recipe through re-import.
- Durable recipe and image storage.
- Documented self-hosted deployment, backup, and restore.
- Input validation, accessible controls, and useful error states.

### Excluded

- Accounts, permissions, and public write access.
- In-browser recipe editing and recipe deletion.
- Batch imports, folder watching, and automatic YAML synchronization.
- Search, ratings, comments, favorites, and sharing features.
- Meal planning, shopping lists, nutrition, and serving-size conversion.
- Recipe scraping and AI generation.
- Multiple images or videos per recipe.
- A shared ingredient catalogue or structured quantity/unit system.
- Dedicated caching services, background job systems, and cloud dependencies.

## 4. Users and deployment boundary

A reader browses recipes. A collection maintainer imports or replaces recipes. These describe activities, not application permission roles: anyone who can reach the application can perform both.

The supported deployment is localhost, a trusted private network, or a private VPN. An unauthenticated write interface must not be exposed directly to the public internet. Public hosting would require a separate access-control decision and is outside this release.

## 5. Functional requirements

### 5.1 Recipe collection

| ID | Requirement |
| --- | --- |
| FR-01 | The home page shall display the collection in a responsive grid of recipe cards. |
| FR-02 | Each card shall display an image or placeholder, title, cuisine, and cooking time. |
| FR-03 | Selecting a card image or title shall open that recipe. |
| FR-04 | Each recipe shall have a stable URL supporting direct navigation and refresh. |
| FR-05 | The collection shall distinguish loading, an empty collection, no filter matches, and request failure. |
| FR-06 | A missing or unavailable image shall not prevent reading a recipe. |

The initial release displays the collection without pagination. Collection API responses shall contain summary fields rather than full ingredients and instructions.

### 5.2 Sorting and filtering

| ID | Requirement |
| --- | --- |
| FR-07 | Readers shall be able to sort cooking time ascending or descending. |
| FR-08 | Cooking time shall mean `cookMinutes`, excluding preparation time. |
| FR-09 | The default sort shall be cooking time ascending. Ties shall use title ascending, then ID ascending, for either cooking-time direction. |
| FR-10 | Readers shall be able to select one cuisine or select all cuisines. |
| FR-11 | Cuisine options shall come from the stored collection, not a hard-coded catalogue. |
| FR-12 | Cuisine filtering and cooking-time sorting shall apply together. |
| FR-13 | Cuisine matching and option deduplication shall ignore letter case and surrounding whitespace. |

Each recipe has one cuisine. Import trims the label; display may preserve its authored casing. A filter change shall not reset the selected sort order.

### 5.3 Recipe detail

The page shall present content in this order:

1. Hero image spanning the recipe content width, or a placeholder.
2. Title.
3. Optional description.
4. Preparation time, cooking time, servings, and cuisine.
5. Ingredients.
6. Numbered preparation instructions.

| ID | Requirement |
| --- | --- |
| FR-14 | Times shall display explicit units. |
| FR-15 | Ingredient groups, items within each group, and steps shall retain their authored order. |
| FR-16 | Ingredients shall display as semantic lists of text entries, preceded by each group's heading when present. A single group without a heading shall display as a plain ingredient list. Instructions shall use a semantic ordered list. |
| FR-17 | The application shall not automatically convert quantities or scale servings. |
| FR-18 | An unknown recipe URL shall display a recipe-not-found state. |
| FR-19 | The layout shall remain readable on mobile without horizontal scrolling. |

Card images use a consistent landscape shape. Detail images fill the content width with a bounded height. Image cropping shall not alter the stored original.

### 5.4 YAML import and replacement

| ID | Requirement |
| --- | --- |
| FR-20 | An import page shall accept one YAML file containing one recipe, plus an optional image. |
| FR-21 | The backend shall parse and validate the entire input before publishing a recipe. |
| FR-22 | A new recipe ID shall create a recipe. |
| FR-23 | An existing ID shall not be overwritten unless the user explicitly confirms replacement. The backend shall enforce this distinction. |
| FR-24 | Re-import shall replace the complete recipe content, not merge individual fields. |
| FR-25 | Replacement without a new image shall retain the existing image. A new recipe without an image shall use a placeholder. |
| FR-26 | Invalid input shall return actionable syntax or field errors and shall not change an existing recipe. |
| FR-27 | Successful import shall make the recipe available without an application restart. |
| FR-28 | Success shall be reported only after persistence succeeds. |

Concurrent confirmed replacements use last-successful-write-wins behavior; collaborative editing and conflict merging are out of scope. Concurrent creation of the same ID shall not silently replace either recipe.

### 5.5 YAML lifecycle

- Uploaded YAML is parsed into application data and is not retained as an application-managed file.
- Local source files remain under the maintainer's control.
- Editing a local YAML file has no effect until it is re-imported.
- PostgreSQL is authoritative after import; no database-to-YAML synchronization is required.
- YAML copies alone are not a complete application backup because they may omit current changes and images.

## 6. Recipe data contract

| YAML field | Type | Validation |
| --- | --- | --- |
| `id` | String | Required; 1–100 characters; lowercase ASCII letters/digits separated by single hyphens; unique. |
| `title` | String | Required; nonblank; at most 200 characters. |
| `description` | String | Optional; at most 2,000 characters. |
| `cuisine` | String | Required; nonblank; at most 100 characters after trimming. |
| `prepMinutes` | Integer | Required; zero or greater; within a signed 32-bit integer. |
| `cookMinutes` | Integer | Required; zero or greater; within a signed 32-bit integer. |
| `servings` | Integer | Required; greater than zero; within a signed 32-bit integer. |
| `ingredients` | Ingredient-group array | Required; 1–200 groups, each with optional `heading` and required `items`; 1–200 ingredient items total across all groups. |
| `steps` | String array | Required; 1–200 nonblank entries; at most 4,000 characters per entry. |

All content is plain text. Array ordering is significant. Image paths are server-managed and are not accepted in YAML. The identifier is stable: importing a different ID creates a different recipe rather than renaming an existing one.

### 6.1 Ingredient groups

Use one consistent structure for both plain and grouped ingredients:

- `heading`: optional string, nonblank when supplied, at most 200 characters. Omit it for a plain list; do not supply null or an empty string.
- `items`: required array of at least one nonblank string; at most 1,000 characters per item.
- A recipe without sections uses one group with no heading.
- Named sections use groups with headings. Unheaded groups may also appear alongside headed groups; render them in place without inventing a heading.
- Groups cannot contain other groups. Only one level of ingredient grouping is supported.
- Quantities, alternatives, and optional notes remain plain text, not separate structured fields.
- Unknown group fields, empty groups, blank headings/items, and nested groups shall be rejected.

The YAML, API, and database use the same group-array structure. A bare string array is not a second accepted import syntax; a plain list is represented by one unheaded group as shown below.

### 6.2 Plain-list recipe example

```yaml
id: tomato-rice
title: Tomato Rice
description: A simple one-pot rice dish.
cuisine: Indian
prepMinutes: 10
cookMinutes: 25
servings: 2

ingredients:
  - items:
      - 1 cup basmati rice
      - 2 medium tomatoes, chopped
      - 1 small onion, sliced
      - 1 tbsp oil
      - 2 cups water
      - Salt to taste

steps:
  - Rinse the rice until the water runs mostly clear.
  - Heat the oil and cook the onion until softened.
  - Add the tomatoes and cook until they break down.
  - Add the rice, water, and salt, then bring to a simmer.
  - Cover and cook on low heat until the rice is tender.
  - Rest briefly, fluff, and serve.
```

### 6.3 Grouped ingredient example

The following replaces the `ingredients` field in a recipe:

```yaml
ingredients:
  - heading: Dough
    items:
      - 350 g flour (0 or 00)
      - 25 g butter
      - 15 g brewer’s yeast
      - Extra-virgin olive oil or lard
  - heading: Stuffing
    items:
      - 500 g boiled herbs (e.g. spinach, chicory, ribwort)
      - 250 g ricotta
      - Pepper (optional)
      - Nutmeg (optional)
```

### 6.4 Import validation

The importer shall reject malformed YAML, multiple documents, duplicate mapping keys, unknown fields, incorrect types, custom tags, and aliases. Parsing shall not instantiate arbitrary application objects. Input limits shall be checked server-side, including a maximum YAML size of 256 KiB and maximum nesting depth of eight.

## 7. Storage design

### 7.1 PostgreSQL

Use one `recipes` table. A recipe is read, imported, and replaced as one unit; separate ingredient and step tables are not required.

| Column | PostgreSQL type | Purpose |
| --- | --- | --- |
| `id` | `text PRIMARY KEY` | Stable recipe identity. |
| `title` | `text NOT NULL` | Display title. |
| `description` | `text NULL` | Optional description. |
| `cuisine` | `text NOT NULL` | Cuisine label. |
| `prep_minutes` | `integer NOT NULL` | Nonnegative preparation time. |
| `cook_minutes` | `integer NOT NULL` | Nonnegative cooking time. |
| `servings` | `integer NOT NULL` | Positive servings. |
| `ingredients` | `jsonb NOT NULL` | Ordered array of groups, each with optional `heading` and ordered string `items`. |
| `steps` | `text[] NOT NULL` | Ordered instructions. |
| `image_path` | `text NULL` | Server-managed relative image reference. |

Database constraints shall enforce identity uniqueness, nonnegative times, positive servings, a nonempty JSON array for ingredients, and a nonempty step array. Application validation shall enforce the full import contract, including group structure, optional-heading rules, nonempty item arrays, and nonblank ingredient/step entries.

Recipe inserts and replacements shall be atomic. SQL shall use parameterized values. Schema creation and later changes shall be reproducible and version-controlled.

JSONB is used only for grouped ingredients; steps remain `text[]` and metadata remains typed columns. No separate group tables, shared ingredient entities, or extra query indexes are required initially. Add indexes based on actual query plans and collection size rather than hypothetical growth.

### 7.2 Images

Images shall be stored on a persistent filesystem volume, not inside YAML or database binary fields.

- Accept validated JPEG, PNG, and WebP raster images only.
- Maximum uploaded image size: 10 MiB; maximum decoded size: 25 megapixels.
- Validate actual content, not only filenames or supplied MIME types.
- Generate storage names server-side; uploaded filenames shall never determine filesystem paths.
- Do not accept SVG or fetch remote image URLs.
- Write a new image successfully before committing its database reference.
- A failed import shall not delete or invalidate the previous recipe image.

A database write and a filesystem write are not one transaction. Failed writes or replacements may leave unreferenced images; automatic garbage collection is deferred. Referenced images must never be removed as part of unsafe cleanup.

## 8. Application architecture

```text
Browser
  └── React frontend
        └── ASP.NET Core API
              ├── PostgreSQL: recipes
              └── Persistent filesystem: images
```

- `apps/website`: replace the current vanilla TypeScript starter with React.
- `apps/api`: extend the current .NET 10 Minimal API; remove the sample weather functionality when recipe endpoints replace it.
- `apps/database`: may hold database-related setup files if useful; it does not need to become another application.
- The API owns validation, YAML parsing, persistence, and image handling.
- The browser shall never connect directly to PostgreSQL or receive its credentials.
- Production shall expose frontend and API through the same origin.
- Use ordinary React state, native browser controls, and CSS unless a concrete requirement needs more.
- Endpoint details, library selection, and deployment file layout belong in the implementation plan, not this requirements baseline.

## 9. Nonfunctional requirements

### 9.1 Deployment and durability

- Provide a documented Docker Compose deployment with PostgreSQL and persistent database/image storage.
- Application and container restarts or recreation shall preserve recipes and images when volumes are retained.
- Normal operation shall not require hosted external services or a CDN.
- Configuration and credentials shall come from deployment configuration, not committed secrets.
- PostgreSQL shall not be exposed publicly.
- Document backup and restore for both PostgreSQL and images. A simple maintenance-window procedure that pauses imports is sufficient to obtain a consistent backup.
- Verify restoration into a clean deployment with sample recipes and images.

### 9.2 Security and reliability

- Enforce all import validation on the server, independently of browser checks.
- Render recipe text without executing HTML or scripts.
- Bound request sizes and parser/image resource use.
- Restrict cross-origin access and protect state-changing browser requests against cross-site submission; private-network hosting alone is not sufficient protection.
- Return appropriate client errors for invalid requests and not-found responses for unknown recipes.
- Server errors shall not expose stack traces, credentials, or internal paths.
- Log enough context to diagnose failures without logging credentials or complete uploaded files.
- Database or network failures shall not appear to users as an empty collection.

### 9.3 Accessibility and responsiveness

- Core flows shall work with a keyboard.
- Controls shall have labels, visible focus states, and accessible validation feedback.
- Images shall have appropriate alternative text.
- Use semantic headings, lists, links, and buttons.
- Text and controls shall meet WCAG AA contrast requirements.
- Support narrow mobile and desktop layouts without horizontal page scrolling.

### 9.4 Capacity and performance

The initial target is a personal collection of up to 1,000 recipes with a handful of concurrent household users.

- Collection responses shall omit ingredients and steps.
- Off-screen card images shall use lazy loading.
- Keep rendered image dimensions stable to avoid avoidable layout shifts.
- Do not introduce a cache service, pagination system, or background workers without measured need.

No hardware-independent latency guarantee is imposed. Measure collection loading against the target deployment during validation; adjust the implementation if the initial capacity produces an unusable browsing experience.

## 10. Acceptance criteria

| ID | Scenario and expected result |
| --- | --- |
| AC-01 | Import several valid recipes: the landing page shows their images or placeholders, titles, cuisines, and cooking times. |
| AC-02 | Open a card: the detail page displays the specified content order and preserves ingredient/step order. |
| AC-03 | Load a detail URL directly and refresh it: the same recipe remains accessible. |
| AC-04 | Sort recipes with cook times 10, 20, and 30: ascending and descending produce the expected order, independent of prep times. |
| AC-05 | Sort recipes with equal cook times: title and ID provide deterministic ordering. |
| AC-06 | Select a cuisine: only matching recipes appear; casing differences do not create separate cuisine choices. Clearing the filter restores the collection. |
| AC-07 | Change sort while filtered: the cuisine selection remains active and the filtered results reorder correctly. |
| AC-08 | Import valid YAML with a new ID: one recipe is persisted and available immediately. |
| AC-09 | Import malformed YAML, invalid fields, unknown keys, duplicate keys, multiple documents, aliases, or oversized input: an actionable error is shown and no recipe is published. |
| AC-10 | Import an existing ID without replacement confirmation: the original remains unchanged. Confirm replacement: the complete recipe content is replaced. |
| AC-11 | Replace without an image: the existing image remains. Fail a replacement: the original recipe and image remain usable. |
| AC-12 | Upload an unsupported, misleadingly named, oversized, or excessively large decoded image: the server rejects it. |
| AC-13 | Restart/recreate containers while retaining volumes: recipes and images remain available. |
| AC-14 | Restore a backup into a clean deployment: recipe content and referenced images are recovered. |
| AC-15 | Exercise an empty collection, no matches, missing image, unknown ID, and unavailable API: each displays its distinct intended state. |
| AC-16 | Use collection, detail, and import flows with a keyboard and on a narrow mobile viewport: controls remain operable and content readable. |
| AC-17 | Attempt an unapproved cross-site write request: it cannot create or replace a recipe. |
| AC-18 | Import one unheaded ingredient group: the detail page displays a plain list without an extra group heading. |
| AC-19 | Import Dough and Stuffing groups: persistence, retrieval, and confirmed replacement preserve headings, group order, and item order; the page renders each heading above its items. |
| AC-20 | Import empty groups, blank headings/items, unknown group fields, nested groups, a bare string array, or more than 200 total ingredient items: reject the input without changing the stored recipe. |

## 11. Verification and implementation boundary

Automated checks shall cover import validation, persistence/replacement behavior, and combined filtering/sorting. Browser-level or documented manual checks shall cover navigation, visual states, accessibility basics, and image rendering. Deployment validation shall include persistence and backup restoration.

Use the repository's Vite+ checks and applicable scripts for frontend changes, and .NET build/tests for backend changes. Existing tooling does not yet constitute recipe test coverage.

This specification does not authorize unrelated features or abstractions. Implementation planning should map work to these requirements and acceptance criteria, and preserve the simple one-recipe-per-row model unless an actual requirement demonstrates a need to change it.
