-- Scale Factor: a user-written formula for how big a piece of work an asset is.
--
-- Same language and same fields as a criticality formula, evaluated by the
-- same code. The difference is the range — criticality is a 0-100 rating,
-- a scale factor is an unbounded multiplier.

-- CreateTable
CREATE TABLE "scale_factor_models" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "valueMaps" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scale_factor_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scale_factor_models_assetTypeId_name_key" ON "scale_factor_models"("assetTypeId", "name");

-- AddForeignKey
ALTER TABLE "scale_factor_models" ADD CONSTRAINT "scale_factor_models_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed segment length as the active formula, per asset type.
--
-- This is what makes the Priority Score change that follows neutral on the day
-- it ships. The new formula divides by total cost and multiplies by the scale
-- factor; with the scale factor set to LENGTH those two together reproduce the
-- cost-per-foot behaviour the ranking has today. An organization that wants
-- something else can then say so deliberately, rather than discovering the
-- ranking moved underneath it.
INSERT INTO "scale_factor_models" ("id", "assetTypeId", "name", "expression", "valueMaps", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    t."id",
    'Segment length',
    'LENGTH',
    '{}'::jsonb,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "asset_types" t
WHERE t."code" = 'WATERLINE';
