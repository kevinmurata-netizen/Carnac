-- Budget plans: the money a utility expects to have, set year by year in
-- dollars. Named budget_plans because "budgets" is the older project budget
-- table.
--
-- Optional. A scenario with no plan keeps running on its annual budget and
-- growth, exactly as before, so nothing existing changes.
-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN     "budgetPlanId" TEXT;

-- CreateTable
CREATE TABLE "budget_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_plan_lines" (
    "id" TEXT NOT NULL,
    "budgetPlanId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "assetTypeId" TEXT,
    "category" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "budget_plan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_plans_organizationId_name_key" ON "budget_plans"("organizationId", "name");

-- CreateIndex
CREATE INDEX "budget_plan_lines_budgetPlanId_year_idx" ON "budget_plan_lines"("budgetPlanId", "year");

-- CreateIndex
CREATE INDEX "budget_plan_lines_assetTypeId_idx" ON "budget_plan_lines"("assetTypeId");

-- AddForeignKey
ALTER TABLE "budget_plan_lines" ADD CONSTRAINT "budget_plan_lines_budgetPlanId_fkey" FOREIGN KEY ("budgetPlanId") REFERENCES "budget_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plan_lines" ADD CONSTRAINT "budget_plan_lines_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_budgetPlanId_fkey" FOREIGN KEY ("budgetPlanId") REFERENCES "budget_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

