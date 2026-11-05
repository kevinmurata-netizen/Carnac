# Carnac

Asset management and decision support for utilities: inventory, inspections,
condition, deterioration, risk, treatments, budget scenarios and work plans.
One codebase, deployed per customer under a product name per asset class —
Hydrocore (water) and Powercore (power).

- **Run it locally, check it, ship it:** `AGENTS.md`
- **Sites, decisions, history, open items:** `docs/PROJECT-KNOWLEDGE.md`
- **Deploying, migrations, new customers:** `DEPLOYMENT.md`
- **Moving development to Codex:** `HANDOFF.md`
- **Original product specification:** `docs/SPEC.md`

Quick start (Node 24 and Docker Desktop):

```bash
npm install
```

```bash
docker compose up -d
```

```bash
npm run dev
```

A fresh database first needs `npx prisma migrate deploy` and `npm run db:seed`
(local only — the seed deletes everything). See `AGENTS.md`.
