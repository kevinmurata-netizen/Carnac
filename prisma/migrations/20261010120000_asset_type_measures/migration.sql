-- Which attribute holds each measure the engine reads, per asset type.
--
-- The engine has read material, diameter, length, customers served,
-- criticality and customer type by fixed attribute codes, which are the
-- waterline's. Each asset type now says which of its own attributes plays
-- each role, so another asset class can be modelled without code naming its
-- fields.
--
-- Every waterline type gets exactly the codes the engine used, so nothing it
-- computes changes. Other types get nothing: a role with no attribute reads as
-- unknown, as a blank field always has.

-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN "measures" JSONB;

UPDATE "asset_types"
SET "measures" = '{
  "material": "MATERIAL",
  "diameter": "DIAMETER",
  "length": "LENGTH",
  "customersServed": "CUSTOMERS_SERVED",
  "criticality": "CRITICALITY",
  "customerType": "CUSTOMER_TYPE"
}'::jsonb
WHERE "code" = 'WATERLINE';

-- Refuse rather than leave a modelled type silently reading nothing: every
-- modelled type with assets must have come out of this with its measures.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t."name", ', ') INTO missing
  FROM "asset_types" t
  WHERE t."isModelled" = true
    AND t."measures" IS NULL
    AND EXISTS (SELECT 1 FROM "assets" a WHERE a."assetTypeId" = t."id");
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Modelled asset types left without measures: %', missing;
  END IF;

  -- And every code a type's measures name must be one of its attributes, or
  -- that measure would read as unknown on every asset and change results.
  SELECT string_agg(t."name" || ' ' || m.value, ', ') INTO missing
  FROM "asset_types" t
  CROSS JOIN LATERAL jsonb_each_text(t."measures") m
  WHERE t."measures" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "assets" a WHERE a."assetTypeId" = t."id")
    AND NOT EXISTS (
      SELECT 1 FROM "asset_attribute_definitions" d
      WHERE d."assetTypeId" = t."id" AND d."code" = m.value
    );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Measures name attributes these asset types do not have: %', missing;
  END IF;
END $$;
