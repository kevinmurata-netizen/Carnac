# Project knowledge

What a new developer — person or coding agent — needs to know about Carnac
that the code alone does not say: how the sites are run, what was decided and
why, and the mistakes that have already been made once. It was written at the
handoff from Claude Code to Codex (November 2026), from the notes kept during
development. Keep it current: when something here stops being true, change it
in the same pull request that made it untrue.

`AGENTS.md` holds the day-to-day rules. `DEPLOYMENT.md` is the runbook for
sites, migrations and new customers. `docs/SPEC.md` is the original product
specification.

---

## 1. What Carnac is

A web application for managing a utility's physical assets: what it owns, where,
in what condition, how fast it is deteriorating, what the risk is, what
treatments are possible and what they cost, and which work to fund under a
budget. It started as a water-main system and has been made **asset-agnostic**:
an asset class is configuration (asset types, attributes, condition indexes,
curves, treatments, costs), not code.

"Carnac" is the codebase's internal name. Customers see a product name set per
site — **Hydrocore** for water, **Powercore** for power.

### Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind, shadcn/ui.
  Next 16 differs from older versions; read `node_modules/next/dist/docs/`
  before using a Next API.
- Prisma 6.19.3 with the Neon driver adapter (`@prisma/adapter-neon`) — no Rust
  query engine. Locally a WebSocket proxy container lets that driver reach
  Docker Postgres.
- PostgreSQL with PostGIS (asset locations are real geometry).
- Auth.js (`next-auth`) credentials sign-in, JWT sessions.
- MapLibre for maps. Anthropic SDK for the optional AI Assistant
  (`ANTHROPIC_API_KEY`).
- Hosting: Vercel (team `mayvue`), databases on Neon. Functions run in `pdx1`
  beside the databases in AWS US West 2 (`vercel.json`).

---

## 2. Sites and accounts

One repository, one `main` branch, deployed as one Vercel project and one Neon
database per customer. Merging to `main` deploys every site at once. The list
lives in two places that must stay in step: the Sites table in `DEPLOYMENT.md`
and `scripts/sites.ts`.

| Site | Product | Address | Vercel project | Neon project | Endpoint | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| Carnac | Hydrocore | https://carnacms.vercel.app | `carnac_ms` | Carnac (`autumn-salad-22680630`) | `ep-tiny-shape` | Water demo |
| Carnac Power | Powercore | https://carnac-power.vercel.app | `carnac-power` | Carnac Power (`aged-sunset-84686472`) | `ep-divine-lake` | Test of the new-customer process |

- Both Neon projects are in organization `org-proud-term-65693134`, AWS US West 2,
  Postgres 18, autoscaling 0.25–2 CU, free plan.
- GitHub: `kevinmurata-netizen/Carnac`. **The repository is public.** Nothing
  secret is committed, but the seed accounts' password is (it is only for local
  and demo data).
- **Carnac Power is not a second product.** It exists to rehearse onboarding a
  new client with a different asset class. Do not build power-only features or
  maintain the two sites separately; anything a client needs goes into the core
  as configuration.
- Product name and logo per site come from Vercel env vars `PRODUCT_NAME` and
  `PRODUCT_LOGO` (`droplets`, `zap`, `flame`, `network`). They are deliberately
  not editable in the app; a customer's Administrator edits only the tagline and
  asset words under Settings › Branding. Do not add a developer/super-admin role
  to change them — each customer has their own database and that would be a
  standing back door.

### Tenancy

Default: a separate site and database per customer. A customer with several
asset classes keeps them in one organization as several modelled asset types —
that is not multi-tenancy. Keep a shared multi-customer site possible by
scoping every record to its organization. Done so far: work plans carry
`organizationId`, the SQL console is scoped per organization, asset type codes
are unique per organization. Roles are still global (deliberately deferred).

---

## 3. Production safety

These rules exist because each was broken once.

- **No one writes to a production database from an agent session.** Schema
  migrations and data loads are run by the owner, in their own PowerShell
  window or Neon's SQL editor. An agent prepares the SQL or the command and
  explains it; read-only checks are fine.
- **Check the target before any database command.** In the window that will
  run it: `$env:DATABASE_URL -match "ep-tiny-shape"` (Carnac) or
  `"ep-divine-lake"` (Carnac Power) must print `True`. One database per window,
  closed afterwards. A migration once ran on Carnac while meant for Carnac Power.
- **Never print, paste or ask for connection strings, passwords or tokens.** The
  owner copies them from Neon or Vercel themselves. A production password once
  appeared in a screenshot and had to be reset — and a Neon password reset
  breaks the site until Vercel's `DATABASE_URL` is updated and the project
  redeployed.
- **Never run `npm run db:seed` against a customer database.** The seed deletes
  everything, then loads the water demo.
