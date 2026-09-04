-- Roles gain a stable code so their display name can be renamed freely.
--
-- Added nullable and backfilled before being made NOT NULL: the table already
-- has rows, and a required column with no default cannot be added in one step.

ALTER TABLE "roles" ADD COLUMN "code" TEXT;
ALTER TABLE "roles" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- The four seeded roles, matched on the names they were seeded with. Both
-- spellings of the asset-manager role are covered because the seed's display
-- name changed while existing databases kept the original.
UPDATE "roles" SET "code" = 'ADMINISTRATOR', "isSystem" = true WHERE "name" = 'Administrator';
UPDATE "roles" SET "code" = 'ASSET_MANAGER', "isSystem" = true WHERE "name" IN ('AssetManager', 'Asset Manager');
UPDATE "roles" SET "code" = 'INSPECTOR',     "isSystem" = true WHERE "name" = 'Inspector';
UPDATE "roles" SET "code" = 'EXECUTIVE',     "isSystem" = true WHERE "name" = 'Executive';

-- Any other role predates this column and is not one the code reasons about,
-- so it gets a code derived from its own id: unique by construction, and it
-- cannot collide with the reserved names above.
UPDATE "roles"
SET "code" = 'ROLE_' || upper(regexp_replace("id", '[^a-zA-Z0-9]', '', 'g'))
WHERE "code" IS NULL;

ALTER TABLE "roles" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
