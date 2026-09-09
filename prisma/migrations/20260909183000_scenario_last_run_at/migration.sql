-- When a scenario last finished running.
--
-- Separate from updatedAt, which Prisma bumps on any write — renaming a
-- scenario would otherwise make its stored results look freshly computed.
--
-- Its own migration rather than an edit to 20260909170000: that one may
-- already have been applied, and changing an applied migration breaks its
-- recorded checksum.
--
-- No backfill. A scenario that ran before this column existed has no recorded
-- finish time, and inventing one from updatedAt would assert a precision that
-- was never measured. They fill in on their next run.

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN "lastRunAt" TIMESTAMP(3);
