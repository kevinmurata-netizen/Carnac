# Deploying CARNAC for review

Goal: a URL a coworker can log into and give feedback on, while you keep
developing locally exactly as before.

**Your local setup does not change.** `npm run dev` against local Docker
Postgres stays the same. The deployed copy is separate and only updates when
you push.

Two accounts are needed: [Neon](https://neon.tech) (Postgres) and
[Vercel](https://vercel.com). Both have free tiers that comfortably fit this
app. You will need to create these yourself.

---

## 1. Put the code on GitHub

The repo is already initialized with an initial commit. Create an **empty
private** repository on GitHub, then:

```bash
git remote add origin https://github.com/<you>/carnac.git
```

```bash
git push -u origin main
```

`.env` is gitignored, so no secrets are pushed. `.env.example` is committed as
documentation.

---

## 2. Create the database (Neon)

1. Create a Neon project. Any region near you is fine.
2. Copy the **pooled** connection string — it looks like
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.

PostGIS does not need enabling by hand: the initial migration runs
`CREATE EXTENSION IF NOT EXISTS "postgis"` and Neon permits it.

---

## 3. Load the schema and demo data

Run these from your machine, pointing at Neon for just these commands. This
does **not** touch your local database — the variable is set for that one
command only.

You are on Windows, so set it the PowerShell way. Open a **new** PowerShell
window, then **cd into the project first** — every command below depends on it:

```powershell
cd C:UsersKevinMurataDesktopcarnac
```

This matters more than it looks. Run `npx prisma` from anywhere else and npm
downloads the *latest* Prisma (7.x) instead of the 6.19.3 this project pins,
and it fails with "Could not find Prisma Schema". Confirm you have the right
one — it must print 6.19.3:

```powershell
npx prisma --version
```

Then paste the connection string once:

```powershell
$env:DATABASE_URL = "<neon-pooled-url>"
```

Everything in this section then runs against Neon. **Close that window when you
are done** so later commands go back to your local database.

```powershell
npx prisma migrate deploy
```

```powershell
npm run db:seed
```

The seed creates the organization, roles, 260 waterline assets, inspections,
condition scores, risk assessments, treatments and baseline scenarios.

---

## 4. Deploy (Vercel)

1. **Add New → Project**, import the GitHub repo. Vercel detects Next.js; leave
   the build settings alone. The `vercel-build` script in `package.json` is
   picked up automatically and runs `prisma generate && next build`. It does **not**
   touch the database — see Schema changes below for why.
2. Add three **Environment Variables**:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon pooled connection string |
   | `AUTH_SECRET` | a new random value (below) |
   | `NEXTAUTH_URL` | your deployed URL, e.g. `https://carnac.vercel.app` |

   Generate the secret:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   `NEXTAUTH_URL` is a chicken-and-egg: deploy once, copy the URL Vercel
   assigns, set the variable, then redeploy.

3. Deploy.

---

## 5. Give your coworker a login

The seeded accounts (`admin@carnac.local` and friends) share a password that is
**committed to this repo**. Do not hand that out for a public URL. Create a
fresh account instead:

```powershell
$env:DATABASE_URL = "<neon-pooled-url>"; npm run user:password -- reviewer@example.com --name "Their Name" --role AssetManager
```

It prints a strong generated password once. Roles:

| Role | Can do |
| --- | --- |
| `Administrator` | Everything, including Settings and Administration |
| `AssetManager` | Record data, run scenarios, generate work plans |
| `Inspector` | Record inspections and failures |
| `Executive` | Read-only — dashboards and reports |

`AssetManager` is the useful default for feedback: they can exercise the app
without being able to reconfigure the models underneath it.

While you are there, rotate the seeded admin account too:

```powershell
$env:DATABASE_URL = "<neon-pooled-url>"; npm run user:password -- admin@carnac.local
```

---

## Schema changes

Builds deliberately do **not** run migrations. They used to, and it broke:
when a preview and a production build overlap, both run `prisma migrate
deploy` against the same database, the second waits on the first's advisory
lock and fails with `P1002` after 10 seconds. A deploy should not be able to
fail because another deploy was in flight, or because Neon was waking up.

So when you change `schema.prisma`, apply it yourself **before** pushing:

```powershell
cd C:\Users\KevinMurata\Desktop\carnac
```

```powershell
$env:DATABASE_URL = "<neon-pooled-url>"; npm run db:deploy
```

Then push. Order matters: the new code expects the new columns, so migrating
after deploying leaves a window where the live site queries columns that do
not exist yet.

Code-only changes — the vast majority — need none of this. Just push.

---

## Continuing to develop

Keep working locally as usual. To publish:

```bash
git push
```

Vercel rebuilds and redeploys. It does not migrate — see Schema changes above.

**To avoid disrupting a review in progress**, work on a branch:

```bash
git checkout -b feature/whatever
```

```bash
git push -u origin feature/whatever
```

Vercel builds every branch to its own preview URL. `main` stays stable at the
URL your coworker uses; merge when you want them to see the change.

### Two databases

| | Local Docker | Neon |
| --- | --- | --- |
| Used by | `npm run dev` | the deployed site |
| Safe to wipe | yes | **no** — holds your coworker's session and any changes they make |

Re-running the **seed** against Neon is the destructive one: it would discard
anything they had changed.

---

## Notes and gotchas

- **Run every command from the project folder.** `npx prisma` outside it
  downloads Prisma 7 rather than the pinned 6.19.3 and cannot find the schema.

- **Setting `DATABASE_URL` inline (`DATABASE_URL="..." npm run ...`) does not
  work in PowerShell** — that is bash syntax. Use `$env:DATABASE_URL = "..."`
  first, in a window you then close.

- **Cold starts.** Neon's free tier suspends after inactivity; the first
  request can take a few seconds. Not a fault — worth warning your coworker.
- **`AUTH_SECRET` must differ from local**, and changing it later signs
  everyone out.
- **Sessions are JWTs and are not revalidated against the database**, so a role
  change or a deactivated account only takes effect after that user signs out
  and back in.
- **Re-seeding invalidates nothing but data** — user ids change, so existing
  sessions break. Rotate passwords again if you re-seed.
- **The demo data is entirely synthetic** — a fictional utility, fictional
  addresses, no real people — so exposure risk is low. It is still a public URL:
  anyone who has it reaches the login page.
