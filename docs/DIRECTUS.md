# Directus setup

Directus is the CMS the team uses to write patterns and, later, stories. It runs as its own
Railway service against the **same Postgres** as the app. The app reads the tables directly;
Directus is only the editing interface. Nothing in the app depends on Directus running.

## Stand it up

1. On Railway, add a Directus service (the official `directus/directus` image) in the project.
2. Point it at the app's database: set `DB_CLIENT=pg` and `DB_CONNECTION_STRING` to the same
   value as the app's `DATABASE_URL`. Set `KEY`, `SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and
   `PUBLIC_URL` as Directus documents.
3. On first boot Directus adds its own `directus_*` tables. Drizzle ignores them
   (`tablesFilter` in `drizzle.config.ts`), and Directus leaves ours alone.
4. In Directus, open Settings → Data Model. Our tables show up as unconfigured collections;
   configure them as below. Changing a table's columns stays a Drizzle migration in this repo
   (`npm run db:generate`, `npm run db:migrate`), never a Directus schema edit.

## Collections

### patterns

| Field | Interface | Notes |
|---|---|---|
| `name`, `summary` | Input, Textarea | |
| `slug` | Input | The URL (`/patterns/<slug>`). Lowercase words joined by hyphens. Changing it breaks links. |
| `placeholder` | Toggle | Turn off when the pattern is written: the page drops its placeholder banner. |
| `sort` | Input (number), or Directus manual sort | Editorial order: the library lists patterns by it, and when two patterns claim one cell the first wins. |
| `building_types` | Checkboxes: `box`, `box_plus`, `object`, `cluster` | The pattern covers every combination of the three lists. |
| `site_types` | Checkboxes: `urban`, `suburban`, `rural` | |
| `development_types` | Checkboxes: `existing`, `reuse`, `new`, `reuse_new`, `downsize_sell` | |
| `example_site_id` | Many-to-one → sites (display `name`) | The modeled site shown on the pattern page. |
| `example_plan_id` | Many-to-one → plans (display `name`, filter by the chosen site) | Empty means the site's existing conditions. |
| `sections` | One-to-many → pattern_sections, sorted by `sort` | Alias field. |
| `variants` | One-to-many → pattern_variants, sorted by `sort` | Alias field. |

Each cell should have one pattern. `/patterns/matrix` warns when two patterns claim the same cell.

### pattern_sections

`heading` (Input), `body` (Markdown or Textarea), `sort` (hidden, drag to order). Hide `pattern_id`.

### pattern_variants

`key` (Input; short, unique within the pattern), `name`, `summary`, `sort`. Hide `pattern_id`.
Each `when_*` field is Checkboxes with that question's answers. A variant fits when every
filled-in condition is answered and allowed; leave a condition empty for "any answer". The first
variant that fits, in `sort` order, is shown.

| Field | Answers |
|---|---|
| `when_size` | `small`, `medium`, `large` |
| `when_tenure` | `new`, `recent`, `established`, `historic` |
| `when_ownership` | `owned`, `leased` |
| `when_partnering` | `open`, `unsure`, `not_now` |
| `when_capacity` | `volunteers`, `some_staff`, `staffed` |
| `when_change` | `preserve`, `adapt`, `transform` |
| `when_role` | `gathering`, `service`, `housing_partner` |

### plans and sites

These are for reference and relations, not editing models.

- **plans:** show `name` (editable), `site_id`, `position`; `thumbnail` as read-only. Hide
  `data`, `slug`, `old_slugs`. Renaming here keeps the plan's URL until it's next saved in the
  modeler.
- **sites:** show `name`, `thumbnail` read-only. Hide `data`, `slug`, `origin`, `parcel`.

**Never edit `data` in the CMS.** It holds the model's geometry and is checked and converted
(`normalizeSite`) only by the app; an edit there can break a site.

## Permissions

Give editors full access to patterns, pattern_sections and pattern_variants; read access to
sites and plans (plus update on `plans.name` if renaming there is wanted). Keep the public role
without access: the app serves pages itself.

## Later

If the app ever needs content only Directus holds (files, stories), it would read Directus's
REST API with plain `fetch`, using `DIRECTUS_URL` and a static `DIRECTUS_TOKEN` declared in
`src/env.ts`. The pattern catalog doesn't need this: the app reads its tables directly.
