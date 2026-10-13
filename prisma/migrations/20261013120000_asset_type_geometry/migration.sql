-- How each asset type's assets are drawn and placed: as lines or as points.
--
-- The map showed "everything that is not a waterline" as point facilities,
-- and an import always drew a stand-in line, whatever was being imported.
-- Each type now says which it is, so a pole or a transformer is a point and a
-- span of cable a line without code naming either.
--
-- Filled from what each type's assets already are: a type with any line is a
-- line type (the waterline), every other type a point type, as they are drawn
-- today.

-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN "geometry" TEXT NOT NULL DEFAULT 'point';

UPDATE "asset_types" t
SET "geometry" = 'line'
WHERE EXISTS (
  SELECT 1
  FROM "assets" a
  JOIN "asset_locations" l ON l."assetId" = a."id"
  WHERE a."assetTypeId" = t."id"
    AND ST_GeometryType(l."geometry") IN ('ST_LineString', 'ST_MultiLineString')
);

-- Refuse rather than leave the map drawing a modelled network wrongly: every
-- type whose located assets are lines must have come out as a line type, and
-- every point-only type as a point type.
DO $$
DECLARE
  problem TEXT;
BEGIN
  SELECT string_agg(t."name" || ' (' || t."geometry" || ')', ', ') INTO problem
  FROM "asset_types" t
  WHERE EXISTS (
      SELECT 1 FROM "assets" a JOIN "asset_locations" l ON l."assetId" = a."id"
      WHERE a."assetTypeId" = t."id"
    )
    AND NOT EXISTS (
      SELECT 1 FROM "assets" a JOIN "asset_locations" l ON l."assetId" = a."id"
      WHERE a."assetTypeId" = t."id"
        AND (CASE WHEN ST_GeometryType(l."geometry") IN ('ST_LineString', 'ST_MultiLineString')
                  THEN 'line' ELSE 'point' END) = t."geometry"
    );
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION 'Asset types whose geometry matches none of their assets: %', problem;
  END IF;
END $$;
