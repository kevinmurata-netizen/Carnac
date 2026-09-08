-- Named, reusable objective weights.
--
-- The weights were previously four numbers typed into the Generate Work Plan
-- form per run, defaulted from a constant and stored nowhere. This gives them
-- an identity, a place to live, and — on work_plans — a record of which set
-- produced a given plan.

-- CreateTable
CREATE TABLE "scenario_weight_sets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "conditionImprovement" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "riskReduction" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "lifeCycleCost" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "criticality" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_weight_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scenario_weight_sets_organizationId_name_key" ON "scenario_weight_sets"("organizationId", "name");

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN "weightSetId" TEXT;

-- AlterTable
ALTER TABLE "work_plans" ADD COLUMN "weightSetId" TEXT,
ADD COLUMN "objectiveWeights" JSONB;

-- CreateIndex
CREATE INDEX "scenarios_weightSetId_idx" ON "scenarios"("weightSetId");

-- CreateIndex
CREATE INDEX "work_plans_weightSetId_idx" ON "work_plans"("weightSetId");

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_weightSetId_fkey" FOREIGN KEY ("weightSetId") REFERENCES "scenario_weight_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_weightSetId_fkey" FOREIGN KEY ("weightSetId") REFERENCES "scenario_weight_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the shipped defaults as a real, named row, one per organization.
--
-- Without this the dropdown would open empty on a system that has been
-- generating work plans happily for months, and "no set chosen" would have to
-- mean a hidden constant. The values are DEFAULT_WEIGHTS from optimization.ts,
-- so nothing about today's ranking changes.
INSERT INTO "scenario_weight_sets" (
    "id", "organizationId", "name", "description",
    "conditionImprovement", "riskReduction", "lifeCycleCost", "criticality",
    "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    o."id",
    'Balanced',
    'Condition 30, risk 40, life-cycle 20, criticality 10 — the weighting every work plan used before named sets existed.',
    0.3, 0.4, 0.2, 0.1,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "organizations" o;

-- Two more starting points, so the dropdown demonstrates what it is for rather
-- than offering a single entry and no reason to look at it. Neither is the
-- default; both are ordinary rows anyone can edit or delete.
INSERT INTO "scenario_weight_sets" (
    "id", "organizationId", "name", "description",
    "conditionImprovement", "riskReduction", "lifeCycleCost", "criticality",
    "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    o."id",
    'Risk First',
    'Chase risk reduction above all else — what a system under regulatory pressure funds.',
    0.15, 0.65, 0.1, 0.1,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "organizations" o;

INSERT INTO "scenario_weight_sets" (
    "id", "organizationId", "name", "description",
    "conditionImprovement", "riskReduction", "lifeCycleCost", "criticality",
    "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    o."id",
    'Lowest Life-Cycle Cost',
    'Spend where it avoids the most future cost, regardless of how it looks today.',
    0.15, 0.2, 0.55, 0.1,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "organizations" o;
