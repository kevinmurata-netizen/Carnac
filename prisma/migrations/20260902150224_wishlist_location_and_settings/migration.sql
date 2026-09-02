-- AlterTable
ALTER TABLE "wishlist_items" ADD COLUMN     "location" TEXT;

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organizationId_key_key" ON "organization_settings"("organizationId", "key");

-- CreateIndex
CREATE INDEX "wishlist_items_organizationId_location_idx" ON "wishlist_items"("organizationId", "location");