- **Never give Prisma a real database as a shadow database**
  (`--shadow-database-url`). Prisma wipes the shadow. This erased the local dev
  database once. Use a throwaway database made for the purpose.
- **Migrations run on every site before the pull request merges** (the new code
  expects the new columns). Builds never migrate — two overlapping deploys
  once deadlocked on Prisma's advisory lock.
- **Give production SQL as idempotent statements** (`ADD COLUMN IF NOT EXISTS`,
  `CREATE … IF NOT EXISTS`, guarded constraints) **ending in a `DO $$ … RAISE
  EXCEPTION` check** that what should exist does. A migration once "ran" but left
  a column missing, and every page reading that table failed.
- **Never skip with `RAISE NOTICE` in SQL for Neon's editor.** It does not show
  notices, so a skipped block looks like success. Create the prerequisite in the
  same file, or `RAISE EXCEPTION`.
- **After a migration deploys**, check `vercel logs <site address> --since 30m`
  for `P2022` / "column … does not exist" on every site.
- `vercel env pull` cannot return secrets (it writes `[SENSITIVE]`), so scripts
  run from this folder hit the **local** database unless told otherwise. A
  script that must run against production announces its host first (see
  `whereAmI()` in `prisma/seed-facilities.ts`). One-off production loads are
  generated SQL pasted into Neon (`npm run db:seed:facilities:sql` is the
  worked example: one transaction, `ON CONFLICT DO NOTHING`, lookups by name,
  a final SELECT reporting what landed).

---

## 4. How work has been shipped

- One pull request at a time, branched from `main`.
- Each PR body states `Migrations: N` and `Scope:` — Universal, Configurable with
  default, Content, Tooling or Docs.
- Each PR adds an entry at the **top** of `ENTRIES` in
  `src/content/build-log.ts` (shown in the app). Plain language, user's terms;
  `note` says "No migration." or what must be run.
- Migration SQL is shown to the owner before it runs, locally too. Local
  apply: `npx prisma db execute --file … --schema prisma/schema.prisma`, then
  `npx prisma migrate resolve --applied <name>`, then stop the dev server,
  `npx prisma generate`, restart.
- A migration PR: the owner runs it on every site, says so, then it merges.
- Merge with a merge commit (`gh pr merge N --merge`), then `git pull`.
- There is no CI build: Vercel skips every non-production build
  (`vercel.json` `ignoreCommand`). Typecheck, lint and build locally before
  opening a PR.
- After a deploy is Ready on both sites, prune old deployments when asked:
  `npm run vercel:prune -- --keep-rollbacks 2` (dry run), then the same with
  `--yes`. Keeps the live deployment plus two rollbacks per site. When polling
  `vercel ls`, its table is on stderr (`2>&1`), and match rows with
  `grep https://` — `grep Production` hits the header first. For a CLI command
  on carnac-power from this folder, set `VERCEL_ORG_ID` (from
  `.vercel/project.json`) and `VERCEL_PROJECT_ID=prj_JHoJkCls4oJuSwjmNWlSGIc7qXg3`.

### Editing conventions

- Most files are CRLF in the working tree (`core.autocrlf=true`); keep each
  file's line endings.
- Do not run Prettier or `prisma format` over files — they reformat far more
  than the change.
- Match the surrounding code's comment density. Comments explain *why*, in plain
  English.
- User-facing wording is asset-agnostic: "Asset", not "Waterline"; screen words
  come from `getAssetWords`/`useAssetWords`, `getIndexWords`/`useIndexWords` and
  `getMeasureLabels`/`useMeasureLabels`. No new water hard-codes.

---

## 5. Local environment notes

- Windows 11, PowerShell, Node 24, Docker Desktop. Run every command from the
  project folder — `npx prisma` elsewhere downloads Prisma 7 and fails.
