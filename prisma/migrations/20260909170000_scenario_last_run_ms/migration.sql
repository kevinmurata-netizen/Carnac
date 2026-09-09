-- How long a scenario's last run took.
--
-- A run is one synchronous call with no way to report its own progress, so
-- there is nothing to draw a progress bar from except history. Recording the
-- duration lets the next run of the same scenario be estimated from the last
-- one, and lets a scenario that has never run borrow the rate other scenarios
-- achieved for comparable work.
--
-- Nullable with no backfill: existing scenarios have no recorded duration and
-- inventing one would defeat the point. They estimate from the fleet rate
-- until their next run measures them.

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN "lastRunMs" INTEGER;
