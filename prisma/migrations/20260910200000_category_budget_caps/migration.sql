-- A ceiling on how much of one year's budget each category may take.
--
-- Ranking by Criticality x Scale x Category x Benefit / Total Cost hands the
-- top of the list to whatever is cheapest per point of benefit, and on a real
-- network cost varies far more between categories than benefit does. Measured
-- on the seed network: the top 100 options are all repairs and the first
-- renewal sits at rank 543. Left alone, a plan would spend the whole year
-- patching and never replace anything.
--
-- That is an allocation problem, not a ranking problem, so it is fixed where
-- the money is allocated. Each category may take at most its share of the
-- annual budget; work that would breach the cap is passed over and stays in
-- the backlog, still ranked, for a year with room.
--
-- Stored as a fraction, like fundingGrowth and discountRate elsewhere. The UI
-- reads and writes whole percentages.
--
-- Default 1 = 100% = no ceiling of its own beyond the budget itself. That is
-- what every existing row gets, so adding this changes nothing until someone
-- lowers one. It is also the setting a renewal category usually wants: with
-- everything else capped, whatever the other categories leave unspent rolls
-- into renewal rather than going unspent.

-- AlterTable
ALTER TABLE "category_weight_sets"
ADD COLUMN "assessCap" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "repairCap" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "rehabilitateCap" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "renewCap" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "retireCap" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- The two worked examples get caps that match what their names claim, so the
-- feature demonstrates itself. 'Even-handed' is deliberately left uncapped:
-- it is the default, and the default must keep reproducing what the model did
-- before this column existed.
--
-- Renewal Push: hold patching to a fifth of the year and rehabilitation to
-- half, and let renewal take everything they leave.
UPDATE "category_weight_sets"
SET "assessCap" = 0.1, "repairCap" = 0.2, "rehabilitateCap" = 0.5, "renewCap" = 1, "retireCap" = 1
WHERE "name" = 'Renewal Push';

-- Buy Time: the opposite bet. Renewal is held to a fifth so the money goes on
-- keeping things running, but it is not zero — a main past saving still has to
-- be replaced.
UPDATE "category_weight_sets"
SET "assessCap" = 0.2, "repairCap" = 1, "rehabilitateCap" = 1, "renewCap" = 0.2, "retireCap" = 1
WHERE "name" = 'Buy Time';
