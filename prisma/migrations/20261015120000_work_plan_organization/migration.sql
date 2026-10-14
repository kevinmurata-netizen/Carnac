-- Which organization each work plan belongs to.
--
-- A work plan had no organization of its own: one made from a scenario
-- reached it through the scenario, and one made any other way - generated,
-- imported, or left behind when its scenario was deleted - reached none.
-- Every list and lookup read every plan in the database, so a second
-- organization on the same site saw the first's plans.
--
-- Filled from what each plan already points at: its scenario's
-- organization, else the organization of the assets in it, else - where the
-- site has only one organization - that one.

-- AlterTable
ALTER TABLE "work_plans" ADD COLUMN "organizationId" TEXT;

UPDATE "work_plans" w
SET "organizationId" = s."organizationId"
FROM "scenarios" s
WHERE w."scenarioId" = s."id";

UPDATE "work_plans" w
SET "organizationId" = owners."organizationId"
FROM (
  SELECT i."workPlanId", MIN(a."organizationId") AS "organizationId"
  FROM "work_plan_items" i
  JOIN "assets" a ON a."id" = i."assetId"
  GROUP BY i."workPlanId"
  HAVING COUNT(DISTINCT a."organizationId") = 1
) owners
WHERE w."id" = owners."workPlanId" AND w."organizationId" IS NULL;

UPDATE "work_plans"
SET "organizationId" = (SELECT "id" FROM "organizations")
WHERE "organizationId" IS NULL
  AND (SELECT COUNT(*) FROM "organizations") = 1;

-- Refuse rather than guess: every plan must have found its organization.
DO $$
DECLARE
  orphans TEXT;
BEGIN
  SELECT string_agg("name", ', ') INTO orphans FROM "work_plans" WHERE "organizationId" IS NULL;
  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Work plans whose organization could not be worked out: %', orphans;
  END IF;
END $$;

ALTER TABLE "work_plans" ALTER COLUMN "organizationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "work_plans_organizationId_idx" ON "work_plans"("organizationId");
