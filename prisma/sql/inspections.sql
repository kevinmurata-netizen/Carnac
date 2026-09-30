-- CARNAC — sample site visits for the sample facilities
--
-- GENERATED FILE. Produced by `npm run db:seed:inspections:sql` from
-- prisma/component-plan.ts. Edit that and regenerate; edits here are lost.
--
-- Run it after facilities.sql and components.sql; a site form facilities.sql
-- didn't create (older copies of it had none) is created here. Paste the whole file into
-- a SQL console (Neon's editor, psql, …). It is one transaction: it either
-- all lands or none of it does. It:
--   * sets each component's consequence of failure where none is set yet;
--   * adds each component type's inspection form, if the app hasn't yet;
--   * records up to three site visits per sample facility — its latest and
--     ones five and ten years before — each with the site form's answers and
--     a finding, with readings, for every component the facility has.
-- A finding on a date a component's history already holds is attached to
-- that reading, so no current score or roll-up changes. A facility that
-- already has any inspection is left alone, so it is safe to run again.

DO $$
DECLARE
  v_org       text;
  v_inspector text;
  v_type      text;
  v_type_name text;
  v_site      text;
  v_ctpl      text;
  v_cm        text;
  v_rm        text;
  v_asset     text;
  v_visit     text;
  v_child     text;
  v_comp      text;
  v_cons      integer;
  v_n         integer;
BEGIN
  SELECT id INTO v_org FROM organizations ORDER BY "createdAt" ASC LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No organization in this database.';
  END IF;

  -- Recorded against an inspector, or failing that anyone active.
  SELECT u.id INTO v_inspector FROM users u JOIN roles r ON r.id = u."roleId"
   WHERE u."organizationId" = v_org AND u."isActive" AND r.code = 'INSPECTOR' ORDER BY u.email LIMIT 1;
  IF v_inspector IS NULL THEN
    SELECT id INTO v_inspector FROM users WHERE "organizationId" = v_org AND "isActive" ORDER BY email LIMIT 1;
  END IF;
  IF v_inspector IS NULL THEN
    RAISE EXCEPTION 'No user to record the sample inspections against.';
  END IF;

  -- RESERVOIR =========================================================
  v_type := NULL;
  SELECT id, name INTO v_type, v_type_name FROM asset_types WHERE "organizationId" = v_org AND code = 'RESERVOIR';
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'No RESERVOIR asset type in this database — run facilities.sql first.';
  END IF;

  -- The site form: the active one, else the sample one by name, else it is
  -- created here exactly as facilities.sql creates it. Databases that took
  -- facilities.sql before the forms were added to it have none.
  v_site := NULL;
  SELECT id INTO v_site FROM inspection_templates WHERE "assetTypeId" = v_type AND "componentTypeId" IS NULL AND "isActive" ORDER BY "createdAt" LIMIT 1;
  IF v_site IS NULL THEN
    SELECT id INTO v_site FROM inspection_templates WHERE "assetTypeId" = v_type AND "componentTypeId" IS NULL AND name = 'Reservoir Condition Assessment' ORDER BY "createdAt" LIMIT 1;
  END IF;
  IF v_site IS NULL THEN
    INSERT INTO inspection_templates (id, "assetTypeId", name, description, "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_type, 'Reservoir Condition Assessment', 'Interior and structural inspection of a finished-water reservoir — drained, or by diver or ROV.', true, now(), now())
    RETURNING id INTO v_site;
    IF v_site IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'STRUCTURAL_CRACKING', 'Structural Cracking', 'NUMBER'::"AttributeDataType", NULL, true, 10, '{"helpText":"0 = through-cracking or active movement, 10 = no cracking observed","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'INTERIOR_COATING', 'Interior Coating / Lining', 'NUMBER'::"AttributeDataType", NULL, true, 20, '{"helpText":"0 = coating failed, substrate exposed, 10 = coating intact","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'CORROSION', 'Corrosion', 'NUMBER'::"AttributeDataType", NULL, true, 30, '{"helpText":"0 = severe section loss, 10 = no corrosion observed","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'ROOF_AND_HATCHES', 'Roof, Hatches & Access', 'NUMBER'::"AttributeDataType", NULL, true, 40, '{"helpText":"0 = roof unsound or hatches unsecured, 10 = sound and secure","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'VENTS_AND_SCREENS', 'Vents & Screens', 'NUMBER'::"AttributeDataType", NULL, true, 50, '{"helpText":"0 = screens missing or torn — contamination path open, 10 = intact and sealed","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'SEDIMENT_ACCUMULATION', 'Sediment Accumulation', 'NUMBER'::"AttributeDataType", NULL, true, 60, '{"helpText":"0 = heavy accumulation reducing usable volume, 10 = floor clean","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'INLET_OUTLET_VALVES', 'Inlet, Outlet & Valves', 'NUMBER'::"AttributeDataType", NULL, true, 70, '{"helpText":"0 = valves seized or leaking by, 10 = operate freely and seal","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'OVERFLOW_AND_DRAIN', 'Overflow & Drain', 'NUMBER'::"AttributeDataType", NULL, true, 80, '{"helpText":"0 = blocked or discharging incorrectly, 10 = clear and correctly screened","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'FOUNDATION_AND_SITE', 'Foundation & Site Drainage', 'NUMBER'::"AttributeDataType", NULL, true, 90, '{"helpText":"0 = settlement or water standing against the structure, 10 = stable and draining away","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'SITE_SECURITY', 'Site Security', 'NUMBER'::"AttributeDataType", NULL, true, 100, '{"helpText":"0 = unsecured, 10 = fencing, locks and intrusion alarms sound","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'OTHER_DEFICIENCIES', 'Other Observed Deficiencies', 'TEXT'::"AttributeDataType", NULL, false, 200, '{"helpText":"Free-text notes on anything not captured above"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
  END IF;
  IF v_site IS NULL THEN
    RAISE EXCEPTION 'RESERVOIR has no site inspection form, and none is defined to create.';
  ELSE

    -- Consequence of failure, where none is set yet.
    UPDATE asset_type_component_types l SET consequence = 5 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 3 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'ROOF' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 4 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'FLOOR' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 2 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 3 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' AND l.consequence IS NULL;

    -- Each component type's inspection form, as the app would create it.
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Tank Shell Inspection', 'Walls, welds or joints, and signs of leakage.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'MIN_WALL_THICKNESS', 'Minimum wall thickness', 'NUMBER'::"AttributeDataType", 'in', false, 1, '{"helpText":"Thinnest ultrasonic reading"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'MAX_PIT_DEPTH', 'Deepest pit', 'NUMBER'::"AttributeDataType", 'mils', false, 2, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CRACKING', 'Cracking at welds or joints', 'ENUM'::"AttributeDataType", NULL, false, 3, '{"options":["None","Light","Moderate","Heavy"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'LEAKAGE', 'Leakage', 'ENUM'::"AttributeDataType", NULL, false, 4, '{"options":["None","Weeping","Active"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Roof Inspection', 'Roof structure, hatches, vents and screens — the sanitary seal.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'COATING_FAILED_PCT', 'Roof coating failed', 'NUMBER'::"AttributeDataType", '%', false, 1, '{"min":0,"max":100}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'HATCHES_SECURE', 'Hatches closed and locked', 'BOOLEAN'::"AttributeDataType", NULL, false, 2, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'VENT_SCREENS_INTACT', 'Vent screens intact', 'BOOLEAN'::"AttributeDataType", NULL, false, 3, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'DEFLECTION', 'Structural deflection', 'ENUM'::"AttributeDataType", NULL, false, 4, '{"options":["None","Light","Moderate","Heavy"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Floor Inspection', 'Floor slab or bottom plate, usually seen by diver or ROV.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'SEDIMENT_DEPTH', 'Sediment depth', 'NUMBER'::"AttributeDataType", 'in', false, 1, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'MAX_PIT_DEPTH', 'Deepest pit', 'NUMBER'::"AttributeDataType", 'mils', false, 2, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'SETTLEMENT', 'Settlement or cracking', 'ENUM'::"AttributeDataType", NULL, false, 3, '{"options":["None","Light","Moderate","Heavy"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Coating Inspection', 'Interior and exterior coating survey.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'DFT_AVG', 'Dry film thickness, average', 'NUMBER'::"AttributeDataType", 'mils', false, 1, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'AREA_FAILED_PCT', 'Area failed', 'NUMBER'::"AttributeDataType", '%', false, 2, '{"min":0,"max":100}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'ADHESION', 'Adhesion (ASTM D3359)', 'ENUM'::"AttributeDataType", NULL, false, 3, '{"helpText":"5B no removal · 0B more than 65% removed","options":["5B","4B","3B","2B","1B","0B"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'HOLIDAYS', 'Holidays found', 'NUMBER'::"AttributeDataType", NULL, false, 4, '{"helpText":"Pinholes or voids from a holiday test"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Cathodic Protection Survey', 'Protection levels and the system delivering them.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'POTENTIAL_MV', 'Structure-to-water potential', 'NUMBER'::"AttributeDataType", 'mV CSE', false, 1, '{"helpText":"Instant-off; −850 mV or more negative is the usual criterion"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'RECTIFIER_OUTPUT_A', 'Rectifier output', 'NUMBER'::"AttributeDataType", 'A', false, 2, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'ANODES_REMAINING_PCT', 'Anode material remaining', 'NUMBER'::"AttributeDataType", '%', false, 3, '{"min":0,"max":100}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;

    -- The models component scores are filed under (components.sql made them).
    v_cm := NULL;
    SELECT id INTO v_cm FROM condition_models WHERE "assetTypeId" = v_type AND formula->>'scope' = 'component' LIMIT 1;
    IF v_cm IS NULL THEN
      INSERT INTO condition_models (id, "assetTypeId", name, "scaleMin", "scaleMax", bands, formula, "isActive") VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Condition', 0, 100, '[]'::jsonb, '{"scope":"component","note":"Holds component condition scores; the asset''s own is rolled up from them."}'::jsonb, true) RETURNING id INTO v_cm;
    END IF;
    v_rm := NULL;
    SELECT id INTO v_rm FROM risk_models WHERE "assetTypeId" = v_type AND "probabilityConfig"->>'scope' = 'component' LIMIT 1;
    IF v_rm IS NULL THEN
      INSERT INTO risk_models (id, "assetTypeId", name, "probabilityConfig", "consequenceConfig", "isActive") VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Risk', '{"scope":"component"}'::jsonb, '{"scope":"component"}'::jsonb, true) RETURNING id INTO v_rm;
    END IF;

    -- RSV-01  Riverside Reservoir -------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-01' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2012-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.322 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 44 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 61, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 5), 3 * COALESCE(v_cons, 5), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 49 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 12, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 38 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 59, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 11.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '5B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 91, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 2), 1 * COALESCE(v_cons, 2), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -917 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 93 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 98, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2017-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2017-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.309 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 55 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 53, TIMESTAMP '2017-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 5), 3 * COALESCE(v_cons, 5), TIMESTAMP '2017-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2017-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2017-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 45 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 50, TIMESTAMP '2017-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2017-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 16 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '4B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 71, TIMESTAMP '2017-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 2), 2 * COALESCE(v_cons, 2), TIMESTAMP '2017-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -861 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 72 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 78, TIMESTAMP '2017-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2017-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2022-01-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2022-01-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2022-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.302 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 64 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2022-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 46, TIMESTAMP '2022-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2022-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2022-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2022-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2022-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2022-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2022-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 54 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2022-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 41, TIMESTAMP '2022-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 4), 4 * COALESCE(v_cons, 4), TIMESTAMP '2022-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2022-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 36 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '2B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2022-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 42, TIMESTAMP '2022-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 2), 4 * COALESCE(v_cons, 2), TIMESTAMP '2022-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2022-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -764 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 44 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2022-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 49, TIMESTAMP '2022-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2022-01-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- RSV-02  Southport Tank ------------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-02' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2009-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2009-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2009-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.37 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2009-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 98, TIMESTAMP '2009-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2009-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2009-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2009-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 90, TIMESTAMP '2009-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2009-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2009-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2009-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2009-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2009-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2009-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 19 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '3B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2009-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 68, TIMESTAMP '2009-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 2), 3 * COALESCE(v_cons, 2), TIMESTAMP '2009-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2009-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -710 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 31 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2009-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 34, TIMESTAMP '2009-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2009-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2014-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.365 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 18 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 90, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 82, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 94, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 26 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '3B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 60, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 2), 3 * COALESCE(v_cons, 2), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -698 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 25 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 26, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2019-01-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2019-01-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.34 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 31 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 78, TIMESTAMP '2019-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 5), 2 * COALESCE(v_cons, 5), TIMESTAMP '2019-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 13 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 70, TIMESTAMP '2019-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2019-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 18 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 82, TIMESTAMP '2019-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2019-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 34 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '2B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 48, TIMESTAMP '2019-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 2), 4 * COALESCE(v_cons, 2), TIMESTAMP '2019-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -654 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 13 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 14, TIMESTAMP '2019-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2019-01-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- RSV-03  Meridian Central Reservoir ------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-03' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2013-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2013-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2013-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.292 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 66 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Weeping' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2013-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 41, TIMESTAMP '2013-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2013-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2013-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2013-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 94, TIMESTAMP '2013-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2013-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2013-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 66 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2013-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 31, TIMESTAMP '2013-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 4), 4 * COALESCE(v_cons, 4), TIMESTAMP '2013-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2013-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 44 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '1B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2013-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 34, TIMESTAMP '2013-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 2), 4 * COALESCE(v_cons, 2), TIMESTAMP '2013-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2013-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -709 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 30 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2013-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 34, TIMESTAMP '2013-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2013-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2018-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2018-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2018-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.282 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Weeping' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2018-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 33, TIMESTAMP '2018-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2018-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2018-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2018-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 86, TIMESTAMP '2018-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2018-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2018-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 73 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2018-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 21, TIMESTAMP '2018-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 4), 5 * COALESCE(v_cons, 4), TIMESTAMP '2018-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2018-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 12 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '5B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2018-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 97, TIMESTAMP '2018-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 2), 1 * COALESCE(v_cons, 2), TIMESTAMP '2018-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2018-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -930 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 92 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2018-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 97, TIMESTAMP '2018-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2018-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2023-01-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2023-01-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2023-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.265 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 85 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Active' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2023-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 24, TIMESTAMP '2023-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 5), 5 * COALESCE(v_cons, 5), TIMESTAMP '2023-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2023-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2023-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 76, TIMESTAMP '2023-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2023-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2023-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 82 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2023-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 10, TIMESTAMP '2023-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 4), 5 * COALESCE(v_cons, 4), TIMESTAMP '2023-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2023-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '5B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2023-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 86, TIMESTAMP '2023-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 2), 1 * COALESCE(v_cons, 2), TIMESTAMP '2023-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2023-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -877 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2023-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 86, TIMESTAMP '2023-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2023-01-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- RSV-04  Eastgate Tank -------------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-04' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2011-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2011-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2011-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.342 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 27 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2011-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 80, TIMESTAMP '2011-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 5), 2 * COALESCE(v_cons, 5), TIMESTAMP '2011-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2011-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 13 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2011-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 72, TIMESTAMP '2011-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2011-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2011-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 23 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2011-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 80, TIMESTAMP '2011-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2011-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2011-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 11.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '5B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2011-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 95, TIMESTAMP '2011-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 2), 1 * COALESCE(v_cons, 2), TIMESTAMP '2011-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2011-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -935 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 92 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2011-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2011-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2011-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2016-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2016-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2016-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.337 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 28 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2016-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 75, TIMESTAMP '2016-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 5), 2 * COALESCE(v_cons, 5), TIMESTAMP '2016-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2016-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 20 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2016-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 60, TIMESTAMP '2016-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2016-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2016-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 26 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2016-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 74, TIMESTAMP '2016-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2016-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2016-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 11 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '4B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2016-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 81, TIMESTAMP '2016-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 2), 2 * COALESCE(v_cons, 2), TIMESTAMP '2016-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2016-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -893 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 83 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2016-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 89, TIMESTAMP '2016-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2016-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2021-01-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2021-01-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2021-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.33 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 35 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2021-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 70, TIMESTAMP '2021-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 5), 2 * COALESCE(v_cons, 5), TIMESTAMP '2021-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2021-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 28 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2021-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 47, TIMESTAMP '2021-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2021-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2021-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 30 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2021-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 68, TIMESTAMP '2021-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2021-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2021-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 26 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '3B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2021-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 58, TIMESTAMP '2021-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 2), 3 * COALESCE(v_cons, 2), TIMESTAMP '2021-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2021-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -815 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 63 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2021-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 66, TIMESTAMP '2021-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2021-01-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- RSV-05  Highland Park Reservoir ---------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-05' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2014-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.371 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 82, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 12.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '5B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 2), 1 * COALESCE(v_cons, 2), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2014-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -923 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 94 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2014-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2014-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2014-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2019-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.378 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 12 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 74, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 11.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '5B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 96, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 2), 1 * COALESCE(v_cons, 2), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -926 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 92 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2024-01-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.365 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 16 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 91, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 17 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 62, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 93, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '4B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 84, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 2), 2 * COALESCE(v_cons, 2), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -892 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 84 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 88, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- RSV-06  Millbrook Tank ------------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-06' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2007-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2007-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2007-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.311 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 58 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2007-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 54, TIMESTAMP '2007-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 5), 3 * COALESCE(v_cons, 5), TIMESTAMP '2007-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2007-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 11 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2007-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 78, TIMESTAMP '2007-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2007-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2007-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 18 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2007-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 86, TIMESTAMP '2007-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2007-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2007-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 23 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '3B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2007-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 61, TIMESTAMP '2007-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 2), 3 * COALESCE(v_cons, 2), TIMESTAMP '2007-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2007-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -873 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2007-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 80, TIMESTAMP '2007-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2007-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2012-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.294 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 67 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 46, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 12 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 70, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 22 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 78, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 31 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '2B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 53, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 2), 3 * COALESCE(v_cons, 2), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2012-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -847 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 68 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2012-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 72, TIMESTAMP '2012-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2012-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2017-01-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2017-01-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.283 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 75 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Weeping' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 34, TIMESTAMP '2017-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2017-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 22 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 58, TIMESTAMP '2017-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2017-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 33 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 66, TIMESTAMP '2017-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2017-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 40 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '2B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 41, TIMESTAMP '2017-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 2), 4 * COALESCE(v_cons, 2), TIMESTAMP '2017-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2017-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -794 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 56 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2017-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 60, TIMESTAMP '2017-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2017-01-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- RSV-07  North Hill Standpipe ------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-07' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2019-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.363 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 17 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 90, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 15 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '4B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 73, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 2), 2 * COALESCE(v_cons, 2), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2019-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -855 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 72 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2019-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 75, TIMESTAMP '2019-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2019-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2024-01-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STRUCTURAL_CRACKING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INTERIOR_COATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CORROSION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ROOF_AND_HATCHES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTS_AND_SCREENS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SEDIMENT_ACCUMULATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INLET_OUTLET_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'OVERFLOW_AND_DRAIN';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'FOUNDATION_AND_SITE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'TANK_SHELL' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'TANK_SHELL' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'TANK_SHELL';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.353 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MIN_WALL_THICKNESS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 17 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CRACKING';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKAGE';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 88, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'ROOF' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'ROOF' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'ROOF';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'COATING_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HATCHES_SECURE';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VENT_SCREENS_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DEFLECTION';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 91, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'FLOOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'FLOOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'FLOOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SEDIMENT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'MAX_PIT_DEPTH';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SETTLEMENT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 98, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'COATING_SYSTEM' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'COATING_SYSTEM';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DFT_AVG';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 34 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'AREA_FAILED_PCT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, '2B' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ADHESION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 11 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'HOLIDAYS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 46, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 2), 4 * COALESCE(v_cons, 2), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CATHODIC_PROTECTION' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CATHODIC_PROTECTION';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2024-01-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, -761 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'POTENTIAL_MV';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'RECTIFIER_OUTPUT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 48 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ANODES_REMAINING_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2024-01-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 48, TIMESTAMP '2024-01-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2024-01-01 00:00:00');
        END IF;
      END IF;
    END IF;
  END IF;

  -- WELL ==============================================================
  v_type := NULL;
  SELECT id, name INTO v_type, v_type_name FROM asset_types WHERE "organizationId" = v_org AND code = 'WELL';
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'No WELL asset type in this database — run facilities.sql first.';
  END IF;

  -- The site form: the active one, else the sample one by name, else it is
  -- created here exactly as facilities.sql creates it. Databases that took
  -- facilities.sql before the forms were added to it have none.
  v_site := NULL;
  SELECT id INTO v_site FROM inspection_templates WHERE "assetTypeId" = v_type AND "componentTypeId" IS NULL AND "isActive" ORDER BY "createdAt" LIMIT 1;
  IF v_site IS NULL THEN
    SELECT id INTO v_site FROM inspection_templates WHERE "assetTypeId" = v_type AND "componentTypeId" IS NULL AND name = 'Well Condition Assessment' ORDER BY "createdAt" LIMIT 1;
  END IF;
  IF v_site IS NULL THEN
    INSERT INTO inspection_templates (id, "assetTypeId", name, description, "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_type, 'Well Condition Assessment', 'Mechanical, electrical and sanitary inspection of a groundwater production well.', true, now(), now())
    RETURNING id INTO v_site;
    IF v_site IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'PUMP_AND_MOTOR', 'Pump & Motor', 'NUMBER'::"AttributeDataType", NULL, true, 10, '{"helpText":"0 = failed or running outside its curve, 10 = performing to specification","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'COLUMN_AND_SHAFT', 'Column & Shaft', 'NUMBER'::"AttributeDataType", NULL, true, 20, '{"helpText":"0 = wear, vibration or misalignment, 10 = true and quiet","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'CASING_INTEGRITY', 'Casing Integrity', 'NUMBER'::"AttributeDataType", NULL, true, 30, '{"helpText":"0 = perforation or collapse suspected, 10 = casing sound on survey","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'SANITARY_SEAL', 'Wellhead Sanitary Seal', 'NUMBER'::"AttributeDataType", NULL, true, 40, '{"helpText":"0 = seal breached — contamination path open, 10 = sealed and vented correctly","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'DISCHARGE_PIPING', 'Discharge Piping & Valves', 'NUMBER'::"AttributeDataType", NULL, true, 50, '{"helpText":"0 = leaking or seized, 10 = tight and operating freely","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'ELECTRICAL_AND_CONTROLS', 'Electrical & Controls', 'NUMBER'::"AttributeDataType", NULL, true, 60, '{"helpText":"0 = faults, overheating or failed starts, 10 = clean, tight and testing correctly","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'INSTRUMENTATION', 'Instrumentation & Metering', 'NUMBER'::"AttributeDataType", NULL, true, 70, '{"helpText":"0 = not reading or uncalibrated, 10 = reading true against a check","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'SPECIFIC_CAPACITY', 'Specific Capacity Trend', 'NUMBER'::"AttributeDataType", NULL, true, 80, '{"helpText":"0 = yield well below the original test — screen fouling or drawdown, 10 = holding its original capacity","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'SITE_AND_ENCLOSURE', 'Site & Enclosure', 'NUMBER'::"AttributeDataType", NULL, true, 90, '{"helpText":"0 = building or enclosure unsound, site not draining, 10 = sound, secure and draining away","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'OTHER_DEFICIENCIES', 'Other Observed Deficiencies', 'TEXT'::"AttributeDataType", NULL, false, 200, '{"helpText":"Free-text notes on anything not captured above"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
  END IF;
  IF v_site IS NULL THEN
    RAISE EXCEPTION 'WELL has no site inspection form, and none is defined to create.';
  ELSE

    -- Consequence of failure, where none is set yet.
    UPDATE asset_type_component_types l SET consequence = 5 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 4 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'PUMP' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 3 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'MOTOR' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 3 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' AND l.consequence IS NULL;

    -- Each component type's inspection form, as the app would create it.
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Well Casing Inspection', 'Casing and grout seal, usually from a video log.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_CASING'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'VIDEO_FINDINGS', 'Video log findings', 'ENUM'::"AttributeDataType", NULL, false, 1, '{"options":["No defects","Minor","Major","Not logged"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'GROUT_SEAL_INTACT', 'Grout seal intact', 'BOOLEAN'::"AttributeDataType", NULL, false, 2, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'STATIC_LEVEL_FT', 'Static water level', 'NUMBER'::"AttributeDataType", 'ft bgs', false, 3, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Pump Test', 'Performance against the pump''s curve.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'FLOW_GPM', 'Flow', 'NUMBER'::"AttributeDataType", 'gpm', false, 1, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'DISCHARGE_PSI', 'Discharge pressure', 'NUMBER'::"AttributeDataType", 'psi', false, 2, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'VIBRATION_IPS', 'Vibration', 'NUMBER'::"AttributeDataType", 'in/s', false, 3, '{"helpText":"Peak velocity at the bearing housing"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'EFFICIENCY_PCT', 'Wire-to-water efficiency', 'NUMBER'::"AttributeDataType", '%', false, 4, '{"min":0,"max":100}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Motor Test', 'Electrical and thermal condition of the motor.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CURRENT_A', 'Running current', 'NUMBER'::"AttributeDataType", 'A', false, 1, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'INSULATION_MOHM', 'Insulation resistance', 'NUMBER'::"AttributeDataType", 'MΩ', false, 2, '{"helpText":"Megger, one minute"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'TEMPERATURE_F', 'Winding temperature', 'NUMBER'::"AttributeDataType", '°F', false, 3, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'VIBRATION_IPS', 'Vibration', 'NUMBER'::"AttributeDataType", 'in/s', false, 4, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Well Screen Inspection', 'Where fouling and sand show first.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'SPECIFIC_CAPACITY', 'Specific capacity', 'NUMBER'::"AttributeDataType", 'gpm/ft', false, 1, '{"helpText":"Falls as the screen fouls"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'ENCRUSTATION', 'Encrustation', 'ENUM'::"AttributeDataType", NULL, false, 2, '{"options":["None","Light","Moderate","Heavy"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'SAND_PPM', 'Sand production', 'NUMBER'::"AttributeDataType", 'ppm', false, 3, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;

    -- The models component scores are filed under (components.sql made them).
    v_cm := NULL;
    SELECT id INTO v_cm FROM condition_models WHERE "assetTypeId" = v_type AND formula->>'scope' = 'component' LIMIT 1;
    IF v_cm IS NULL THEN
      INSERT INTO condition_models (id, "assetTypeId", name, "scaleMin", "scaleMax", bands, formula, "isActive") VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Condition', 0, 100, '[]'::jsonb, '{"scope":"component","note":"Holds component condition scores; the asset''s own is rolled up from them."}'::jsonb, true) RETURNING id INTO v_cm;
    END IF;
    v_rm := NULL;
    SELECT id INTO v_rm FROM risk_models WHERE "assetTypeId" = v_type AND "probabilityConfig"->>'scope' = 'component' LIMIT 1;
    IF v_rm IS NULL THEN
      INSERT INTO risk_models (id, "assetTypeId", name, "probabilityConfig", "consequenceConfig", "isActive") VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Risk', '{"scope":"component"}'::jsonb, '{"scope":"component"}'::jsonb, true) RETURNING id INTO v_rm;
    END IF;

    -- WEL-01  Riverside Well 1 ----------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-01' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Major' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 127 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 37, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1350 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 75 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.25 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 64 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 50, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 459 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 159 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.07 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 97, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 25.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 85, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Major' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 98 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 25, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 5), 5 * COALESCE(v_cons, 5), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1000 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 66 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.37 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 53 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 11, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 4), 5 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 80 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 407 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 166 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.12 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 80, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 23.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 76, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Major' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 100 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 12, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 5), 5 * COALESCE(v_cons, 5), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2000 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 80 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 93, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 89 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 268 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 184 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.19 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 55, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 21.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 65, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- WEL-02  Riverside Well 2 ----------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-02' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'No defects' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 99 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 76, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 5), 2 * COALESCE(v_cons, 5), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2390 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 79 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.13 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 86, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 71 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 466 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 155 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.06 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 17.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 54, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Minor' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 98 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 68, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 5), 3 * COALESCE(v_cons, 5), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1200 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 75 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.22 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 67 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 56, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 394 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 164 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 84, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 15.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 38, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 3 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 3 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Minor' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 106 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 59, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 5), 3 * COALESCE(v_cons, 5), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1120 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 69 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.36 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 56 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 17, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 4), 5 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 84 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 304 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 184 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.18 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 61, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 20, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- WEL-03  Southport Well ------------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-03' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Major' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 133 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 42, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1540 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 80 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 92, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 88 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 184 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 204 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.27 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 34, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 10.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 5, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Major' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 104 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 31, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1890 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 77 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.18 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 70 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 71, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 74 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 477 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 155 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.06 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 28.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 95, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Major' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 131 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 20, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 5), 5 * COALESCE(v_cons, 5), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2000 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 72 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.29 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 62 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 39, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 4), 4 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 78 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 426 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 158 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.08 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 91, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 26.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 89, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- WEL-04  Eastgate Well -------------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-04' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'No defects' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 111 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2190 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.14 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 75 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 80, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 399 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 168 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.12 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 81, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 26.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 86, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'No defects' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 101 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 94, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1680 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 74 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.25 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 65 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 48, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 4), 4 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 83 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 316 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 187 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.19 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 58, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 23.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 77, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'No defects' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 105 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 88, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2170 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.08 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 80 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 96 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 167 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 203 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.28 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 28, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 21.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 66, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- WEL-05  Millbrook Well ------------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-05' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Minor' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 107 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 67, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 5), 3 * COALESCE(v_cons, 5), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1690 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 70 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.27 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 61 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 44, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 4), 4 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 381 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 170 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.14 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 76, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 13.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 25, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Minor' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 140 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 58, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 5), 3 * COALESCE(v_cons, 5), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1740 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.07 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 79 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 84 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 253 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 189 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.22 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 51, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 11.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 8, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Major' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 108 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 48, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 5), 4 * COALESCE(v_cons, 5), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1790 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.11 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 90, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 98 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 131 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 212 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.29 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 21, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 26.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 92, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- WEL-06  Highland Park Well --------------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-06' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'No defects' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 98 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 95, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1960 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 78 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.15 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 73 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 78, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 73 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 447 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 156 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.08 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 93, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 27.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 92, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMP_AND_MOTOR';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'COLUMN_AND_SHAFT';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'CASING_INTEGRITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SANITARY_SEAL';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'DISCHARGE_PIPING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SPECIFIC_CAPACITY';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_AND_ENCLOSURE';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_CASING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_CASING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_CASING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'No defects' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIDEO_FINDINGS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'GROUT_SEAL_INTACT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 96 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'STATIC_LEVEL_FT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 91, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 5), 1 * COALESCE(v_cons, 5), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2010 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 73 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.25 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 65 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 50, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 78 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 357 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 176 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.14 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 73, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'WELL_SCREEN' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'WELL_SCREEN';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 25.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SPECIFIC_CAPACITY';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ENCRUSTATION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'SAND_PPM';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 84, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;
  END IF;

  -- BOOSTER_PUMP_STATION ==============================================
  v_type := NULL;
  SELECT id, name INTO v_type, v_type_name FROM asset_types WHERE "organizationId" = v_org AND code = 'BOOSTER_PUMP_STATION';
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'No BOOSTER_PUMP_STATION asset type in this database — run facilities.sql first.';
  END IF;

  -- The site form: the active one, else the sample one by name, else it is
  -- created here exactly as facilities.sql creates it. Databases that took
  -- facilities.sql before the forms were added to it have none.
  v_site := NULL;
  SELECT id INTO v_site FROM inspection_templates WHERE "assetTypeId" = v_type AND "componentTypeId" IS NULL AND "isActive" ORDER BY "createdAt" LIMIT 1;
  IF v_site IS NULL THEN
    SELECT id INTO v_site FROM inspection_templates WHERE "assetTypeId" = v_type AND "componentTypeId" IS NULL AND name = 'Booster Pump Station Condition Assessment' ORDER BY "createdAt" LIMIT 1;
  END IF;
  IF v_site IS NULL THEN
    INSERT INTO inspection_templates (id, "assetTypeId", name, description, "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_type, 'Booster Pump Station Condition Assessment', 'Mechanical, electrical and structural inspection of a booster pump station.', true, now(), now())
    RETURNING id INTO v_site;
    IF v_site IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'PUMPS_AND_MOTORS', 'Pumps & Motors', 'NUMBER'::"AttributeDataType", NULL, true, 10, '{"helpText":"0 = failed or running outside its curve, 10 = performing to specification","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'PIPING_AND_VALVES', 'Piping & Valves', 'NUMBER'::"AttributeDataType", NULL, true, 20, '{"helpText":"0 = leaking, corroded or seized, 10 = tight and operating freely","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'ELECTRICAL_AND_CONTROLS', 'Electrical & Controls', 'NUMBER'::"AttributeDataType", NULL, true, 30, '{"helpText":"0 = faults, overheating or failed starts, 10 = clean, tight and testing correctly","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'SURGE_PROTECTION', 'Surge Protection', 'NUMBER'::"AttributeDataType", NULL, true, 40, '{"helpText":"0 = absent or not charged, 10 = present, charged and proven","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'INSTRUMENTATION_SCADA', 'Instrumentation & SCADA', 'NUMBER'::"AttributeDataType", NULL, true, 50, '{"helpText":"0 = not reporting or reading false, 10 = reporting true to the control room","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'STANDBY_POWER', 'Standby Power', 'NUMBER'::"AttributeDataType", NULL, true, 60, '{"helpText":"0 = none, or fails to start on test, 10 = starts and carries the load on test","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'BUILDING_STRUCTURE', 'Building & Structure', 'NUMBER'::"AttributeDataType", NULL, true, 70, '{"helpText":"0 = roof, walls or floor unsound, 10 = weathertight and sound","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'VENTILATION_AND_HEATING', 'Ventilation & Heating', 'NUMBER'::"AttributeDataType", NULL, true, 80, '{"helpText":"0 = not maintaining a safe temperature for the plant, 10 = working and adequate","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'SITE_SECURITY', 'Site Security', 'NUMBER'::"AttributeDataType", NULL, true, 90, '{"helpText":"0 = unsecured, 10 = fencing, locks and intrusion alarms sound","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_site, 'OTHER_DEFICIENCIES', 'Other Observed Deficiencies', 'TEXT'::"AttributeDataType", NULL, false, 200, '{"helpText":"Free-text notes on anything not captured above"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
  END IF;
  IF v_site IS NULL THEN
    RAISE EXCEPTION 'BOOSTER_PUMP_STATION has no site inspection form, and none is defined to create.';
  ELSE

    -- Consequence of failure, where none is set yet.
    UPDATE asset_type_component_types l SET consequence = 4 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'PUMP' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 3 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'MOTOR' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 3 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'PIPING' AND l.consequence IS NULL;
    UPDATE asset_type_component_types l SET consequence = 3 FROM component_types ct WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' AND l.consequence IS NULL;

    -- Each component type's inspection form, as the app would create it.
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Pump Test', 'Performance against the pump''s curve.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'FLOW_GPM', 'Flow', 'NUMBER'::"AttributeDataType", 'gpm', false, 1, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'DISCHARGE_PSI', 'Discharge pressure', 'NUMBER'::"AttributeDataType", 'psi', false, 2, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'VIBRATION_IPS', 'Vibration', 'NUMBER'::"AttributeDataType", 'in/s', false, 3, '{"helpText":"Peak velocity at the bearing housing"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'EFFICIENCY_PCT', 'Wire-to-water efficiency', 'NUMBER'::"AttributeDataType", '%', false, 4, '{"min":0,"max":100}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Motor Test', 'Electrical and thermal condition of the motor.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CURRENT_A', 'Running current', 'NUMBER'::"AttributeDataType", 'A', false, 1, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'INSULATION_MOHM', 'Insulation resistance', 'NUMBER'::"AttributeDataType", 'MΩ', false, 2, '{"helpText":"Megger, one minute"}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'TEMPERATURE_F', 'Winding temperature', 'NUMBER'::"AttributeDataType", '°F', false, 3, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'VIBRATION_IPS', 'Vibration', 'NUMBER'::"AttributeDataType", 'in/s', false, 4, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Station Piping Inspection', 'Headers, piping and valves inside the station.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PIPING'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'LEAKS', 'Leaks', 'ENUM'::"AttributeDataType", NULL, false, 1, '{"options":["None","Weeping","Active"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'EXTERNAL_CORROSION', 'External corrosion', 'ENUM'::"AttributeDataType", NULL, false, 2, '{"options":["None","Light","Moderate","Heavy"]}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'VALVES_EXERCISED', 'Valves exercised and operable', 'BOOLEAN'::"AttributeDataType", NULL, false, 3, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;
    v_ctpl := NULL;
    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
    IF v_ctpl IS NULL THEN
      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_type, ct.id, 'Controls Inspection', 'Electrical gear, instruments, SCADA and backup power.', true, now(), now() FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CONTROLS'
      RETURNING id INTO v_ctpl;
    END IF;
    IF v_ctpl IS NOT NULL THEN
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CONDITION', 'Condition', 'NUMBER'::"AttributeDataType", NULL, true, 0, '{"helpText":"0 failed · 3 poor · 5 fair · 7 good · 10 as new","min":0,"max":10}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'ALARMS_TESTED', 'Alarms tested and reporting', 'BOOLEAN'::"AttributeDataType", NULL, false, 1, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'CALIBRATION_CURRENT', 'Instrument calibration current', 'BOOLEAN'::"AttributeDataType", NULL, false, 2, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config) VALUES (gen_random_uuid()::text, v_ctpl, 'BACKUP_POWER_TESTED', 'Backup power tested', 'BOOLEAN'::"AttributeDataType", NULL, false, 3, '{}'::jsonb) ON CONFLICT ("templateId", code) DO NOTHING;
    END IF;

    -- The models component scores are filed under (components.sql made them).
    v_cm := NULL;
    SELECT id INTO v_cm FROM condition_models WHERE "assetTypeId" = v_type AND formula->>'scope' = 'component' LIMIT 1;
    IF v_cm IS NULL THEN
      INSERT INTO condition_models (id, "assetTypeId", name, "scaleMin", "scaleMax", bands, formula, "isActive") VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Condition', 0, 100, '[]'::jsonb, '{"scope":"component","note":"Holds component condition scores; the asset''s own is rolled up from them."}'::jsonb, true) RETURNING id INTO v_cm;
    END IF;
    v_rm := NULL;
    SELECT id INTO v_rm FROM risk_models WHERE "assetTypeId" = v_type AND "probabilityConfig"->>'scope' = 'component' LIMIT 1;
    IF v_rm IS NULL THEN
      INSERT INTO risk_models (id, "assetTypeId", name, "probabilityConfig", "consequenceConfig", "isActive") VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Risk', '{"scope":"component"}'::jsonb, '{"scope":"component"}'::jsonb, true) RETURNING id INTO v_rm;
    END IF;

    -- BPS-01  Riverside Booster Station -------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-01' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1960 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 83 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.07 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 78 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 87 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 274 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 187 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 53, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Active' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 24, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 26, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1620 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 78 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.11 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 75 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 89, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 94 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 140 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 207 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.28 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 25, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Active' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 9, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 92, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1890 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 75 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 68 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 64, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 78 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 487 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 158 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.07 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 66, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- BPS-02  Southport Booster Station -------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-02' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1910 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 69 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.33 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 58 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 25, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 4), 5 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 85 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 268 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 190 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.21 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 48, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 84, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 94, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1400 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 80 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.08 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 78 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 92 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 127 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 213 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.29 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 20, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 75, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 68, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1210 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.13 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 75 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 83, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 74 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 492 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 151 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.06 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 99, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 65, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 28, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- BPS-03  Downtown Booster Station --------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-03' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2110 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 71 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.27 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 62 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 43, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 4), 4 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 75 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 385 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 169 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.11 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 82, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 5.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Moderate' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 51, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 94, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1430 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 67 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.39 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 52 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 9, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 4), 5 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 84 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 331 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 182 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.17 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 63, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Weeping' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 38, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 65, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1350 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.12 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 76 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 88, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 93 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 225 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 200 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.24 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 39, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Active' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Heavy' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 23, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 22, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- BPS-04  Eastgate Booster Station --------------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-04' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2015-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2290 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 77 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.16 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 72 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 76, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 4), 2 * COALESCE(v_cons, 4), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 82 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 388 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 165 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.13 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 80, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 89, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2015-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.1 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2015-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 61, TIMESTAMP '2015-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2015-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 2150 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 73 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.25 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 64 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 47, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 4), 4 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 84 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 291 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 185 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.17 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 60, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 3), 3 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 82, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 15, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 3), 5 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 5 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 4 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1.2 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1830 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 65 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.38 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 54 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 12, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 5, COALESCE(v_cons, 4), 5 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 3.6 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 88 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 214 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 201 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.26 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 36, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.4 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'Light' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 74, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 93, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;

    -- BPS-05  River Road High Service Station -------------------
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-05' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN
      -- visit 2020-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 10 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1480 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 81 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.12 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 77 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 89, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 4), 1 * COALESCE(v_cons, 4), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 79 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 482 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 161 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.08 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 95, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 9 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 90, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2020-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 7.8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2020-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 78, TIMESTAMP '2020-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2020-06-01 00:00:00');
        END IF;
      END IF;
      -- visit 2025-06-01
      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_site, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, 'Sample inspection.', now()) RETURNING id INTO v_visit;
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PUMPS_AND_MOTORS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'PIPING_AND_VALVES';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'ELECTRICAL_AND_CONTROLS';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SURGE_PROTECTION';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 6 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'INSTRUMENTATION_SCADA';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'STANDBY_POWER';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'BUILDING_STRUCTURE';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'VENTILATION_AND_HEATING';
      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, 7 FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = 'SITE_SECURITY';
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PUMP' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PUMP' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PUMP';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 6.7 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 1610 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'FLOW_GPM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 77 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'DISCHARGE_PSI';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.19 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 68 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EFFICIENCY_PCT';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 67, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 3, COALESCE(v_cons, 4), 3 * COALESCE(v_cons, 4), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'MOTOR' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'MOTOR' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'MOTOR';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 83 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CURRENT_A';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 414 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'INSULATION_MOHM';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 169 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'TEMPERATURE_F';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 0.12 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VIBRATION_IPS';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 80, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 2, COALESCE(v_cons, 3), 2 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'PIPING' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'PIPING' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'PIPING';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 8.5 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'LEAKS';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "textValue") SELECT gen_random_uuid()::text, v_child, f.id, 'None' FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'EXTERNAL_CORROSION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'VALVES_EXERCISED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 85, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 1, COALESCE(v_cons, 3), 1 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
      v_comp := NULL;
      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId" WHERE c."assetId" = v_asset AND ct.code = 'CONTROLS' ORDER BY c."createdAt" LIMIT 1;
      IF v_comp IS NOT NULL THEN
        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId" WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = 'CONTROLS' ORDER BY t."createdAt" LIMIT 1;
        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId" WHERE l."assetTypeId" = v_type AND ct.code = 'CONTROLS';
        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, TIMESTAMP '2025-06-01 00:00:00', v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_child, f.id, 4.3 FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CONDITION';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'ALARMS_TESTED';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, false FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'CALIBRATION_CURRENT';
        INSERT INTO inspection_results (id, "inspectionId", "fieldId", "booleanValue") SELECT gen_random_uuid()::text, v_child, f.id, true FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = 'BACKUP_POWER_TESTED';
        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = TIMESTAMP '2025-06-01 00:00:00' AND "inspectionId" IS NULL;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 0 THEN
          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, 43, TIMESTAMP '2025-06-01 00:00:00', 'Inspection', v_child);
          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate") VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, 4, COALESCE(v_cons, 3), 4 * COALESCE(v_cons, 3), TIMESTAMP '2025-06-01 00:00:00');
        END IF;
      END IF;
    END IF;
  END IF;

  -- Each sample component's snapshot follows its latest readings, as the app keeps it.
  UPDATE asset_components c SET
    "conditionScore" = (SELECT m.score FROM condition_measurements m WHERE m."assetComponentId" = c.id ORDER BY m."measurementDate" DESC LIMIT 1),
    "riskScore" = (SELECT r."riskScore" FROM risk_assessments r WHERE r."assetComponentId" = c.id ORDER BY r."assessmentDate" DESC LIMIT 1),
    "scoresAsOf" = GREATEST(
      (SELECT max(m."measurementDate") FROM condition_measurements m WHERE m."assetComponentId" = c.id),
      (SELECT max(r."assessmentDate") FROM risk_assessments r WHERE r."assetComponentId" = c.id)),
    "updatedAt" = now()
  FROM assets a WHERE a.id = c."assetId" AND a."organizationId" = v_org
    AND a."assetCode" IN ('RSV-01', 'RSV-02', 'RSV-03', 'RSV-04', 'RSV-05', 'RSV-06', 'RSV-07', 'WEL-01', 'WEL-02', 'WEL-03', 'WEL-04', 'WEL-05', 'WEL-06', 'BPS-01', 'BPS-02', 'BPS-03', 'BPS-04', 'BPS-05');
END $$;

-- What landed. Expect every sample facility to have its visits, a finding for
-- each component on each, and every component reading linked to a visit.
SELECT t.name AS asset_type,
       count(DISTINCT a.id) AS facilities,
       count(*) FILTER (WHERE i."assetComponentId" IS NULL) AS visits,
       count(*) FILTER (WHERE i."assetComponentId" IS NOT NULL) AS component_findings,
       (SELECT count(*) FROM condition_measurements m JOIN assets a2 ON a2.id = m."assetId"
         WHERE a2."assetTypeId" = t.id AND m."assetComponentId" IS NOT NULL AND m."inspectionId" IS NULL) AS readings_without_a_visit
FROM asset_types t
JOIN assets a ON a."assetTypeId" = t.id AND a."deletedAt" IS NULL
LEFT JOIN inspections i ON i."assetId" = a.id
WHERE t.code IN ('RESERVOIR', 'WELL', 'BOOSTER_PUMP_STATION')
GROUP BY t.id, t.name ORDER BY t.name;
