-- How long work takes to deliver: programmed, funded, built.
--
-- Nothing reads these yet. The scenario engine that spends against them comes
-- next; this is the vocabulary, so a set can be written before there is
-- anything to run it through.

-- CreateTable
CREATE TABLE "lead_time_sets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assessFund" INTEGER NOT NULL DEFAULT 0,
    "assessBuild" INTEGER NOT NULL DEFAULT 0,
    "repairFund" INTEGER NOT NULL DEFAULT 0,
    "repairBuild" INTEGER NOT NULL DEFAULT 0,
    "rehabilitateFund" INTEGER NOT NULL DEFAULT 0,
    "rehabilitateBuild" INTEGER NOT NULL DEFAULT 0,
    "renewFund" INTEGER NOT NULL DEFAULT 0,
    "renewBuild" INTEGER NOT NULL DEFAULT 0,
    "retireFund" INTEGER NOT NULL DEFAULT 0,
    "retireBuild" INTEGER NOT NULL DEFAULT 0,
    "cashSplits" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_time_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_time_overrides" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "fundOffset" INTEGER NOT NULL DEFAULT 0,
    "buildOffset" INTEGER NOT NULL DEFAULT 0,
    "cashSplit" JSONB,

    CONSTRAINT "lead_time_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_time_sets_organizationId_name_key" ON "lead_time_sets"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "lead_time_overrides_setId_treatmentId_key" ON "lead_time_overrides"("setId", "treatmentId");

-- AddForeignKey
ALTER TABLE "lead_time_overrides" ADD CONSTRAINT "lead_time_overrides_setId_fkey" FOREIGN KEY ("setId") REFERENCES "lead_time_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_time_overrides" ADD CONSTRAINT "lead_time_overrides_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
