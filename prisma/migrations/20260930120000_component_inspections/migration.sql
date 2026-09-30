-- Component inspections. Additive only: two nullable columns, an index and a
-- foreign key; nothing that exists is changed.
--
-- consequence: how much a part's failure matters on a kind of asset, 1-5,
-- set beside its share. Risk from a component inspection is probability
-- (from condition) times this. Null means not set: the inspection records the
-- part's condition but no risk.
--
-- parentInspectionId: one site visit is the whole-asset inspection, and each
-- component's findings are a record pointing at it. RESTRICT, like the other
-- component links, so a visit can't be deleted out from under its parts.

-- AlterTable
ALTER TABLE "asset_type_component_types" ADD COLUMN     "consequence" INTEGER;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "parentInspectionId" TEXT;

-- CreateIndex
CREATE INDEX "inspections_parentInspectionId_idx" ON "inspections"("parentInspectionId");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_parentInspectionId_fkey" FOREIGN KEY ("parentInspectionId") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
