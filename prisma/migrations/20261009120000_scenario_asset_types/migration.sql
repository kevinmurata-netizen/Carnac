-- Which modelled asset types a scenario runs over.
--
-- No rows means every modelled type, which is what every scenario ran over
-- before this existed, so existing scenarios are unchanged. Unlike a
-- treatment selection, an empty choice is not ambiguous here: a scenario over
-- no asset types at all has nothing to run, so "none chosen" can only mean
-- "not narrowed".
--
-- A join table rather than an array of ids on the scenario, as for its
-- treatments and combinations: a deleted asset type removes itself from every
-- scenario that named it, instead of leaving an id that points at nothing.

-- CreateTable
CREATE TABLE "scenario_asset_types" (
    "scenarioId" TEXT NOT NULL,
    "assetTypeId" TEXT NOT NULL,

    CONSTRAINT "scenario_asset_types_pkey" PRIMARY KEY ("scenarioId","assetTypeId")
);

-- CreateIndex
CREATE INDEX "scenario_asset_types_assetTypeId_idx" ON "scenario_asset_types"("assetTypeId");

-- AddForeignKey
ALTER TABLE "scenario_asset_types" ADD CONSTRAINT "scenario_asset_types_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_asset_types" ADD CONSTRAINT "scenario_asset_types_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
