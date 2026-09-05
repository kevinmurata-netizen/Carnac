-- AlterTable
ALTER TABLE "treatments" ADD COLUMN     "qualifyMode" TEXT NOT NULL DEFAULT 'any';

-- CreateTable
CREATE TABLE "rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "effect" TEXT NOT NULL DEFAULT 'allow',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "definition" JSONB NOT NULL,
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_rule_links" (
    "treatmentId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_rule_links_pkey" PRIMARY KEY ("treatmentId","ruleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "rules_organizationId_name_key" ON "rules"("organizationId", "name");

-- CreateIndex
CREATE INDEX "treatment_rule_links_ruleId_idx" ON "treatment_rule_links"("ruleId");

-- AddForeignKey
ALTER TABLE "treatment_rule_links" ADD CONSTRAINT "treatment_rule_links_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_rule_links" ADD CONSTRAINT "treatment_rule_links_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Phase 1 of the treatment model rebuild (docs/TREATMENT-MODEL-REBUILD.md).
--
-- Applicability stops living in columns and hard-coded gates and becomes
-- named, reusable rules. This half converts what is already stored, so that
-- exactly the same assets qualify for exactly the same treatments afterwards.
-- Check it with `npm run qa:matrix` before and after: the files must match.
--
-- Three sources are converted, in this order, because each later step has to
-- see the names an earlier one already took:
--   1. the technical window (the condition / material / diameter columns)
--   2. the three gates that were hard-coded inside isApplicable
--   3. the decision trees stored in treatment_rules
--
-- Every treatment then gets qualifyMode 'all'. The window checks used to be
-- AND-ed and are now ordinary rules sitting alongside the policy ones, so
-- leaving 'any' would let a segment qualify on its material alone. Where a
-- treatment previously combined SEVERAL trees with 'any', those trees are
-- merged into one rule joined by OR, which preserves the meaning exactly
-- rather than approximately.
--
-- Nothing here is destructive: treatment_rules and the window columns are left
-- as they are, so the release running before this migration keeps working and
-- Phase 1 can be reverted. Phase 6 drops them.
-- ============================================================================

-- Refuse rather than silently drop. A treatment still carrying only an
-- unconverted binary tree is gated by it today, through a converter that lives
-- in the application and not in SQL. Losing that gate would quietly widen what
-- the model recommends, which is worse than a migration that stops.
DO $$
DECLARE stuck TEXT;
BEGIN
  SELECT string_agg(DISTINCT t.name, ', ') INTO stuck
  FROM "treatments" t
  WHERE EXISTS (SELECT 1 FROM "treatment_rules" r WHERE r."treatmentId" = t.id AND r."ruleType" = 'decision-tree')
    AND NOT EXISTS (SELECT 1 FROM "treatment_rules" r WHERE r."treatmentId" = t.id AND r."ruleType" = 'qualification-tree');
  IF stuck IS NOT NULL THEN
    RAISE EXCEPTION 'These treatments still hold an original binary decision tree that only the application can read: %. Open Settings then Treatment Rules for each one and press Save, which rewrites it in the current format, then run this migration again.', stuck;
  END IF;
END $$;

CREATE TEMP TABLE _treatments ON COMMIT DROP AS
SELECT
  t.id                                             AS treatment_id,
  t.name                                           AS treatment_name,
  atp."organizationId"                             AS org_id,
  COALESCE(t."applicableConditionMin", 0)          AS cond_min,
  COALESCE(t."applicableConditionMax", 100)        AS cond_max,
  t.applicability                                  AS app,
  COALESCE(t.applicability->>'qualifyMode', 'any') AS old_mode
FROM "treatments" t
JOIN "asset_types" atp ON atp.id = t."assetTypeId";

-- ---------------------------------------------------------------------------
-- 1. The technical window becomes named rules.
--
-- Named formulaically ("Condition 0-45", "Material - Cast Iron, Steel") so two
-- treatments sharing a window share one rule. Writing a rule once and
-- attaching it in several places is the entire point of the change.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _gen (
  treatment_id TEXT,
  org_id       TEXT,
  rule_name    TEXT,
  rule_desc    TEXT,
  cond         JSONB
) ON COMMIT DROP;

-- Condition window. A 0-100 window constrains nothing, so it produces no rule.
INSERT INTO _gen
SELECT treatment_id, org_id,
  'Condition ' || trim_scale(round(cond_min::numeric, 2))::text || '-' || trim_scale(round(cond_max::numeric, 2))::text,
  'The condition window this treatment was written for.',
  jsonb_build_object('kind', 'condition', 'field', 'condition', 'operator', 'between',
                     'value',  trim_scale(round(cond_min::numeric, 2))::text,
                     'value2', trim_scale(round(cond_max::numeric, 2))::text)
FROM _treatments
WHERE cond_min > 0 OR cond_max < 100;

-- Materials.
INSERT INTO _gen
SELECT treatment_id, org_id,
  'Material - ' || list,
  'The materials this treatment can be used on.',
  jsonb_build_object('kind', 'condition', 'field', 'material', 'operator', 'in', 'value', list)
FROM (
  SELECT treatment_id, org_id,
         (SELECT string_agg(m.value #>> '{}', ', ' ORDER BY m.ord)
            FROM jsonb_array_elements(app->'materials') WITH ORDINALITY AS m(value, ord)) AS list
  FROM _treatments
  WHERE jsonb_typeof(app->'materials') = 'array'
) s
-- An empty array aggregates to NULL, which is the same "no constraint" answer
-- as no array at all. Checking it here rather than beside the type test above,
-- because SQL does not promise to evaluate two WHERE predicates in the order
-- they are written, and jsonb_array_length errors on a scalar.
WHERE list IS NOT NULL;

-- Diameter bounds. A segment with no recorded diameter failed both of these
-- before and fails them now, because a condition with nothing to read fails.
INSERT INTO _gen
SELECT treatment_id, org_id,
  'Diameter at least ' || trim_scale(round((app->>'diameterMin')::numeric, 2))::text,
  'The smallest diameter this treatment works on.',
  jsonb_build_object('kind', 'condition', 'field', 'diameterInches', 'operator', 'gte',
                     'value', trim_scale(round((app->>'diameterMin')::numeric, 2))::text)
FROM _treatments WHERE jsonb_typeof(app->'diameterMin') = 'number';

INSERT INTO _gen
SELECT treatment_id, org_id,
  'Diameter at most ' || trim_scale(round((app->>'diameterMax')::numeric, 2))::text,
  'The largest diameter this treatment works on.',
  jsonb_build_object('kind', 'condition', 'field', 'diameterInches', 'operator', 'lte',
                     'value', trim_scale(round((app->>'diameterMax')::numeric, 2))::text)
FROM _treatments WHERE jsonb_typeof(app->'diameterMax') = 'number';

INSERT INTO "rules" ("id", "organizationId", "name", "description", "effect", "enabled", "definition", "isGenerated", "createdAt", "updatedAt")
SELECT DISTINCT ON (org_id, rule_name)
  gen_random_uuid()::text, org_id, rule_name, rule_desc, 'allow', true,
  jsonb_build_object('kind', 'group', 'id', 'gen-' || md5(org_id || '|' || rule_name), 'join', 'AND',
                     'children', jsonb_build_array(cond || jsonb_build_object('id', 'gen-c-' || md5(org_id || '|' || rule_name)))),
  true, NOW(), NOW()
FROM _gen
ORDER BY org_id, rule_name;

INSERT INTO "treatment_rule_links" ("treatmentId", "ruleId")
SELECT DISTINCT g.treatment_id, r.id
FROM _gen g JOIN "rules" r ON r."organizationId" = g.org_id AND r."name" = g.rule_name
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The three hard-coded gates become block rules.
--
-- Matched on treatment name, which is exactly what the code they replace did
-- (`def.name === "Inspection"`), so a treatment someone renamed lost the gate
-- then and does not silently regain one now.
-- ---------------------------------------------------------------------------

INSERT INTO "rules" ("id", "organizationId", "name", "description", "effect", "enabled", "definition", "isGenerated", "createdAt", "updatedAt")
SELECT DISTINCT ON (org_id) gen_random_uuid()::text, org_id,
  'Skip inspection when condition is Excellent',
  'Was hard-coded. A routine inspection of a segment already in Excellent condition padded the identified-need total with work that is not needed.',
  'block', true,
  jsonb_build_object('kind', 'group', 'id', 'gen-block-inspection', 'join', 'AND', 'children',
    jsonb_build_array(jsonb_build_object('kind', 'condition', 'id', 'gen-block-inspection-c',
                                         'field', 'condition', 'operator', 'gte', 'value', '85'))),
  true, NOW(), NOW()
FROM _treatments WHERE treatment_name = 'Inspection'
ON CONFLICT ("organizationId", "name") DO NOTHING;

INSERT INTO "rules" ("id", "organizationId", "name", "description", "effect", "enabled", "definition", "isGenerated", "createdAt", "updatedAt")
SELECT DISTINCT ON (org_id) gen_random_uuid()::text, org_id,
  'No abandonment above 25 customers',
  'Was hard-coded. Retiring a main that still serves a meaningful customer base is not a real option whatever its condition.',
  'block', true,
  jsonb_build_object('kind', 'group', 'id', 'gen-block-abandonment', 'join', 'AND', 'children',
    jsonb_build_array(jsonb_build_object('kind', 'condition', 'id', 'gen-block-abandonment-c',
                                         'field', 'customersServed', 'operator', 'gt', 'value', '25'))),
  true, NOW(), NOW()
FROM _treatments WHERE treatment_name = 'Abandonment'
ON CONFLICT ("organizationId", "name") DO NOTHING;

INSERT INTO "rules" ("id", "organizationId", "name", "description", "effect", "enabled", "definition", "isGenerated", "createdAt", "updatedAt")
SELECT DISTINCT ON (org_id) gen_random_uuid()::text, org_id,
  'Emergency repair only after a recorded failure',
  'Was hard-coded. Emergency repair is reactive, so it is only offered where a failure has actually been recorded.',
  'block', true,
  jsonb_build_object('kind', 'group', 'id', 'gen-block-emergency', 'join', 'AND', 'children',
    jsonb_build_array(jsonb_build_object('kind', 'condition', 'id', 'gen-block-emergency-c',
                                         'field', 'failuresLast10Years', 'operator', 'eq', 'value', '0'))),
  true, NOW(), NOW()
FROM _treatments WHERE treatment_name = 'Emergency Repair'
ON CONFLICT ("organizationId", "name") DO NOTHING;

INSERT INTO "treatment_rule_links" ("treatmentId", "ruleId")
SELECT t.treatment_id, r.id
FROM _treatments t
JOIN (VALUES
  ('Inspection',       'Skip inspection when condition is Excellent'),
  ('Abandonment',      'No abandonment above 25 customers'),
  ('Emergency Repair', 'Emergency repair only after a recorded failure')
) AS m(treatment, rule) ON m.treatment = t.treatment_name
JOIN "rules" r ON r."organizationId" = t.org_id AND r."name" = m.rule
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Stored decision trees become rules.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _trees ON COMMIT DROP AS
SELECT
  t.treatment_id, t.treatment_name, t.org_id, t.old_mode,
  tr.id                                                       AS legacy_id,
  COALESCE(NULLIF(trim(tr."condition"->'tree'->>'name'), ''), 'Rule') AS tree_name,
  COALESCE((tr."condition"->'tree'->>'enabled')::boolean, true)       AS tree_enabled,
  tr."condition"->'tree'->>'description'                      AS tree_desc,
  tr."condition"->'tree'->'root'                              AS tree_root
FROM "treatment_rules" tr
JOIN _treatments t ON t.treatment_id = tr."treatmentId"
WHERE tr."ruleType" = 'qualification-tree'
  AND jsonb_typeof(tr."condition"->'tree'->'root') = 'object';

CREATE TEMP TABLE _converted ON COMMIT DROP AS
-- Several enabled trees combined with 'any' become one rule joined by OR.
-- Under the new global 'all' that reproduces the old meaning exactly.
SELECT org_id, treatment_id, treatment_name,
       treatment_name || ' policy'                            AS base_name,
       true                                                   AS enabled,
       'Converted from ' || count(*)::text || ' rules that each qualified an asset on their own, joined by OR so the meaning is unchanged.' AS descr,
       jsonb_build_object('kind', 'group', 'id', 'conv-' || treatment_id, 'join', 'OR',
                          'children', jsonb_agg(tree_root ORDER BY legacy_id)) AS root
FROM _trees
WHERE tree_enabled AND old_mode = 'any'
GROUP BY org_id, treatment_id, treatment_name
HAVING count(*) >= 2

UNION ALL

-- Everything else keeps its own identity: one tree, one rule.
SELECT org_id, treatment_id, treatment_name, tree_name, tree_enabled, tree_desc, tree_root
FROM _trees
WHERE NOT (
  tree_enabled AND old_mode = 'any'
  AND treatment_id IN (SELECT treatment_id FROM _trees
                       WHERE tree_enabled AND old_mode = 'any'
                       GROUP BY treatment_id HAVING count(*) >= 2)
);

-- A converted rule keeps the name its author gave it, unless that name is
-- already taken — by a generated rule above, or by another treatment's tree —
-- in which case the treatment name disambiguates it.
CREATE TEMP TABLE _converted_named ON COMMIT DROP AS
WITH candidates AS (
  SELECT c.*,
    CASE
      WHEN EXISTS (SELECT 1 FROM "rules" r WHERE r."organizationId" = c.org_id AND r."name" = c.base_name)
        OR count(*) OVER (PARTITION BY c.org_id, c.base_name) > 1
      THEN c.base_name || ' (' || c.treatment_name || ')'
      ELSE c.base_name
    END AS cand
  FROM _converted c
)
SELECT candidates.*,
  CASE WHEN row_number() OVER (PARTITION BY org_id, cand ORDER BY treatment_id) = 1
       THEN cand
       ELSE cand || ' ' || row_number() OVER (PARTITION BY org_id, cand ORDER BY treatment_id)::text
  END AS rule_name
FROM candidates;

INSERT INTO "rules" ("id", "organizationId", "name", "description", "effect", "enabled", "definition", "isGenerated", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, org_id, rule_name, descr, 'allow', enabled, root, false, NOW(), NOW()
FROM _converted_named;

INSERT INTO "treatment_rule_links" ("treatmentId", "ruleId")
SELECT c.treatment_id, r.id
FROM _converted_named c
JOIN "rules" r ON r."organizationId" = c.org_id AND r."name" = c.rule_name
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Every treatment now combines its allow rules with AND.
-- ---------------------------------------------------------------------------

UPDATE "treatments" SET "qualifyMode" = 'all';
