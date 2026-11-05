<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Carnac — instructions for coding agents

Carnac is an asset-management web app for utilities (condition, risk,
deterioration, treatments, budget scenarios, work plans), deployed per customer
as **Hydrocore** (water) and **Powercore** (power). Next.js 16, React 19,
TypeScript, Prisma 6.19.3 with the Neon driver adapter, PostgreSQL + PostGIS,
Auth.js, hosted on Vercel with Neon databases.

**At the start of every session, read `docs/PROJECT-KNOWLEDGE.md`** (sites,
decisions, past incidents, open items). `DEPLOYMENT.md` is the runbook for
sites, migrations and new customers. Keep both current as part of your changes.

The owner works on Windows 11 in PowerShell. Give commands for PowerShell
unless you are running them yourself in a POSIX shell, one command per code
block. Run everything from the repository root: `npx prisma` anywhere else
fetches Prisma 7 and fails.

## Hard rules

1. **Never write to a production database.** Production is the two Neon
   databases behind the sites (endpoints `ep-tiny-shape`, `ep-divine-lake`).
   Prepare migration SQL or commands, show them, and let the owner run them in
   their own window after checking `$env:DATABASE_URL -match "<ep- id>"`.
   Read-only queries are fine when you have read access.
2. **Never print, request, log or commit secrets** — connection strings,
   passwords, `AUTH_SECRET`, API keys, tokens. `.env` and `.env.local` are
   gitignored and stay that way. If you need a value, ask the owner to set it
   where it is used.
3. **Never run `npm run db:seed` except against the local Docker database.**
   It deletes everything first.
4. **Never pass a real database to Prisma as a shadow database.** Prisma wipes
   it. Use a throwaway database, or `--from-schema-datamodel`.
5. **Show migration SQL to the owner before it runs, even locally.**
6. **Never push to `main` directly, force-push, or merge a PR** unless the owner
   says "merge N". Merging deploys every site.
7. Don't run Prettier or `prisma format` across files; keep each file's line
   endings (most are CRLF in the working tree).

## Run it locally

Prerequisites: Node 24, Docker Desktop, Git. For deploy chores also the GitHub
CLI (`gh`) and Vercel CLI (`vercel`), already signed in on the owner's machine.

```bash
npm install
```

```bash
docker compose up -d
```

This starts `carnac-db` (PostGIS 16 on 5432) and `carnac-wsproxy` (5433), which
the Neon driver needs to reach local Postgres. If Docker Desktop will not start,
see "Local environment notes" in `docs/PROJECT-KNOWLEDGE.md` (stale socket
folders to rename).

Create `.env` from `.env.example` if it does not exist (local values only:
`DATABASE_URL` for the Docker database, any random `AUTH_SECRET`,
`NEXTAUTH_URL=http://localhost:3000`). Then, for a fresh local database only:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000 and sign in as `admin@carnac.local` with the seed
password in `prisma/seed.ts`. The owner's existing local database already holds
data built up over time — do not reseed it without asking.

