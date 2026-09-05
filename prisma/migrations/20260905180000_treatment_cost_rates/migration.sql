-- CreateTable
CREATE TABLE "treatment_cost_rates" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ruleId" TEXT,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "costUnit" TEXT NOT NULL,
    "mobilizationCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualMaintenanceCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_cost_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_cost_rates_ruleId_idx" ON "treatment_cost_rates"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_cost_rates_treatmentId_name_key" ON "treatment_cost_rates"("treatmentId", "name");

-- AddForeignKey
ALTER TABLE "treatment_cost_rates" ADD CONSTRAINT "treatment_cost_rates_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_cost_rates" ADD CONSTRAINT "treatment_cost_rates_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Phase 2 of the treatment model rebuild (docs/TREATMENT-MODEL-REBUILD.md).
--
-- A treatment's price stops being four columns on the treatment and becomes a
-- list of rates, each with a rule saying when it applies — so "Replacement
-- costs $340/LF in District 3 and $290/LF elsewhere" is expressible without
-- inventing a second Replacement.
--
-- Every treatment gets exactly one rate to begin with, named "Standard",
-- carrying no rule: the fallback that applies to anything the rates above it
-- do not claim. That is precisely what the columns meant, so nothing is priced
-- differently today. Check with `npm run qa:matrix` before and after — the
-- cost of every qualifying pair must be unchanged.
--
-- This is a NEW table rather than a reshaping of `treatment_costs`, which the
-- doc originally proposed. `treatment_costs` is still written by the release
-- running right now (ensureTreatments and createTreatment both insert into
-- it), and adding NOT NULL columns to a table the old code inserts into would
-- break it in the window between this migration and the deploy. Nothing reads
-- `treatment_costs`; Phase 6 drops it.
-- ============================================================================

INSERT INTO "treatment_cost_rates" (
  "id", "treatmentId", "name", "sortOrder", "ruleId",
  "unitCost", "costUnit", "mobilizationCost", "annualMaintenanceCost",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  t.id,
  'Standard',
  0,
  NULL,
  -- The same fallbacks toDef() applies when reading these columns, so a
  -- treatment with a null cost is priced at zero here exactly as it was
  -- priced at zero before.
  COALESCE(t."unitCost", 0),
  COALESCE(t."costUnit", 'per each'),
  COALESCE(t."mobilizationCost", 0),
  COALESCE(t."annualMaintenanceCost", 0),
  NOW(),
  NOW()
FROM "treatments" t;
