-- Phase 6b: drop the columns and tables the treatment model rebuild replaced.
--
-- See docs/TREATMENT-MODEL-REBUILD.md Phase 6. Deliberately a separate release
-- from the phases that superseded these, because while the old columns still
-- held the truth, Phases 1-2 could be reverted. This is what cashes that
-- insurance in.
--
-- Every reader and writer was removed first, in the release before this one
-- and in the commit this migration belongs to. The survey was re-run rather
-- than trusted: the plan in the doc was written on 2026-09-08 and several
-- items on it had already been dealt with.
--
-- 6.5 (renaming the Decision Trees route) is NOT here. It needs a redirect and
-- a data migration over role_permissions and navigation_labels, and the doc is
-- explicit that it should not share a release with the column drops.

-- ---------------------------------------------------------------------------
-- 6.1  Applicability window -> rules
-- ---------------------------------------------------------------------------
--
-- Superseded by Treatment Rules in Phase 1 and the rule tree in Phase 5. The
-- last readers were two `orderBy` clauses, now sorting by name, and `toDef`,
-- which no longer reports a window for a stored treatment.
--
-- The JSON keys inside `applicability` go with them. `materials`,
-- `diameterMin` and `diameterMax` became rules at the same time and nothing
-- has read them since; `category`, `constraints`, `conditionResetTo` and
-- `conditionGain` stay, and are still written on every edit.
ALTER TABLE "treatments"
  DROP COLUMN "applicableConditionMin",
  DROP COLUMN "applicableConditionMax";

UPDATE "treatments"
SET "applicability" = "applicability" - 'materials' - 'diameterMin' - 'diameterMax'
WHERE "applicability" IS NOT NULL;

-- `qualifyMode` on a treatment is superseded by `ruleTree`. Both remaining
-- fallbacks (`enumerateOptions` and `getTreatmentRules`) hardcode "all", so
-- nothing consults it.
--
-- TreatmentCombination has its own qualifyMode and it is live: loadCombinations
-- reads it and enumerateOptions gates bundles on it. That one stays.
ALTER TABLE "treatments" DROP COLUMN "qualifyMode";

-- ---------------------------------------------------------------------------
-- 6.2  Cost columns -> cost rates
-- ---------------------------------------------------------------------------
--
-- Superseded by TreatmentCostRate in Phase 2. Nothing had written these since
-- that phase: `createTreatment` passes the price straight to the fallback rate,
-- `updateTreatment` deliberately skipped them, and the edit form stopped asking
-- about them. The Treatment Costs page reads the *rate's* columns, which are a
-- different table and untouched.
ALTER TABLE "treatments"
  DROP COLUMN "unitCost",
  DROP COLUMN "costUnit",
  DROP COLUMN "mobilizationCost",
  DROP COLUMN "annualMaintenanceCost";

-- ---------------------------------------------------------------------------
-- 6.3  Superseded tables
-- ---------------------------------------------------------------------------
--
-- treatment_rules held the pre-Phase-1 per-treatment rule rows; rules are now
-- organization-owned and shared through treatment_rule_links, which is a
-- different table and stays.
--
-- treatment_costs held the Initial/Maintenance pair written at create time.
--
-- Neither has been written since Phase 2. The only surviving readers were two
-- `deleteMany` calls in `deleteTreatment`, removed in this commit.
DROP TABLE IF EXISTS "treatment_rules";
DROP TABLE IF EXISTS "treatment_costs";
