-- The part a treatment plays for its asset type, where it plays one.
--
-- Two treatments were found by name: "Replacement", the planned renewal that
-- every life-cycle cost comparison is measured against, and "Inspection", the
-- only thing offered on an asset whose condition is unknown. A type with no
-- treatment of that name fell back to the waterline's built-in Replacement,
-- which priced a reservoir as a pipe. Each type now marks its own.
--
-- Every treatment named "Replacement" or "Inspection" gets that role, so
-- nothing the engine does changes.

-- AlterTable
ALTER TABLE "treatments" ADD COLUMN "role" TEXT;

UPDATE "treatments" SET "role" = 'replacement' WHERE "name" = 'Replacement';
UPDATE "treatments" SET "role" = 'inspection' WHERE "name" = 'Inspection';

-- Refuse rather than leave a modelled type silently without a baseline: a
-- modelled type with assets and treatments must have its replacement, and no
-- type may have two treatments playing the same role.
DO $$
DECLARE
  problem TEXT;
BEGIN
  SELECT string_agg(t."name", ', ') INTO problem
  FROM "asset_types" t
  WHERE t."isModelled" = true
    AND EXISTS (SELECT 1 FROM "assets" a WHERE a."assetTypeId" = t."id")
    AND EXISTS (SELECT 1 FROM "treatments" x WHERE x."assetTypeId" = t."id")
    AND NOT EXISTS (SELECT 1 FROM "treatments" x WHERE x."assetTypeId" = t."id" AND x."role" = 'replacement');
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'Modelled asset types with treatments but no Replacement: %', problem;
  END IF;

  SELECT string_agg(d.label, ', ') INTO problem
  FROM (
    SELECT t."name" || ' (' || x."role" || ')' AS label
    FROM "treatments" x
    JOIN "asset_types" t ON t."id" = x."assetTypeId"
    WHERE x."role" IS NOT NULL
    GROUP BY t."name", x."assetTypeId", x."role"
    HAVING count(*) > 1
  ) d;
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'Asset types with more than one treatment in the same role: %', problem;
  END IF;
END $$;
