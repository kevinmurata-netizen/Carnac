-- An asset type's code is unique within its organization, not across the site.
--
-- The code was unique over the whole database, so two organizations on the
-- same site could not both have, say, a POLE type: the second was refused
-- because the first existed. Each organization now names its own types.
--
-- Nothing to backfill: codes unique across the site are unique within each
-- organization already.

-- DropIndex
DROP INDEX "asset_types_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "asset_types_organizationId_code_key" ON "asset_types"("organizationId", "code");