Optional seeds: `npm run db:seed:facilities`, `npm run db:seed:components`.
A blank organization like a real customer's: `npm run org:new -- --name "…" --admin you@example.com`
(it prints the admin password once — don't echo it into chat or logs).

## Check before every pull request

There is no CI build — Vercel builds only `main`. Run all three:

```bash
npx tsc --noEmit -p tsconfig.json
```

```bash
npx eslint src prisma --max-warnings=0
```

```bash
npm run build
```

`npm run build` needs a reachable database: prerendering queries it, and with
no database the build fails on `/_not-found` with `[object ErrorEvent]`. Locally that means Docker must be up. Where there is no
database (a Codex cloud task), run the typecheck and lint, and say in the PR
that the build was not run.

For anything the browser shows, run the app and check it: the page renders,
the console is clean, and the change behaves. Use throwaway local databases for
destructive or data-shape tests (`docker exec carnac-db createdb -U carnac <name>`,
then `prisma migrate deploy` against it), restore `.env` afterwards, and drop
them when done.

Engine changes (scenarios, treatment planning, risk, deterioration) must leave
existing single-type water results unchanged unless the change is meant to
alter them; new behaviour is opt-in per scenario.

`npm run qa:*` scripts are specialised checks (ranking, allocation, option
arithmetic, raw-query snapshots); read a script's header before running it.

## Pull requests

- One PR at a time, branched from an up-to-date `main`; short branch names.
- Add an entry at the **top** of `ENTRIES` in `src/content/build-log.ts` in the
  same PR: date, title, a summary a non-developer can read, `changes`,
  optional `fixes`, and `note` ("No migration." or what must be run).
- PR body: what changed and why, how it was tested, then
  `Migrations: N` and `Scope: Universal | Configurable with default | Content | Tooling | Docs`.
- Commit messages: a short imperative subject, then a body explaining why.

## Schema changes (migrations)

1. Edit `prisma/schema.prisma` and write the migration under
   `prisma/migrations/<timestamp>_<name>/migration.sql`. Generate SQL without
   touching a real database (`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <throwaway db> --script`).
2. Show the SQL to the owner. On their OK, apply locally:
   `npx prisma db execute --file <migration.sql> --schema prisma/schema.prisma`,
   then `npx prisma migrate resolve --applied <migration name>`, stop the dev
   server, `npx prisma generate`, restart.
3. Also give a **production version**: idempotent statements
   (`IF NOT EXISTS`, guarded constraints) ending in a `DO $$ … RAISE EXCEPTION`
   block that verifies the result. Never skip with `RAISE NOTICE`.
4. In the PR, tell the owner to run it on **every site** in `DEPLOYMENT.md` ›
   Sites (today Carnac and Carnac Power) before merging. They reply when done.
5. After merge and deploy, check `vercel logs <site address> --since 30m` on
   each site for `P2022` / "column … does not exist".

## Deploying

- Merging to `main` deploys every site through Vercel's GitHub integration
  (team `mayvue`, projects `carnac_ms` and `carnac-power`, region `pdx1`).
  Builds run `vercel-build` (`prisma generate && next build`) and never migrate.
- Check a deploy: `vercel ls --prod 2>&1` (from this folder for `carnac_ms`;
  for `carnac-power` set `VERCEL_ORG_ID` from `.vercel/project.json` and
  `VERCEL_PROJECT_ID=prj_JHoJkCls4oJuSwjmNWlSGIc7qXg3`).
- When the owner asks to prune: wait until both sites' production deploys are
  Ready, then `npm run vercel:prune -- --keep-rollbacks 2` (dry run, show it),
  then the same with `--yes`.
- Environment variables are set in each Vercel project, Production only:
  `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`, `PRODUCT_NAME`, `PRODUCT_LOGO`,
  optional `ANTHROPIC_API_KEY`. A new customer site follows `DEPLOYMENT.md` › A
  new customer, and is added to both its Sites table and `scripts/sites.ts`.

## Code conventions

- Read the surrounding code first and match it: naming, structure, and comment
  density. Comments explain why, in plain English.
- Asset-agnostic: no new water-specific hard-codes (`"WATERLINE"`, pipe
  diameter/length reads in the engine, "Water"/"WCI" wording). Screen words
  come from `getAssetWords`/`useAssetWords`, `getIndexWords`/`useIndexWords`
  and `getMeasureLabels`/`useMeasureLabels`; per-class specifics belong in
  settings, seed data or `src/config/starter-packs.ts`.
- Every query is scoped to the signed-in user's `organizationId`.
- Server data access lives in `src/server/`, pure domain logic in `src/domain/`,
  pages and server actions in `src/app/(app)/`.
- New Settings cards go in `src/config/settings-cards.ts` (it drives the
  Settings page, permissions and breadcrumbs). Permission defaults must equal
  what the app did before.
- Ids may be cuids or UUIDs; accept both anywhere ids are checked.
- `AssetLocation.geometry` is a PostGIS column Prisma can't see: write and read
  it with raw SQL (`src/server/geo.ts`).

## Deferred — don't start unless asked

Custom dashboards; preview/production environment separation; the remaining
water wording; per-client feature flags. See `docs/PROJECT-KNOWLEDGE.md` §6.
