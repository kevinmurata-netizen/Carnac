-- AlterTable
ALTER TABLE "treatments" ADD COLUMN     "ruleTree" JSONB;


-- ============================================================================
-- The allow rules on a treatment become a tree instead of a flat list.
--
-- Every existing treatment converts to a single root group whose join is the
-- qualifyMode it already had — "all" becomes AND, "any" becomes OR — holding
-- one leaf per attached allow rule. That is exactly equivalent, so which
-- assets qualify for which treatments does not move. Check with
-- `npm run qa:matrix` before and after.
--
-- Block rules are not in the tree. They are absolute and are applied before it
-- is consulted, so they stay attached through treatment_rule_links alone. A
-- block inside an OR group would have no coherent reading.
--
-- qualifyMode is left in place, unread, so this is revertible; Phase 6 drops
-- it along with the other superseded columns.
-- ============================================================================

UPDATE "treatments" t
SET "ruleTree" = jsonb_build_object(
  'kind', 'group',
  'id', 'root-' || t.id,
  'join', CASE WHEN t."qualifyMode" = 'any' THEN 'OR' ELSE 'AND' END,
  'children', COALESCE(
    (
      SELECT jsonb_agg(
               jsonb_build_object('kind', 'rule', 'id', 'n-' || l."ruleId", 'ruleId', l."ruleId")
               ORDER BY r."name"
             )
      FROM "treatment_rule_links" l
      JOIN "rules" r ON r.id = l."ruleId"
      WHERE l."treatmentId" = t.id AND r."effect" = 'allow'
    ),
    -- No allow rules means no gate, which an empty group already expresses.
    '[]'::jsonb
  )
);
