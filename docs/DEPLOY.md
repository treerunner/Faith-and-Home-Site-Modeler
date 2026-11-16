# Deploying to Railway

The modeler runs on Railway as a Node service (SvelteKit's `adapter-node`, built to `build/`),
next to its own Postgres with PostGIS and the Directus service. `railway.json` holds the build
and deploy settings; the variables below live in Railway.

## Two databases, never mixed

- **Production:** the Railway Postgres the deployed app and Directus use. Real committees and
  sites live here.
- **Development:** the database in your `.env`. `npm run dev`, Playwright and Vitest all use it;
  e2e tests create and delete their own users, committees and sites there.

Nothing in the repo points at production. Don't put the production URL in `.env`.

## How a deploy runs

1. Railway builds from `main`: `npm ci`, then `npm run build`.
2. **Pre-deploy:** `npm run db:migrate:prod` (`scripts/migrate.js`) applies any new migrations in
   `drizzle/` with drizzle-orm's migrator (no drizzle-kit needed). If it fails, the deploy stops and
   the running version stays up.
3. **Start:** `npm start` (`node build`). Railway checks `/` before switching traffic.

Schema changes stay the same as in development: edit `schema.ts`, `npm run db:generate`, check
the SQL, `npm run db:migrate` on the dev database, test, merge. The next deploy migrates
production. Migrations only add or reshape with data steps; rolling back means redeploying the
previous build, which works with the newer schema.

## Variables (app service)

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | Reference: the production Postgres's `DATABASE_URL` (private network) | The app's database |
| `RESEND_API_KEY` | Same as `.env` | Sign-in and invitation emails |
| `EMAIL_FROM` | `Faith & Home Site Modeler <hello@smallcitieslab.org>` (Railway needs no quotes) | Sender, on the verified domain |
| `ORIGIN` | `https://<service>.up.railway.app` (or the custom domain) | SvelteKit's request checks, and the address in email links |
| `ADDRESS_HEADER` | `X-Forwarded-For` | The sign-in rate limit counts real visitors, not Railway's proxy |
| `XFF_DEPTH` | `1` | One proxy (Railway's edge) in front of the app |
| `BODY_SIZE_LIMIT` | `4M` | adapter-node's default (512 KB) can refuse a large site save |

`PORT` is set by Railway. A custom domain later: add it in Railway, add the CNAME it shows to
DNS, change `ORIGIN`.

## First rollout (November 2026)

Production started as a one-time copy of the development database (sites, the Faith & Home team
committee, accounts, patterns, and Directus's configuration), with test leftovers removed. Directus
then moved to the production database. From then on the two are separate.

## Checks after a deploy

- The app loads; `/signin` sends a link that points at the deployed address, and its button signs in.
- `/modeler/sites` lists sites; one opens and saves.
- `/patterns` shows the catalog; an edit in Directus appears there.
