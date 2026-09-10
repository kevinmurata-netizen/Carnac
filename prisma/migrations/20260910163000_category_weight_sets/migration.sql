-- Named, reusable weights per treatment category.
--
-- The Priority Score is becoming
--   Criticality x Scale Factor x Category Weight x Expected Benefit / Total Cost
-- and this table supplies the third term. It says how much a utility wants to
-- lean toward one kind of work: a system rebuilding its trunk mains weights
-- Renew up, a system buying time until a bond passes weights Repair up.
--
-- Deliberately NOT normalized, unlike scenario_weight_sets. Those four numbers
-- are shares of one ranking and 3/4/2/1 must rank the same as 30/40/20/10.
-- These are multipliers applied to a score, so 1 has to mean "leave this
-- category alone" and 1.5 has to mean "worth half again as much". Normalizing
-- would make both statements untrue.

-- CreateTable
CREATE TABLE "category_weight_sets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    -- One column per TreatmentCategory in domain/waterline/treatment.ts. A
    -- closed set defined in code, so columns rather than a JSON map: a typo in
    -- a key would be a silent neutral weight instead of a compile error.
    "assess" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "repair" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rehabilitate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "renew" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "retire" DOUBLE PRECISION NOT NULL DEFAULT 1,

    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_weight_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_weight_sets_organizationId_name_key" ON "category_weight_sets"("organizationId", "name");

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN "categoryWeightSetId" TEXT;

-- AlterTable
ALTER TABLE "work_plans" ADD COLUMN "categoryWeightSetId" TEXT,
ADD COLUMN "categoryWeights" JSONB;

-- CreateIndex
CREATE INDEX "scenarios_categoryWeightSetId_idx" ON "scenarios"("categoryWeightSetId");

-- CreateIndex
CREATE INDEX "work_plans_categoryWeightSetId_idx" ON "work_plans"("categoryWeightSetId");

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_categoryWeightSetId_fkey" FOREIGN KEY ("categoryWeightSetId") REFERENCES "category_weight_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_categoryWeightSetId_fkey" FOREIGN KEY ("categoryWeightSetId") REFERENCES "category_weight_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed a neutral set as the default, one per organization.
--
-- All ones is exactly what the ranking did before category weights existed, so
-- installing this changes nothing. It exists so the dropdown opens with
-- something in it and so the neutral position is a row someone can look at and
-- copy, rather than a constant hidden in the code.
INSERT INTO "category_weight_sets" (
    "id", "organizationId", "name", "description",
    "assess", "repair", "rehabilitate", "renew", "retire",
    "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    o."id",
    'Even-handed',
    'Every category counts the same. What the ranking did before category weights existed.',
    1, 1, 1, 1, 1,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "organizations" o;

-- Two worked examples, neither default, both ordinary rows anyone can edit or
-- delete. A single neutral entry would show the dropdown but not what it is
-- for.
INSERT INTO "category_weight_sets" (
    "id", "organizationId", "name", "description",
    "assess", "repair", "rehabilitate", "renew", "retire",
    "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    o."id",
    'Renewal Push',
    'Favour replacing over patching — what a capital programme funds when it has decided to get ahead of the backlog.',
    0.8, 0.6, 1.1, 1.6, 1,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "organizations" o;

INSERT INTO "category_weight_sets" (
    "id", "organizationId", "name", "description",
    "assess", "repair", "rehabilitate", "renew", "retire",
    "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    o."id",
    'Buy Time',
    'Favour cheap work that defers the big spend — what a system funds while it waits on a bond.',
    1.3, 1.5, 1.2, 0.5, 1,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "organizations" o;
