-- Locked projects: the work plan whose projects a scenario runs with as they
-- are. Additive only: one nullable column, an index and a foreign key.
--
-- RESTRICT, like the scenario's saved filter: deleting a plan a scenario
-- locks is refused rather than quietly unlocking it, which would change what
-- the scenario runs without anyone deciding so.

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN     "lockedWorkPlanId" TEXT;

-- CreateIndex
CREATE INDEX "scenarios_lockedWorkPlanId_idx" ON "scenarios"("lockedWorkPlanId");

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_lockedWorkPlanId_fkey" FOREIGN KEY ("lockedWorkPlanId") REFERENCES "work_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
