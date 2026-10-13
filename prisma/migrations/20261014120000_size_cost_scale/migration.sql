-- How a treatment's price grows with an asset's size, per asset type.
--
-- Every price was multiplied by (size / 8) ^ 0.7 — larger water mains cost
-- disproportionately more, normalized to an 8" main — whatever the asset was.
-- A pole's height read as a 35" main and its work cost 2.8 times its rate.
-- Each type now says whether its size moves price, and how; empty means it
-- does not.
--
-- Filled with the factor every modelled type has been priced by until now,
-- so no existing price changes.

-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN "sizeCostScale" JSONB;

UPDATE "asset_types"
SET "sizeCostScale" = '{"reference": 8, "exponent": 0.7}'::jsonb
WHERE "isModelled" = true;

-- Refuse rather than change prices: every modelled type must now carry the
-- factor it was priced by.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg("name", ', ') INTO missing
  FROM "asset_types"
  WHERE "isModelled" = true AND "sizeCostScale" IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Modelled asset types left without their size cost factor: %', missing;
  END IF;
END $$;
