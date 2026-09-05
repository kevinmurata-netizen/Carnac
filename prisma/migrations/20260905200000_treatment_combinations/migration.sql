-- AlterTable
ALTER TABLE "work_plan_items" ADD COLUMN     "bundleId" TEXT,
ADD COLUMN     "bundleName" TEXT;

-- CreateTable
CREATE TABLE "treatment_combinations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "qualifyMode" TEXT NOT NULL DEFAULT 'all',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_combinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_combination_members" (
    "combinationId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "treatment_combination_members_pkey" PRIMARY KEY ("combinationId","treatmentId")
);

-- CreateTable
CREATE TABLE "treatment_combination_rule_links" (
    "combinationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "treatment_combination_rule_links_pkey" PRIMARY KEY ("combinationId","ruleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "treatment_combinations_organizationId_name_key" ON "treatment_combinations"("organizationId", "name");

-- CreateIndex
CREATE INDEX "treatment_combination_members_treatmentId_idx" ON "treatment_combination_members"("treatmentId");

-- CreateIndex
CREATE INDEX "treatment_combination_rule_links_ruleId_idx" ON "treatment_combination_rule_links"("ruleId");

-- AddForeignKey
ALTER TABLE "treatment_combination_members" ADD CONSTRAINT "treatment_combination_members_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "treatment_combinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_combination_members" ADD CONSTRAINT "treatment_combination_members_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_combination_rule_links" ADD CONSTRAINT "treatment_combination_rule_links_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "treatment_combinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_combination_rule_links" ADD CONSTRAINT "treatment_combination_rule_links_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Phase 4 of the treatment model rebuild (docs/TREATMENT-MODEL-REBUILD.md).
--
-- Purely additive, and there is no data to convert: no organization has any
-- combinations until someone defines one, and until then `enumerateOptions`
-- produces exactly the singletons it produced before. Nothing costs or ranks
-- differently on the day this deploys.
--
-- work_plan_items gains bundleId and bundleName rather than a bundle table:
-- rows sharing a bundleId are one decision, treatmentId stays a real foreign
-- key, and every existing read path, export and chart keeps working untouched.
-- ============================================================================
