-- What one failure of an asset costs, per asset type.
--
-- Every failure was costed as a water main's: $18,000 repair, scaled by
-- (size / 8) ^ 0.7, plus $145 for each customer served - whatever the asset
-- was. A pole's height read as a main's diameter, so a 35 ft pole's failure
-- cost about $50,600 before any customers, and its life-cycle savings were
-- inflated to match. Each type now says what its failures cost; the repair
-- part grows with size the way the type's treatment prices do.
--
-- Filled with the figures every modelled type has been costed by until now,
-- so no existing life-cycle cost or scenario changes.

-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN "failureCost" JSONB;

UPDATE "asset_types"
SET "failureCost" = '{"repairCost": 18000, "perCustomer": 145}'::jsonb
WHERE "isModelled" = true;

-- Refuse rather than change any cost: every modelled type must now carry the
-- figures it was costed by.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg("name", ', ') INTO missing
  FROM "asset_types"
  WHERE "isModelled" = true AND "failureCost" IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Modelled asset types left without their failure cost: %', missing;
  END IF;
END $$;
