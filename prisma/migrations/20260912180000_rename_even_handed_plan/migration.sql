-- "Even-handed" was not.
--
-- The funding plans in 20260911090000 were carried over from the category
-- weightings of the same name, and the names came with them. On a weighting,
-- "Even-handed" is accurate: every category multiplies the Priority Score by
-- 1, so nothing leans. That row keeps its name.
--
-- On a funding plan it is the opposite of accurate. A plan is walked in order,
-- and a category at 100% takes whatever it can before the next is reached, so
-- a plan listing every category at 100% is not "even" -- it is "the first
-- category, exhaustively". Measured on the seed network: 85% rehabilitation
-- and 2% renewal, against 56% renewal with no plan at all.
--
-- No reordering fixes that, which is the point. Whichever category goes first
-- gets first refusal on the whole year, so changing the order only moves which
-- one monopolises. The genuinely even-handed option is not a plan at all --
-- choosing no category order makes one pass down the ranked list with category
-- playing no part, and that is still there on the scenario dropdown.
--
-- So the name changes to describe what the plan does. The shares are left
-- exactly as they are: someone may be relying on them, and this migration is
-- about the label being wrong, not the numbers.
UPDATE "category_funding_plans"
SET
    "name" = 'Repair first, uncapped',
    "description" = 'Every category uncapped, funded in order — so repair takes what it can before anything else is reached. Not even-handed despite where it came from: for that, choose no category order at all.'
WHERE "name" = 'Even-handed'
  AND NOT EXISTS (
    SELECT 1 FROM "category_funding_plans" clash
    WHERE clash."organizationId" = "category_funding_plans"."organizationId"
      AND clash."name" = 'Repair first, uncapped'
  );
