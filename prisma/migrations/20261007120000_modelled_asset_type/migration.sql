-- Which asset type the engine models, as a setting on the asset type rather
-- than its code hard-wired into the application. Additive: one column with a
-- default, then the existing water line type marked as the modelled one, so
-- nothing changes in what the app does.
--
-- Fails loudly rather than leaving an organization with nothing modelled: an
-- organization that has assets but no WATERLINE type would otherwise have
-- every scenario, plan and settings page silently go empty.

-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN "isModelled" BOOLEAN NOT NULL DEFAULT false;

-- The type every query selected by code until now.
UPDATE "asset_types" SET "isModelled" = true WHERE "code" = 'WATERLINE';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "organizations" o
    WHERE EXISTS (SELECT 1 FROM "assets" a WHERE a."organizationId" = o."id")
      AND NOT EXISTS (SELECT 1 FROM "asset_types" t WHERE t."organizationId" = o."id" AND t."isModelled")
  ) THEN
    RAISE EXCEPTION 'An organization with assets has no WATERLINE asset type to mark as modelled';
  END IF;
END $$;
