-- Roll-up strategies: how component scores become one asset score.
--
-- Additive only: one enum, one table, one nullable column on asset_types.
-- A null rollupStrategyId follows the organization's default strategy, so
-- every existing asset type reads the same until someone chooses otherwise.
--
-- A strategy that an asset type uses cannot be deleted (ON DELETE RESTRICT):
-- falling back to the default would silently change every score it governs.
-- "Exactly one default per organization" is enforced by the application, as
-- it is for lead time sets.
-- CreateEnum
CREATE TYPE "RollupStrategyType" AS ENUM ('WEIGHTED_WORST_CASE', 'REPLACEMENT_COST_WEIGHTED_AVERAGE', 'SIMPLE_AVERAGE');

-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN     "rollupStrategyId" TEXT;

-- CreateTable
CREATE TABLE "rollup_strategies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "strategyType" "RollupStrategyType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rollup_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rollup_strategies_organizationId_name_key" ON "rollup_strategies"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_rollupStrategyId_fkey" FOREIGN KEY ("rollupStrategyId") REFERENCES "rollup_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rollup_strategies" ADD CONSTRAINT "rollup_strategies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