- PowerShell does not take `VAR=value command`; use `$env:VAR = "…"`.
- **Docker Desktop won't start** (since the 14–15 Oct 2026 Windows updates):
  Windows cannot delete stale AF_UNIX socket files, so Docker fails after any
  quit or crash. Fix: stop every Docker process, `wsl --shutdown`, rename
  `%LOCALAPPDATA%\Docker\run` and `%LOCALAPPDATA%\docker-secrets-engine` aside
  (e.g. `run.stale-<date>`; they can't be deleted), start Docker Desktop. The
  backend log is `%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`.
- Pages failing locally with a Neon `ErrorEvent` mean Docker (the database or
  its WebSocket proxy) is down.
- A local backup from 2026-10-16 is `backups/carnac-local-2026-10-16.dump`
  (excluded from git). Restore:
  `docker exec -i carnac-db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/carnac-local-2026-10-16.dump`
- Local databases: `carnac` (dev), `carnac_shadow` (Prisma's shadow). Test with
  throwaway databases (`createdb` in `carnac-db`, `prisma migrate deploy` with
  `DATABASE_URL` pointed there), backing up `.env`/`.env.local` first and
  restoring after, and drop them when done.
- Local sign-in: the seed accounts in `prisma/seed.ts` (e.g.
  `admin@carnac.local`), or a test admin given the same seed password.

---

## 6. Product decisions worth knowing

### Asset-agnostic platform (phases 1–5, done)

Goal: a new asset class by configuration, not code. Modelled asset types side by
side (#139–145); measures, risk factors, curves, treatments and condition index
per type (#146–153); neutral branding and vocabulary (#154–157); a second asset
class proven through Settings and import (#158–161); new-customer bootstrap
`npm run org:new` and org-scoping (#162–165).

Deliberately still water-specific: stored outcome reasons on past runs, seeded
model and treatment names, the Ask page's example questions, Scale Factor
examples, the location depth column (feet), and the engine's diameter cost
factor (8" = 1.0).

### Cross-asset planning (phase 6, done #168–180)

- Ranking is the Priority Score (Criticality × Scale × Category weight ×
  Expected benefit ÷ Cost) times an optional **asset type weight**
  (0.01–100, assumption `assetTypeWeights`). Scale factors are not comparable
  across types (a main's is in the thousands, a pole's is 1); do not normalise
  them — the app shows each type's typical Priority Score and a "Level the
  types" suggestion instead.
- Failure cost is per type, with a suggested figure where missing.
- Budget plans (`budget_plans`/`budget_plan_lines`; `budgets` is a legacy
  table): money per year, per category, and per type, pooled or separate
  (`typeFunding`).
- Corridor bundling: neighbouring work (by distance, or a shared attribute such
  as street) done together for per-type-pair savings; bring-forward and
  deferral windows; kept in work plans.
- **Everything new is opt-in, so a single-type water scenario gives the same
  results as before.** Check that on every change to the engine.

### Power starter pack (#182–188, #191)

Settings › Asset Types › **Add from a starter pack** creates Poles, Distribution
Transformers and Overhead Conductor fully modelled (`src/config/starter-packs.ts`;
figures are industry-typical starting points). Optional **sample data**: a
made-up network in `public/samples/power-distribution/` (generated by
`npm run samples:power`), loaded through Data Import, then risk recomputed, then
a sample scenario set (six scenarios over twenty years) made and run. It only
loads into empty pack types. The sample network sits on McPherson, Kansas under
the made-up name "Ridgeway"; moving it is an optional open item.

### Data Import line shapes (#190)

Line asset types take End Latitude/End Longitude and a Shape column (WKT
`LINESTRING` or GeoJSON, longitude first). Length is not yet filled or checked
from the shape.

### Permissions

Role permissions cover `page:<href>` (sidebar pages) and `card:<href>` (Settings
cards; a card governs its sub-pages). A card without a stored row is
Administrator-only to write; a page without one follows the older rule that
everyone except Executive may record field data. **Any change to the defaults
must keep "default equals what the app did before".** New Settings cards go in
`src/config/settings-cards.ts`. Administrator is always full access. Sessions are
JWTs checked only at sign-in (PRs #166 and #167 address that and are still open).

### Record ids

App-created rows use cuids; rows loaded from `prisma/sql/*.sql` use UUIDs. Any
id check (regex, zod, routing) must accept both.

### Production Treatment Planning baseline

Carnac's Treatment Planning reads **$22.3M across 232 segments**, not the older
$40.9M. Two exploratory combinations are deliberately live and the owner wants
them kept: "Leak Repair, Spot Repair" and "Rehabilitation, Cathodic Protection
(optional), Coating" (the second trips the app's `conflictingResets` warning,
accepted for now). Check combinations before calling a total change a
regression.

### Deferred — do not start unprompted

- Custom dashboards (users choosing their own cards) — separate from permissions.
- Preview vs production separation: when a real preview site exists, separate
  the databases first (Neon branches), then add `VERCEL_ENV`-driven cues
  (banner, tab prefix, favicon, export mark).
- Neutralising the remaining water wording listed above.
- Client-specific features at scale: the recommendation was one trunk, features
  off by default and switched on per organization, and a site registry — not
  decided.

---

## 7. Open items at handoff (2026-11-05)

- Load the sample scenario set on Powercore: Settings › Asset Types › Add from a
  starter pack › **Load the sample scenario set** (#191 is deployed).
- Open PRs #166 (sign out deactivated users, refresh role claims) and #167
  (stop pages throwing when a session has ended), from 14 October — decide
  whether to rebase and finish or close.
- Data Import: fill or check Length from a line's shape.
- Optional: move the power sample network off McPherson, Kansas.
- Local clean-up: throwaway database `carnac_settest`, and test waterlines
  `LS-TEST-1`…`4` in the local dev database.
