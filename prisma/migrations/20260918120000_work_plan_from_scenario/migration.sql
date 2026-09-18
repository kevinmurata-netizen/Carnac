-- A work plan can now be an editable copy made from a scenario, alongside the
-- mirror a scenario run writes for itself.
--
-- `isScenarioMirror` marks the latter. A run replaces its own mirror wholesale
-- every time it runs, so nothing edited there survives; an editable plan made
-- from the same scenario carries this false and is left alone.
--
-- `annualBudget` and `fundingGrowth` freeze the money the plan was built
-- against, so a year can be shown as over or under budget after work is moved
-- between years — the scenario's own budget may be edited later.
ALTER TABLE "work_plans"
  ADD COLUMN "isScenarioMirror" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "annualBudget" DOUBLE PRECISION,
  ADD COLUMN "fundingGrowth" DOUBLE PRECISION;

-- Every plan that exists today and names a scenario is one of those mirrors:
-- until now that was the only way a plan came to carry a scenarioId.
UPDATE "work_plans" SET "isScenarioMirror" = true WHERE "scenarioId" IS NOT NULL;
