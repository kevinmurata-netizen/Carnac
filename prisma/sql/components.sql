-- CARNAC — sample components for the sample facilities
--
-- GENERATED FILE. Produced by `npm run db:seed:components:sql` from
-- prisma/component-plan.ts. Edit that and regenerate; edits here are lost.
--
-- Run it after facilities.sql: it attaches components to those facilities.
-- Paste the whole file into a SQL console (Neon's editor, psql, …). It is
-- one transaction: it either all lands or none of it does. It adds the three
-- roll-up strategies (if the organization has none yet), 11 component types,
-- which parts each facility type is made of, and each sample facility's
-- components with their condition and risk history. It creates only what is
-- missing: a facility that already has components is left exactly as it is,
-- so it is safe to run again.
--
-- It writes to the organization created first, which is the only one in
-- every CARNAC instance so far. If yours holds more than one, put the id
-- you want in the SELECT below.

DO $$
DECLARE
  v_org       text;
  v_type      text;
  v_type_name text;
  v_cm        text;
  v_rm        text;
  v_asset     text;
  v_component text;
BEGIN
  SELECT id INTO v_org FROM organizations ORDER BY "createdAt" ASC LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No organization in this database — nothing to attach components to.';
  END IF;

  -- Roll-up strategies. The app creates these the first time Component
  -- Roll-up is opened; they are here so scores roll up before anyone has.
  IF NOT EXISTS (SELECT 1 FROM rollup_strategies WHERE "organizationId" = v_org) THEN
    INSERT INTO rollup_strategies (id, "organizationId", name, description, "strategyType", config, "isDefault", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_org, 'Weighted worst case', 'An asset is as bad as its worst part, to the extent that part matters: the highest-risk component pulls the score toward its own, all the way once it is a large enough share of the asset.', 'WEIGHTED_WORST_CASE'::"RollupStrategyType", '{"fullWeightShare":0.25}'::jsonb, true, now(), now());
    INSERT INTO rollup_strategies (id, "organizationId", name, description, "strategyType", config, "isDefault", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_org, 'Replacement-cost weighted average', 'Every component counted by its share of what the asset costs to replace.', 'REPLACEMENT_COST_WEIGHTED_AVERAGE'::"RollupStrategyType", '{}'::jsonb, false, now(), now());
    INSERT INTO rollup_strategies (id, "organizationId", name, description, "strategyType", config, "isDefault", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_org, 'Simple average', 'Every component counted equally — a baseline to check the others against.', 'SIMPLE_AVERAGE'::"RollupStrategyType", '{}'::jsonb, false, now(), now());
  END IF;

  -- Component types -------------------------------------------------
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'TANK_SHELL', 'Tank Shell', 'The walls that hold the water — steel plate or concrete.', '{"type":"object","properties":{"material":{"type":"string","enum":["Steel","Concrete","Prestressed Concrete"],"title":"Material","propertyOrder":0},"wallThicknessIn":{"type":"number","minimum":0,"title":"Wall thickness (in)","propertyOrder":1}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'ROOF', 'Roof', 'The roof, its structure and its hatches.', '{"type":"object","properties":{"roofType":{"type":"string","enum":["Dome","Cone","Flat slab"],"title":"Roof type","propertyOrder":0}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'FLOOR', 'Floor', 'The floor slab or bottom plate.', '{"type":"object","properties":{"material":{"type":"string","title":"Material","propertyOrder":0}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'COATING_SYSTEM', 'Coating System', 'Interior and exterior coatings. Recoated on its own cycle, independent of the structure.', '{"type":"object","properties":{"system":{"type":"string","title":"Coating system","propertyOrder":0},"lastRecoatYear":{"type":"integer","title":"Last recoated (year)","propertyOrder":1},"dryFilmThicknessMils":{"type":"number","minimum":0,"title":"Dry film thickness (mils)","propertyOrder":2}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'CATHODIC_PROTECTION', 'Cathodic Protection', 'Anodes or impressed-current system protecting steel from corrosion.', '{"type":"object","properties":{"system":{"type":"string","enum":["Galvanic","Impressed current"],"title":"System","propertyOrder":0},"lastSurveyYear":{"type":"integer","title":"Last surveyed (year)","propertyOrder":1}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'WELL_CASING', 'Casing', 'The well casing and its grout seal.', '{"type":"object","properties":{"diameterIn":{"type":"number","title":"Diameter (in)","propertyOrder":0},"depthFt":{"type":"number","title":"Depth (ft)","propertyOrder":1}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'PUMP', 'Pump', 'The pump — submersible or vertical turbine in a well, centrifugal in a station.', '{"type":"object","properties":{"make":{"type":"string","title":"Make","propertyOrder":0},"ratedGpm":{"type":"number","title":"Rated flow (gpm)","propertyOrder":1}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'MOTOR', 'Motor', 'The electric motor driving the pump.', '{"type":"object","properties":{"horsepower":{"type":"number","title":"Horsepower","propertyOrder":0},"vfd":{"type":"boolean","title":"Variable frequency drive","propertyOrder":1}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'WELL_SCREEN', 'Screen', 'The screen admitting water from the aquifer — where fouling shows first.', '{"type":"object","properties":{"slotSizeIn":{"type":"number","title":"Slot size (in)","propertyOrder":0},"material":{"type":"string","title":"Material","propertyOrder":1}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'PIPING', 'Piping', 'Station piping, headers and valves.', '{"type":"object","properties":{"material":{"type":"string","title":"Material","propertyOrder":0}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;
  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, 'CONTROLS', 'Controls', 'Electrical gear, instrumentation and SCADA.', '{"type":"object","properties":{"plc":{"type":"string","title":"PLC","propertyOrder":0},"scada":{"type":"boolean","title":"SCADA","propertyOrder":1}}}'::jsonb, now(), now())
  ON CONFLICT ("organizationId", code) DO NOTHING;

  -- RESERVOIR ---------------------------------------------------------
  SELECT id, name INTO v_type, v_type_name FROM asset_types WHERE "organizationId" = v_org AND code = 'RESERVOIR';
  IF v_type IS NULL THEN
    RAISE NOTICE 'No RESERVOIR asset type — run facilities.sql first. Skipped.';
  ELSE
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 45, 0 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 15, 1 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 15, 2 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 15, 3 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 10, 4 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;

    -- The models component scores belong to, marked so that whole-asset
    -- lookups never take them for the asset's own.
    v_cm := NULL;
    SELECT id INTO v_cm FROM condition_models WHERE "assetTypeId" = v_type AND formula->>'scope' = 'component' LIMIT 1;
    IF v_cm IS NULL THEN
      INSERT INTO condition_models (id, "assetTypeId", name, "scaleMin", "scaleMax", bands, formula, "isActive")
      VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Condition', 0, 100, '[]'::jsonb, '{"scope":"component","note":"Holds component condition scores; the asset''s own is rolled up from them."}'::jsonb, true)
      RETURNING id INTO v_cm;
    END IF;
    v_rm := NULL;
    SELECT id INTO v_rm FROM risk_models WHERE "assetTypeId" = v_type AND "probabilityConfig"->>'scope' = 'component' LIMIT 1;
    IF v_rm IS NULL THEN
      INSERT INTO risk_models (id, "assetTypeId", name, "probabilityConfig", "consequenceConfig", "isActive")
      VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Risk', '{"scope":"component"}'::jsonb, '{"scope":"component"}'::jsonb, true)
      RETURNING id INTO v_rm;
    END IF;

    -- RSV-01  Riverside Reservoir
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-01' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 46, 20, TIMESTAMP '2022-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 46, TIMESTAMP '2022-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 5, 20, TIMESTAMP '2022-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 99, 3, TIMESTAMP '2022-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 99, TIMESTAMP '2022-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2022-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 41, 16, TIMESTAMP '2022-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 41, TIMESTAMP '2022-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 4, 16, TIMESTAMP '2022-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 42, 8, TIMESTAMP '2022-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 42, TIMESTAMP '2022-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 2, 8, TIMESTAMP '2022-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 49, 12, TIMESTAMP '2022-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 49, TIMESTAMP '2022-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 3, 12, TIMESTAMP '2022-01-01 00:00:00');
    END IF;

    -- RSV-02  Southport Tank
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-02' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 78, 10, TIMESTAMP '2019-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 90, TIMESTAMP '2014-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 5, 5, TIMESTAMP '2014-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 78, TIMESTAMP '2019-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 5, 10, TIMESTAMP '2019-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 70, 6, TIMESTAMP '2019-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 82, TIMESTAMP '2014-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2014-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 70, TIMESTAMP '2019-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2019-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 82, 8, TIMESTAMP '2019-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 94, TIMESTAMP '2014-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 4, 4, TIMESTAMP '2014-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 82, TIMESTAMP '2019-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 4, 8, TIMESTAMP '2019-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 48, 8, TIMESTAMP '2019-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 60, TIMESTAMP '2014-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 2, 6, TIMESTAMP '2014-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 48, TIMESTAMP '2019-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 2, 8, TIMESTAMP '2019-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 14, 15, TIMESTAMP '2019-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 26, TIMESTAMP '2014-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 3, 15, TIMESTAMP '2014-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 14, TIMESTAMP '2019-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 3, 15, TIMESTAMP '2019-01-01 00:00:00');
    END IF;

    -- RSV-03  Meridian Central Reservoir
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-03' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 24, 25, TIMESTAMP '2023-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 24, TIMESTAMP '2023-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 5, 25, TIMESTAMP '2023-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 76, 6, TIMESTAMP '2023-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 76, TIMESTAMP '2023-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2023-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 10, 20, TIMESTAMP '2023-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 10, TIMESTAMP '2023-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 4, 20, TIMESTAMP '2023-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 86, 2, TIMESTAMP '2023-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 86, TIMESTAMP '2023-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 2, 2, TIMESTAMP '2023-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 86, 3, TIMESTAMP '2023-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 86, TIMESTAMP '2023-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2023-01-01 00:00:00');
    END IF;

    -- RSV-04  Eastgate Tank
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-04' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 70, 10, TIMESTAMP '2021-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 70, TIMESTAMP '2021-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 5, 10, TIMESTAMP '2021-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 47, 12, TIMESTAMP '2021-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 47, TIMESTAMP '2021-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 3, 12, TIMESTAMP '2021-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 68, 12, TIMESTAMP '2021-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 68, TIMESTAMP '2021-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 4, 12, TIMESTAMP '2021-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 58, 6, TIMESTAMP '2021-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 58, TIMESTAMP '2021-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 2, 6, TIMESTAMP '2021-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 66, 9, TIMESTAMP '2021-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 66, TIMESTAMP '2021-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2021-01-01 00:00:00');
    END IF;

    -- RSV-05  Highland Park Reservoir
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-05' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 91, 5, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 99, TIMESTAMP '2019-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 5, 5, TIMESTAMP '2019-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 91, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 5, 5, TIMESTAMP '2024-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 62, 9, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 74, TIMESTAMP '2019-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2019-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 62, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2024-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 93, 4, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 99, TIMESTAMP '2019-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 4, 4, TIMESTAMP '2019-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 93, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 4, 4, TIMESTAMP '2024-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 84, 4, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 96, TIMESTAMP '2019-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 2, 2, TIMESTAMP '2019-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 84, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 2, 4, TIMESTAMP '2024-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 88, 3, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 99, TIMESTAMP '2019-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2019-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 88, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2024-01-01 00:00:00');
    END IF;

    -- RSV-06  Millbrook Tank
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-06' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 34, 20, TIMESTAMP '2017-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 46, TIMESTAMP '2012-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 5, 20, TIMESTAMP '2012-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 34, TIMESTAMP '2017-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 5, 20, TIMESTAMP '2017-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 58, 9, TIMESTAMP '2017-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 70, TIMESTAMP '2012-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2012-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 58, TIMESTAMP '2017-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2017-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 66, 12, TIMESTAMP '2017-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 78, TIMESTAMP '2012-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 4, 8, TIMESTAMP '2012-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 66, TIMESTAMP '2017-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 4, 12, TIMESTAMP '2017-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 41, 8, TIMESTAMP '2017-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 53, TIMESTAMP '2012-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 2, 6, TIMESTAMP '2012-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 41, TIMESTAMP '2017-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 2, 8, TIMESTAMP '2017-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 60, 9, TIMESTAMP '2017-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 72, TIMESTAMP '2012-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2012-06-01 00:00:00');
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 60, TIMESTAMP '2017-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2017-01-01 00:00:00');
    END IF;

    -- RSV-07  North Hill Standpipe
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-07' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 88, 5, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'TANK_SHELL'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 88, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 5, 5, TIMESTAMP '2024-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 91, 3, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'ROOF'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 91, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2024-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 98, 4, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'FLOOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 98, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 4, 4, TIMESTAMP '2024-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 46, 8, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'COATING_SYSTEM'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 46, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 2, 8, TIMESTAMP '2024-01-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 48, 12, TIMESTAMP '2024-01-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CATHODIC_PROTECTION'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 48, TIMESTAMP '2024-01-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 3, 12, TIMESTAMP '2024-01-01 00:00:00');
    END IF;
  END IF;

  -- WELL --------------------------------------------------------------
  SELECT id, name INTO v_type, v_type_name FROM asset_types WHERE "organizationId" = v_org AND code = 'WELL';
  IF v_type IS NULL THEN
    RAISE NOTICE 'No WELL asset type — run facilities.sql first. Skipped.';
  ELSE
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 35, 0 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_CASING'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 25, 1 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 20, 2 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 20, 3 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;

    -- The models component scores belong to, marked so that whole-asset
    -- lookups never take them for the asset's own.
    v_cm := NULL;
    SELECT id INTO v_cm FROM condition_models WHERE "assetTypeId" = v_type AND formula->>'scope' = 'component' LIMIT 1;
    IF v_cm IS NULL THEN
      INSERT INTO condition_models (id, "assetTypeId", name, "scaleMin", "scaleMax", bands, formula, "isActive")
      VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Condition', 0, 100, '[]'::jsonb, '{"scope":"component","note":"Holds component condition scores; the asset''s own is rolled up from them."}'::jsonb, true)
      RETURNING id INTO v_cm;
    END IF;
    v_rm := NULL;
    SELECT id INTO v_rm FROM risk_models WHERE "assetTypeId" = v_type AND "probabilityConfig"->>'scope' = 'component' LIMIT 1;
    IF v_rm IS NULL THEN
      INSERT INTO risk_models (id, "assetTypeId", name, "probabilityConfig", "consequenceConfig", "isActive")
      VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Risk', '{"scope":"component"}'::jsonb, '{"scope":"component"}'::jsonb, true)
      RETURNING id INTO v_rm;
    END IF;

    -- WEL-01  Riverside Well 1
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-01' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 12, 25, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_CASING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 12, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 5, 25, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 93, 4, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 93, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 4, 4, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 55, 9, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 55, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 65, 9, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 65, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- WEL-02  Riverside Well 2
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-02' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 59, 15, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_CASING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 59, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 5, 15, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 17, 20, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 17, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 4, 20, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 61, 9, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 61, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 20, 15, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 20, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 3, 15, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- WEL-03  Southport Well
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-03' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 20, 25, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_CASING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 20, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 5, 25, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 39, 16, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 39, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 4, 16, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 91, 3, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 91, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 89, 3, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 89, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- WEL-04  Eastgate Well
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-04' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 88, 5, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_CASING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 88, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 5, 5, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 99, 4, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 99, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 4, 4, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 28, 15, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 28, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 3, 15, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 66, 9, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 66, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- WEL-05  Millbrook Well
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-05' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 48, 20, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_CASING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 48, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 5, 20, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 90, 4, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 90, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 4, 4, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 21, 15, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 21, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 3, 15, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 92, 3, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 92, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- WEL-06  Highland Park Well
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-06' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 91, 5, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_CASING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 91, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 5, 5, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 50, 12, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 50, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 4, 12, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 73, 6, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 73, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 84, 6, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'WELL_SCREEN'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 84, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2025-06-01 00:00:00');
    END IF;
  END IF;

  -- BOOSTER_PUMP_STATION ----------------------------------------------
  SELECT id, name INTO v_type, v_type_name FROM asset_types WHERE "organizationId" = v_org AND code = 'BOOSTER_PUMP_STATION';
  IF v_type IS NULL THEN
    RAISE NOTICE 'No BOOSTER_PUMP_STATION asset type — run facilities.sql first. Skipped.';
  ELSE
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 35, 0 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 25, 1 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 20, 2 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PIPING'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;
    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")
    SELECT v_type, ct.id, 20, 3 FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CONTROLS'
    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;

    -- The models component scores belong to, marked so that whole-asset
    -- lookups never take them for the asset's own.
    v_cm := NULL;
    SELECT id INTO v_cm FROM condition_models WHERE "assetTypeId" = v_type AND formula->>'scope' = 'component' LIMIT 1;
    IF v_cm IS NULL THEN
      INSERT INTO condition_models (id, "assetTypeId", name, "scaleMin", "scaleMax", bands, formula, "isActive")
      VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Condition', 0, 100, '[]'::jsonb, '{"scope":"component","note":"Holds component condition scores; the asset''s own is rolled up from them."}'::jsonb, true)
      RETURNING id INTO v_cm;
    END IF;
    v_rm := NULL;
    SELECT id INTO v_rm FROM risk_models WHERE "assetTypeId" = v_type AND "probabilityConfig"->>'scope' = 'component' LIMIT 1;
    IF v_rm IS NULL THEN
      INSERT INTO risk_models (id, "assetTypeId", name, "probabilityConfig", "consequenceConfig", "isActive")
      VALUES (gen_random_uuid()::text, v_type, v_type_name || ' Component Risk', '{"scope":"component"}'::jsonb, '{"scope":"component"}'::jsonb, true)
      RETURNING id INTO v_rm;
    END IF;

    -- BPS-01  Riverside Booster Station
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-01' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 64, 12, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 64, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 4, 12, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 99, 3, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 99, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 99, 3, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PIPING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 99, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 66, 9, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CONTROLS'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 66, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- BPS-02  Southport Booster Station
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-02' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 83, 8, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 83, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 4, 8, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 99, 3, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 99, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 65, 9, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PIPING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 65, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 3, 9, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 28, 15, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CONTROLS'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 28, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 3, 15, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- BPS-03  Downtown Booster Station
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-03' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 88, 4, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 88, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 4, 4, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 39, 12, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 39, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 3, 12, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 23, 15, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PIPING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 23, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 3, 15, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 22, 15, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CONTROLS'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 22, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 3, 15, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- BPS-04  Eastgate Booster Station
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-04' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 12, 20, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 12, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 5, 4, 20, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 36, 12, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 36, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 3, 12, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 74, 6, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PIPING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 74, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 93, 3, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CONTROLS'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 93, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2025-06-01 00:00:00');
    END IF;

    -- BPS-05  River Road High Service Station
    v_asset := NULL;
    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-05' AND "deletedAt" IS NULL;
    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 67, 12, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PUMP'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 67, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 3, 4, 12, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 80, 6, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'MOTOR'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 80, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 2, 3, 6, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 85, 3, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'PIPING'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 85, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 1, 3, 3, TIMESTAMP '2025-06-01 00:00:00');
      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, v_asset, ct.id, 43, 12, TIMESTAMP '2025-06-01 00:00:00', '{}'::jsonb, now(), now()
      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = 'CONTROLS'
      RETURNING id INTO v_component;
      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, 43, TIMESTAMP '2025-06-01 00:00:00', 'Inspection');
      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")
      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, 4, 3, 12, TIMESTAMP '2025-06-01 00:00:00');
    END IF;
  END IF;
END $$;

-- What landed. Expect Booster Pump Station 5 facilities with 20 components,
-- Reservoir 7 with 35, Well 6 with 24 — every component scored.
SELECT t.name AS asset_type,
       count(DISTINCT a.id) AS facilities,
       count(c.id) AS components,
       count(c."conditionScore") AS scored,
       (SELECT count(*) FROM asset_type_component_types l WHERE l."assetTypeId" = t.id) AS component_types
FROM asset_types t
JOIN assets a ON a."assetTypeId" = t.id AND a."deletedAt" IS NULL
LEFT JOIN asset_components c ON c."assetId" = a.id
WHERE t.code IN ('RESERVOIR', 'WELL', 'BOOSTER_PUMP_STATION')
GROUP BY t.id, t.name ORDER BY t.name;
