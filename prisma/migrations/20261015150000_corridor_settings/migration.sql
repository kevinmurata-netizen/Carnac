-- Corridor bundling settings: how an organization finds corridors (a distance,
-- and optionally an attribute per asset type such as a street) and what doing
-- two asset types' work together saves.
--
-- Nothing reads these yet beyond the settings page and its preview. Scenarios
-- bundle only once they opt in, so nothing existing changes.
-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN     "corridorAttribute" TEXT;

-- CreateTable
CREATE TABLE "corridor_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "windowYears" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corridor_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corridor_savings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetTypeAId" TEXT NOT NULL,
    "assetTypeBId" TEXT NOT NULL,
    "sharesMobilization" BOOLEAN NOT NULL DEFAULT false,
    "savingPct" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "corridor_savings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "corridor_settings_organizationId_key" ON "corridor_settings"("organizationId");

-- CreateIndex
CREATE INDEX "corridor_savings_organizationId_idx" ON "corridor_savings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "corridor_savings_assetTypeAId_assetTypeBId_key" ON "corridor_savings"("assetTypeAId", "assetTypeBId");

-- AddForeignKey
ALTER TABLE "corridor_savings" ADD CONSTRAINT "corridor_savings_assetTypeAId_fkey" FOREIGN KEY ("assetTypeAId") REFERENCES "asset_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corridor_savings" ADD CONSTRAINT "corridor_savings_assetTypeBId_fkey" FOREIGN KEY ("assetTypeBId") REFERENCES "asset_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

