-- Category funding: an ordered list of categories, each with a share of the
-- year's budget.
--
-- Split out of category_weight_sets because the two answer different questions
-- and were only sharing a table by accident of arriving together. A category
-- *weight* multiplies the Priority Score and so changes the order of the
-- ranked list. A category *funding share* changes nothing about the ranking
-- and everything about what gets bought: it says how much of the year that
-- kind of work may take, and — new here — which kind of work is bought first.
--
-- Order is the reason this is rows rather than columns. Spending is worked
-- through one category at a time, in the order someone chose, and there is no
-- honest way to express "Repair, then Rehabilitate, then Renew" in five
-- columns whose order is fixed by the schema.

-- CreateTable
CREATE TABLE "category_funding_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_funding_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
--
-- `position` carries the order the user set by dragging. Not a sort on name or
-- category, because the whole point is that the order is a decision.
CREATE TABLE "category_funding_steps" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "maxPct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,

    CONSTRAINT "category_funding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_funding_plans_organizationId_name_key" ON "category_funding_plans"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "category_funding_steps_planId_category_key" ON "category_funding_steps"("planId", "category");

-- CreateIndex
CREATE INDEX "category_funding_steps_planId_position_idx" ON "category_funding_steps"("planId", "position");

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN "categoryFundingPlanId" TEXT;

-- AlterTable
ALTER TABLE "work_plans" ADD COLUMN "categoryFundingPlanId" TEXT;

-- CreateIndex
CREATE INDEX "scenarios_categoryFundingPlanId_idx" ON "scenarios"("categoryFundingPlanId");

-- CreateIndex
CREATE INDEX "work_plans_categoryFundingPlanId_idx" ON "work_plans"("categoryFundingPlanId");

-- AddForeignKey
ALTER TABLE "category_funding_steps" ADD CONSTRAINT "category_funding_steps_planId_fkey" FOREIGN KEY ("planId") REFERENCES "category_funding_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_categoryFundingPlanId_fkey" FOREIGN KEY ("categoryFundingPlanId") REFERENCES "category_funding_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_categoryFundingPlanId_fkey" FOREIGN KEY ("categoryFundingPlanId") REFERENCES "category_funding_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Carry the caps across from the weightings that held them, so nothing set
-- yesterday is lost.
--
-- Deliberately NOT made the default. No plan at all means "one pass over the
-- whole ranked list", which is what allocation did before order existed;
-- making one of these the default would silently change what every scenario
-- funds, and an ordered plan whose first category is uncapped would hand it
-- the entire budget.
--
-- The order is Assess, Repair, Rehabilitate, Renew, Retire — cheapest and
-- least committing first, so the categories most likely to be capped are the
-- ones that spend first and the rest inherit what they leave. Anyone who wants
-- a different order drags it.
INSERT INTO "category_funding_plans" ("id", "organizationId", "name", "description", "isDefault", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    w."organizationId",
    w."name",
    'Funding shares carried over from the category weighting of the same name.',
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "category_weight_sets" w;

INSERT INTO "category_funding_steps" ("id", "planId", "category", "maxPct", "position")
SELECT gen_random_uuid()::text, p."id", s."category", s."pct", s."position"
FROM "category_funding_plans" p
JOIN "category_weight_sets" w
  ON w."organizationId" = p."organizationId" AND w."name" = p."name"
CROSS JOIN LATERAL (
    VALUES
        ('Assess',       w."assessCap",       0),
        ('Repair',       w."repairCap",       1),
        ('Rehabilitate', w."rehabilitateCap", 2),
        ('Renew',        w."renewCap",        3),
        ('Retire',       w."retireCap",       4)
) AS s("category", "pct", "position");

-- Correct the British spelling in text seeded by an earlier migration. It is
-- copy someone reads, and the code that writes it now says "program".
UPDATE "category_weight_sets"
SET "description" = REPLACE("description", 'programme', 'program')
WHERE "description" LIKE '%programme%';
