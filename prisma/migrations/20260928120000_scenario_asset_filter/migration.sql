-- Which assets a scenario runs over.
--
-- Null is every active asset, which is what every scenario did before this
-- column existed, so nothing already stored changes meaning.
--
-- ON DELETE RESTRICT rather than SET NULL: silently widening a scenario back
-- to the whole network because someone tidied up a filter would change what
-- its results mean without anyone being told. The delete is refused instead,
-- naming the scenarios that use it.
ALTER TABLE "scenarios" ADD COLUMN "savedFilterId" TEXT;

CREATE INDEX "scenarios_savedFilterId_idx" ON "scenarios"("savedFilterId");

ALTER TABLE "scenarios"
  ADD CONSTRAINT "scenarios_savedFilterId_fkey"
  FOREIGN KEY ("savedFilterId") REFERENCES "saved_filters"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
