-- Which treatments and combinations a scenario is allowed to consider.
--
-- Until now every scenario considered the whole library, so the only way to
-- ask "what would a relining-only programme fund?" was to disable treatments
-- globally and remember to put them back. That changes the library for
-- everyone and cannot be compared against anything.
--
-- Join tables rather than an array of ids on the scenario, so a deleted
-- treatment removes itself from every scenario that named it. An array would
-- keep pointing at something that no longer exists, and a scenario would
-- quietly narrow without saying why.

-- AlterTable
--
-- The flag is what separates "consider everything" from "consider nothing".
-- With no rows and no flag, an empty selection would be ambiguous, and the
-- reading that hurts is the silent one: someone unticks every box, expects an
-- empty plan, and gets the full library instead.
ALTER TABLE "scenarios" ADD COLUMN "limitsOptions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "scenario_treatments" (
    "scenarioId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,

    CONSTRAINT "scenario_treatments_pkey" PRIMARY KEY ("scenarioId","treatmentId")
);

-- CreateTable
CREATE TABLE "scenario_combinations" (
    "scenarioId" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,

    CONSTRAINT "scenario_combinations_pkey" PRIMARY KEY ("scenarioId","combinationId")
);

-- CreateIndex
CREATE INDEX "scenario_treatments_treatmentId_idx" ON "scenario_treatments"("treatmentId");

-- CreateIndex
CREATE INDEX "scenario_combinations_combinationId_idx" ON "scenario_combinations"("combinationId");

-- AddForeignKey
--
-- Cascade on both sides. Deleting a scenario takes its selection with it, and
-- deleting a treatment takes it out of every scenario that named it — which is
-- the whole reason these are rows rather than a JSON array.
ALTER TABLE "scenario_treatments" ADD CONSTRAINT "scenario_treatments_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scenario_treatments" ADD CONSTRAINT "scenario_treatments_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scenario_combinations" ADD CONSTRAINT "scenario_combinations_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scenario_combinations" ADD CONSTRAINT "scenario_combinations_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "treatment_combinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
