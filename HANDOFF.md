# Handing Carnac to Codex

Step-by-step instructions for moving development of Carnac from Claude Code to
OpenAI's Codex. Written 5 November 2026.

**Short version:** there is nothing to copy or migrate. The code, history and
deploys stay where they are (GitHub, Vercel, Neon), and so do your local setup
and signed-in tools on this PC. What has changed is that everything Claude kept
in its own notes is now in the repository, where Codex reads it:

| File | For | What it holds |
| --- | --- | --- |
| `AGENTS.md` | Codex, every session | How to run, check, ship and deploy; the hard safety rules |
| `docs/PROJECT-KNOWLEDGE.md` | Codex and you | Sites, accounts, past incidents, product decisions, open items |
| `DEPLOYMENT.md` | You | The runbook: sites, migrations, new customers (unchanged) |
| `HANDOFF.md` | You | This file |

Codex reads `AGENTS.md` automatically. It does **not** read `CLAUDE.md`, which
only points at `AGENTS.md` anyway; leave it, since `next dev` re-creates it.

Total time: about 30 minutes.

---

## Part 1 — Tidy up before switching (10 min)

1. **Merge the handoff pull request** (the one that added this file), so
   `main` carries the instructions Codex will read.

   ```powershell
   cd C:\Users\KevinMurata\Desktop\carnac
   ```

   ```powershell
   git switch main
   ```

   ```powershell
   git pull
   ```

2. **Delete the stale `.env.production.local`** in the project folder. It was
   made by `vercel env pull` on 25 September; its database address is only
   Vercel's `[SENSITIVE]` placeholder, so it makes `npm run build` fail with
   "Invalid URL" (which Codex's first check in Part 4 runs), and it may hold
   real keys. Nothing uses it.

   ```powershell
   Remove-Item .env.production.local
   ```

   The two old pull requests from 14 October, #166 and #167 (signing out
   deactivated users), were finished and merged on 5 November.

3. **Optional — Powercore's sample scenario set.** Sign in to
   https://carnac-power.vercel.app as an Administrator, open **Settings › Asset
   Types › Add from a starter pack**, and click **Load the sample scenario set**.

4. **Optional — local clean-up.** A throwaway test database (`carnac_settest`)
   and four test waterlines (`LS-TEST-1` to `LS-TEST-4`) are still in your
   local Docker database. Harmless; Codex can remove them if you ask it to.

5. **Consider making the GitHub repository private.** It is public today, and
   the seed accounts' password is committed (`prisma/seed.ts`). Nothing else
   secret is in it. GitHub › the repository › Settings › General › Danger Zone ›
   Change visibility. Afterwards, merge any small change and confirm both
   sites still deploy.

6. **Optional — save Claude's design pages.** Two planning pages were made as
   claude.ai artifacts (the asset-agnostic plan and the cross-asset design).
   Their decisions are summarised in `docs/PROJECT-KNOWLEDGE.md` §6; if you want
   the originals, open them in claude.ai and save them as PDF into `docs/`.

---

## Part 2 — Accounts (5 min)

You need a **ChatGPT plan that includes Codex**. Nothing else is new:

- **GitHub** (`kevinmurata-netizen/Carnac`), **Vercel** (team `mayvue`) and
  **Neon** (organization `org-proud-term-65693134`) stay as they are.
- The `gh` and `vercel` command-line tools are already signed in on this PC.
  Codex running here uses them as you; it never needs their passwords.
- **Never paste a connection string, password or API key into Codex.** The
  same rule as before: you copy secrets from Neon or Vercel into the place that
  needs them yourself.

---

## Part 3 — Install Codex on this PC (10 min) — recommended

Run Codex **locally**, in the project folder. This project's development
database runs in Docker on this machine, and the app can't be built or run
without it, so the local setup is where Codex can do everything Claude did.

Pick one:

**A. In VS Code (easiest)**

1. Install the **Codex** extension (publisher OpenAI) from the VS Code
   Marketplace: https://marketplace.visualstudio.com/items?itemName=openai.chatgpt
2. **File › Open Folder** › `C:\Users\KevinMurata\Desktop\carnac`.
3. Click the Codex icon in the sidebar (or Command Palette › *Codex: Open Codex
   Sidebar*) and sign in with your ChatGPT account.

**B. In a terminal (the Codex CLI)**

1. Install it as described at https://learn.chatgpt.com/docs/codex/cli (the
   page has Windows, npm and other options).
