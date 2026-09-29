-- Component-level asset tracking, after AASHTO's National Bridge Elements: an
-- asset is made of components, each tracked and inspected on its own.
--
-- Additive only. Three new tables, four nullable columns on existing ones,
-- and indexes. Nothing existing changes meaning: a null assetComponentId is a
-- whole-asset row, which is every row that exists today.
--
-- Component history is not deleted or reattached silently. Every link from a
-- history row (inspection, condition, risk) or a component form to a
-- component is ON DELETE RESTRICT, so a component with history cannot be
-- deleted - setting those links to null would quietly make a coating's
-- findings read as the whole asset's.
--
-- GIN (jsonb_path_ops) on asset_components.attributes serves containment
-- queries - attributes @> '{"material":"Steel"}'. It does not serve numeric
-- ranges; those would need an expression index on the specific key.
-- AlterTable
ALTER TABLE "inspection_templates" ADD COLUMN     "componentTypeId" TEXT;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "assetComponentId" TEXT;

-- AlterTable
ALTER TABLE "condition_measurements" ADD COLUMN     "assetComponentId" TEXT;

-- AlterTable
ALTER TABLE "risk_assessments" ADD COLUMN     "assetComponentId" TEXT;

-- CreateTable
CREATE TABLE "component_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributeSchema" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_type_component_types" (
    "assetTypeId" TEXT NOT NULL,
    "componentTypeId" TEXT NOT NULL,
    "defaultCostWeight" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "asset_type_component_types_pkey" PRIMARY KEY ("assetTypeId","componentTypeId")
);

-- CreateTable
CREATE TABLE "asset_components" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "componentTypeId" TEXT NOT NULL,
    "label" TEXT,
    "installationDate" TIMESTAMP(3),
    "replacementCost" DOUBLE PRECISION,
    "conditionScore" DOUBLE PRECISION,
    "riskScore" DOUBLE PRECISION,
    "scoresAsOf" TIMESTAMP(3),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "component_types_organizationId_code_key" ON "component_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "asset_components_assetId_idx" ON "asset_components"("assetId");

-- CreateIndex
CREATE INDEX "asset_components_componentTypeId_idx" ON "asset_components"("componentTypeId");

-- CreateIndex
CREATE INDEX "asset_components_attributes_idx" ON "asset_components" USING GIN ("attributes" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "inspections_assetComponentId_idx" ON "inspections"("assetComponentId");

-- CreateIndex
CREATE INDEX "condition_measurements_assetComponentId_idx" ON "condition_measurements"("assetComponentId");

-- CreateIndex
CREATE INDEX "risk_assessments_assetComponentId_idx" ON "risk_assessments"("assetComponentId");

-- AddForeignKey
ALTER TABLE "component_types" ADD CONSTRAINT "component_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_type_component_types" ADD CONSTRAINT "asset_type_component_types_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_type_component_types" ADD CONSTRAINT "asset_type_component_types_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "component_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_components" ADD CONSTRAINT "asset_components_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_components" ADD CONSTRAINT "asset_components_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "component_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "component_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_assetComponentId_fkey" FOREIGN KEY ("assetComponentId") REFERENCES "asset_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condition_measurements" ADD CONSTRAINT "condition_measurements_assetComponentId_fkey" FOREIGN KEY ("assetComponentId") REFERENCES "asset_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_assetComponentId_fkey" FOREIGN KEY ("assetComponentId") REFERENCES "asset_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

