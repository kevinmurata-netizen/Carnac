-- Scenario sets: a group of scenarios compared over one planning window.
--
-- Additive only. Every existing scenario starts outside any set and runs
-- exactly as before.

-- CreateEnum
CREATE TYPE "ScenarioSetStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "scenario_sets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseYear" INTEGER NOT NULL,
    "planningPeriodYears" INTEGER NOT NULL,
    "status" "ScenarioSetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scenario_sets_organizationId_name_key" ON "scenario_sets"("organizationId", "name");

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN "scenarioSetId" TEXT;

-- CreateIndex
CREATE INDEX "scenarios_scenarioSetId_idx" ON "scenarios"("scenarioSetId");

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_scenarioSetId_fkey" FOREIGN KEY ("scenarioSetId") REFERENCES "scenario_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
