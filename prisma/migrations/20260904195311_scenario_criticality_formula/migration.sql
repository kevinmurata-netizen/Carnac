-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN     "criticalityModelId" TEXT;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_criticalityModelId_fkey" FOREIGN KEY ("criticalityModelId") REFERENCES "criticality_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
