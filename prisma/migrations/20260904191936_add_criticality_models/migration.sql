-- CreateTable
CREATE TABLE "criticality_models" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "valueMaps" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "criticality_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "criticality_models_assetTypeId_name_key" ON "criticality_models"("assetTypeId", "name");

-- AddForeignKey
ALTER TABLE "criticality_models" ADD CONSTRAINT "criticality_models_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