2. In PowerShell:

   ```powershell
   cd C:\Users\KevinMurata\Desktop\carnac
   ```

   ```powershell
   codex
   ```

3. Choose **Sign in with ChatGPT** the first time.

**Permissions.** Codex runs natively on Windows inside its own sandbox (your
Windows 11 build is new enough). Keep its default for a Git folder ("Auto":
it may edit files in the project and asks before anything else). It will ask
before using the network or running tools such as `npm install`, `docker`,
`gh` and `vercel` — approve those for this project as they come up. Do **not**
switch on the "full access" / bypass-approvals mode; the approval prompts are
what stop an accidental production change.

**Before each working session**, start Docker Desktop. If it won't start, the
fix is in `docs/PROJECT-KNOWLEDGE.md` §5.

---

## Part 4 — First session: let Codex check its setup (5 min)

Paste this as your first message to Codex:

> Read AGENTS.md, docs/PROJECT-KNOWLEDGE.md and DEPLOYMENT.md. Then check the
> local setup without changing any data: confirm Docker's carnac-db and
> carnac-wsproxy containers are running, run the typecheck, lint and build from
> AGENTS.md, start the dev server, and confirm the home page loads after signing
> in with the seed admin account. Report what passed and what didn't. Don't
> reseed, migrate or touch any production database.

If everything passes, Codex is ready. A good first real task is one of the open
items in `docs/PROJECT-KNOWLEDGE.md` §7.

---

## Part 5 — Working with Codex day to day

The workflow is the same one used with Claude; it's written into `AGENTS.md`,
so Codex follows it without being told:

1. You describe the change. Codex branches from `main`, makes it, adds a
   build-log entry, runs the typecheck, lint and build, tests it in the
   browser, and opens a pull request stating `Migrations:` and `Scope:`.
2. **No migration:** say **"merge N"**. Codex merges and pulls. Both sites
   deploy within a couple of minutes.
3. **With a migration:** Codex shows you the SQL. You run it on **every site's**
   database yourself, following `DEPLOYMENT.md` › Schema changes (check the
   window's target with `$env:DATABASE_URL -match "ep-…"` first). Then say
   **"migration ran, merge N"**. Afterwards ask Codex to check the production
   logs for missing-column errors.
4. To tidy Vercel: **"prune the deployments once it deploys"**.

Things Codex should never do, and you should refuse if it asks: write to a
production database, see a secret, reseed anything but the local database, or
push straight to `main`.

---

## Part 6 — Optional: Codex in the cloud

Codex can also work on tasks in OpenAI's cloud, from chatgpt.com/codex, and
open pull requests on GitHub. It's handy for code-only changes away from this
PC, but with a real limit for this project: **a cloud task has no database**,
so it can typecheck and lint but not build or run the app (the build needs a
database). Test its branches here before merging.

To set it up:

1. In Codex on the web, connect GitHub when prompted and allow access to
   `kevinmurata-netizen/Carnac`.
2. Create an environment for the repository. As the setup (install) script:

   ```bash
   npm ci
   ```

   That also runs `prisma generate`. Choose Node 24 if the environment lets you
   pin package versions.
3. Add **no** environment variables or secrets. In particular, never give a
   cloud environment a production `DATABASE_URL`.
4. Leave internet access off for the agent; it only needs the network while
   installing.

Then pull a cloud task's branch here to test it:

```powershell
git fetch
```

```powershell
git switch <branch name>
```

---

## Part 7 — Optional: give Codex read-only database access

Claude could run read-only queries on the production databases through Neon's
connector, for example to size the sample scenario set. Codex can do the same
through an MCP server, configured in `%USERPROFILE%\.codex\config.toml` (see
https://learn.chatgpt.com/codex/extend/mcp and Neon's MCP documentation).
Skip it unless you miss it. If you set it up, use read-only access if Neon
offers it, and the rule still stands: Codex never writes to production.

---

## What does not carry over

- **Claude's notes** — moved into `docs/PROJECT-KNOWLEDGE.md` and `AGENTS.md`.
- **Claude's permission list** (`.claude/settings.local.json`, not in Git) —
  Codex has its own approval prompts.
- **Conversation history** — not needed; pull requests and the build log
  (`src/content/build-log.ts`, shown in the app) are the record of what was
  done and why.

Nothing needs uninstalling. Claude Code and Codex can both be pointed at this
folder; just don't run them on the same branch at the same time.
