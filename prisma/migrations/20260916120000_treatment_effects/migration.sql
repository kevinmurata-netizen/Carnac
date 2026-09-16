-- Treatment effects become named, shared rows, like rules.
--
-- Every treatment's current effect — its condition change, failure
-- probability multiplier and life extension — is rebuilt as an Effect named
-- exactly as the Treatments grid shows it ("resets to 100 · ×0.05", "+5 ·
-- ×0.85", "— · ×1"), and linked back. Treatments with identical effects share
-- one row. Nothing about what any treatment does changes: the engine now reads
-- these, and they hold the same numbers.
--
-- The old columns (expectedLifeExtension, effectOnCondition,
-- effectOnFailureProb, and the reset/gain keys in applicability) are left in
-- place for one release so this can be reverted; nothing reads them afterwards.

-- CreateTable
CREATE TABLE "effects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "conditionMode" TEXT NOT NULL DEFAULT 'none',
    "conditionValue" DOUBLE PRECISION,
    "failureProbMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "expectedLifeExtension" INTEGER NOT NULL DEFAULT 0,
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "effects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_effect_links" (
    "treatmentId" TEXT NOT NULL,
    "effectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_effect_links_pkey" PRIMARY KEY ("treatmentId","effectId")
);

-- CreateIndex
CREATE UNIQUE INDEX "effects_organizationId_name_key" ON "effects"("organizationId", "name");

-- CreateIndex
CREATE INDEX "treatment_effect_links_effectId_idx" ON "treatment_effect_links"("effectId");

-- AddForeignKey
ALTER TABLE "treatment_effect_links" ADD CONSTRAINT "treatment_effect_links_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_effect_links" ADD CONSTRAINT "treatment_effect_links_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "effects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Each treatment's effect, resolved exactly as the loader resolved it until
-- now: the reset/gain keys in `applicability` decide which kind of condition
-- change it is, and a row written before those keys existed falls back to the
-- shipped definition of the same name. That fallback table is the shipped
-- library as of this migration.
CREATE TEMP TABLE "_effect_source" AS
WITH seed(name, reset_to, gain) AS (
  VALUES
    ('Inspection',          NULL::float8, NULL::float8),
    ('Leak Repair',         NULL::float8, 5::float8),
    ('Spot Repair',         NULL::float8, 8::float8),
    ('Valve Replacement',   NULL::float8, 3::float8),
    ('Cathodic Protection', NULL::float8, 10::float8),
    ('Coating',             65::float8,   NULL::float8),
    ('Lining',              70::float8,   NULL::float8),
    ('Rehabilitation',      75::float8,   NULL::float8),
    ('Relining',            85::float8,   NULL::float8),
    ('Replacement',         100::float8,  NULL::float8),
    ('Upsizing',            100::float8,  NULL::float8),
    ('Abandonment',         0::float8,    NULL::float8),
    ('Emergency Repair',    NULL::float8, 4::float8)
),
base AS (
  SELECT
    t."id" AS treatment_id,
    at."organizationId" AS organization_id,
    COALESCE(t."effectOnFailureProb", 1)::float8 AS mult,
    COALESCE(t."expectedLifeExtension", 0) AS life,
    (t."applicability"->>'conditionResetTo') IS NOT NULL
      OR (t."applicability"->>'conditionGain') IS NOT NULL AS has_discriminator,
    (t."applicability"->>'conditionResetTo')::float8 AS app_reset,
    (t."applicability"->>'conditionGain')::float8 AS app_gain,
    s.reset_to AS seed_reset,
    s.gain AS seed_gain
  FROM "treatments" t
  JOIN "asset_types" at ON at."id" = t."assetTypeId"
  LEFT JOIN seed s ON s.name = t."name"
),
resolved AS (
  SELECT
    treatment_id,
    organization_id,
    mult,
    life,
    CASE WHEN has_discriminator THEN app_reset ELSE seed_reset END AS reset_to,
    CASE WHEN has_discriminator THEN app_gain ELSE seed_gain END AS gain
  FROM base
)
SELECT
  treatment_id,
  organization_id,
  mult,
  life,
  -- A reset takes precedence, as it always did when projecting condition.
  CASE WHEN reset_to IS NOT NULL THEN 'reset' WHEN gain IS NOT NULL THEN 'gain' ELSE 'none' END AS mode,
  COALESCE(reset_to, gain) AS value
FROM resolved;

-- One effect per distinct set of numbers per organization, named as the grid
-- shows it. The grid's label leaves out life extension, so two effects that
-- differ only there would share a label; the second and later ones get " (2)"
-- and so on rather than failing the unique name.
CREATE TEMP TABLE "_effect_new" AS
SELECT
  gen_random_uuid()::text AS id,
  organization_id,
  mode,
  value,
  mult,
  life,
  label || CASE WHEN rn > 1 THEN ' (' || rn || ')' ELSE '' END AS name
FROM (
  SELECT
    d.*,
    row_number() OVER (PARTITION BY organization_id, label ORDER BY life, mode) AS rn
  FROM (
    SELECT DISTINCT
      organization_id,
      mode,
      value,
      mult,
      life,
      CASE mode
        WHEN 'reset' THEN 'resets to ' || value::text
        WHEN 'gain' THEN '+' || value::text
        ELSE '—'
      END || ' · ×' || mult::text AS label
    FROM "_effect_source"
  ) d
) numbered;

INSERT INTO "effects" (
  "id", "organizationId", "name", "description", "conditionMode", "conditionValue",
  "failureProbMultiplier", "expectedLifeExtension", "isGenerated", "createdAt", "updatedAt"
)
SELECT
  id, organization_id, name, NULL, mode,
  CASE WHEN mode = 'none' THEN NULL ELSE value END,
  mult, life, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_effect_new";

-- Link each treatment to the effect holding its numbers. IS NOT DISTINCT FROM,
-- because a "none" effect's value is NULL and NULL = NULL is not true.
INSERT INTO "treatment_effect_links" ("treatmentId", "effectId", "sortOrder", "createdAt")
SELECT s.treatment_id, n.id, 0, CURRENT_TIMESTAMP
FROM "_effect_source" s
JOIN "_effect_new" n
  ON n.organization_id = s.organization_id
 AND n.mode = s.mode
 AND n.value IS NOT DISTINCT FROM s.value
 AND n.mult = s.mult
 AND n.life = s.life;

DROP TABLE "_effect_source";
DROP TABLE "_effect_new";
