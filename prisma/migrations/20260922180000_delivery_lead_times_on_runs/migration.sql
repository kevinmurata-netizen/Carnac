-- Delivery lead times on a run: a scenario may now choose a set, and a work
-- plan row may be programmed in one year, paid for in another and built in a
-- third.
--
-- Both new columns on work_plan_items are nullable and mean "the same as
-- `year`", which is what every existing row is: decided, paid for and built in
-- one year. Nothing is backfilled, so no existing plan changes.

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN "leadTimeSetId" TEXT;

-- AlterTable
ALTER TABLE "work_plan_items" ADD COLUMN "programmedYear" INTEGER,
ADD COLUMN "buildYear" INTEGER;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_leadTimeSetId_fkey" FOREIGN KEY ("leadTimeSetId") REFERENCES "lead_time_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
