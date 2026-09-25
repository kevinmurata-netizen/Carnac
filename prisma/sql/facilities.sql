-- CARNAC — sample storage, supply and pumping facilities
--
-- GENERATED FILE. Produced by `npm run db:seed:facilities:sql` from
-- prisma/facilities.ts. Edit that and regenerate; edits here are lost.
--
-- Paste the whole file into a SQL console (Neon's editor, psql, …). It is
-- one transaction: it either all lands or none of it does. It adds three
-- asset types, their attribute definitions, and 18 facilities with their
-- attributes and map positions. It creates only what is missing and
-- changes nothing that is already there, so running it twice is safe.
--
-- It writes to the organization created first, which is the only one in
-- every CARNAC instance so far. If yours holds more than one, put the id
-- you want in the SELECT below.

DO $$
DECLARE
  v_org  text;
  v_type text;
  v_asset text;
BEGIN
  SELECT id INTO v_org FROM organizations ORDER BY "createdAt" ASC LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No organization in this database — nothing to attach facilities to.';
  END IF;

  -- Reservoir ---------------------------------------------------------
  INSERT INTO asset_types (id, code, name, description, "organizationId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'RESERVOIR', 'Reservoir', 'Finished-water storage: tanks and reservoirs, by capacity, construction and elevation.', v_org, now(), now())
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_type FROM asset_types WHERE code = 'RESERVOIR';

  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'FACILITY_ID', 'Facility ID', 'TEXT'::"AttributeDataType", NULL, false, 0, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'ADDRESS', 'Street Address', 'TEXT'::"AttributeDataType", NULL, false, 1, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'LOCATION_BASIS', 'Location Basis', 'TEXT'::"AttributeDataType", NULL, false, 2, '{"help":"How this asset came by its position: surveyed, geocoded from a published address, scattered inside the service area because the address did not match, or drawn illustratively. A basis that begins Scattered or Illustrative is not a real location, and the map draws it faded."}'::jsonb)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'CAPACITY_MG', 'Capacity', 'NUMBER'::"AttributeDataType", 'MG', false, 3, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'MATERIAL', 'Material', 'ENUM'::"AttributeDataType", NULL, false, 4, '{"options":["Concrete","Prestressed Concrete","Steel","Buried Concrete","Other","Unknown"]}'::jsonb)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'LAST_INSPECTED', 'Last Inspected', 'DATE'::"AttributeDataType", NULL, false, 5, '{"help":"Interior inspection — drained, or by diver or ROV. Utilities publish a year rather than a date, so this is accurate to the year."}'::jsonb)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'FLOOR_ELEV_FT', 'Floor Elevation', 'NUMBER'::"AttributeDataType", 'ft', false, 6, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'OVERFLOW_ELEV_FT', 'Overflow Elevation', 'NUMBER'::"AttributeDataType", 'ft', false, 7, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;

  -- RSV-01  Riverside Reservoir
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'RSV-01', 'Riverside Reservoir', 'ACTIVE'::"AssetStatus", 'Water Storage', TIMESTAMP '1972-06-15 00:00:00', 80, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-01';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'RSV-01', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '1420 River Bluff Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Riverside, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 6, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_MG'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Prestressed Concrete', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'MATERIAL'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, NULL, TIMESTAMP '2022-01-01 00:00:00'
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LAST_INSPECTED'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1340, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FLOOR_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1372, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'OVERFLOW_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.37988, 37.71642), 4326), 37.71642, -97.37988, 'Riverside', 'Zone A - Low'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- RSV-02  Southport Tank
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'RSV-02', 'Southport Tank', 'ACTIVE'::"AssetStatus", 'Water Storage', TIMESTAMP '1988-06-15 00:00:00', 60, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-02';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'RSV-02', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '905 Southport Avenue', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Southport, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 2, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_MG'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Steel', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'MATERIAL'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, NULL, TIMESTAMP '2019-01-01 00:00:00'
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LAST_INSPECTED'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1338, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FLOOR_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1372, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'OVERFLOW_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.28715, 37.65704), 4326), 37.65704, -97.28715, 'Southport', 'Zone A - Low'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- RSV-03  Meridian Central Reservoir
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'RSV-03', 'Meridian Central Reservoir', 'ACTIVE'::"AssetStatus", 'Water Storage', TIMESTAMP '1961-06-15 00:00:00', 80, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-03';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'RSV-03', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '300 Waterworks Lane', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Downtown, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 8, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_MG'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Concrete', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'MATERIAL'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, NULL, TIMESTAMP '2023-01-01 00:00:00'
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LAST_INSPECTED'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1426, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FLOOR_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1456, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'OVERFLOW_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.37846, 37.66948), 4326), 37.66948, -97.37846, 'Downtown', 'Zone B - Mid'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- RSV-04  Eastgate Tank
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'RSV-04', 'Eastgate Tank', 'ACTIVE'::"AssetStatus", 'Water Storage', TIMESTAMP '1995-06-15 00:00:00', 60, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-04';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'RSV-04', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '2200 Eastgate Boulevard', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Eastgate, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 3, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_MG'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Steel', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'MATERIAL'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, NULL, TIMESTAMP '2021-01-01 00:00:00'
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LAST_INSPECTED'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1420, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FLOOR_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1456, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'OVERFLOW_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.32644, 37.71508), 4326), 37.71508, -97.32644, 'Eastgate', 'Zone B - Mid'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- RSV-05  Highland Park Reservoir
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'RSV-05', 'Highland Park Reservoir', 'ACTIVE'::"AssetStatus", 'Water Storage', TIMESTAMP '2004-06-15 00:00:00', 80, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-05';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'RSV-05', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '1750 Summit Ridge Drive', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Highland Park, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 4, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_MG'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Prestressed Concrete', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'MATERIAL'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, NULL, TIMESTAMP '2024-01-01 00:00:00'
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LAST_INSPECTED'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1512, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FLOOR_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1544, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'OVERFLOW_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.32718, 37.66105), 4326), 37.66105, -97.32718, 'Highland Park', 'Zone C - High'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- RSV-06  Millbrook Tank
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'RSV-06', 'Millbrook Tank', 'ACTIVE'::"AssetStatus", 'Water Storage', TIMESTAMP '1979-06-15 00:00:00', 60, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-06';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'RSV-06', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '4100 Millbrook Heights Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Millbrook, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1.5, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_MG'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Steel', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'MATERIAL'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, NULL, TIMESTAMP '2017-01-01 00:00:00'
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LAST_INSPECTED'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1506, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FLOOR_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1544, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'OVERFLOW_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.28846, 37.71702), 4326), 37.71702, -97.28846, 'Millbrook', 'Zone C - High'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- RSV-07  North Hill Standpipe
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'RSV-07', 'North Hill Standpipe', 'ACTIVE'::"AssetStatus", 'Water Storage', TIMESTAMP '2013-06-15 00:00:00', 80, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'RSV-07';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'RSV-07', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '3615 North Hill Court', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Millbrook, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 0.75, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_MG'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Concrete', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'MATERIAL'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, NULL, TIMESTAMP '2024-01-01 00:00:00'
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LAST_INSPECTED'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1500, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FLOOR_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1544, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'OVERFLOW_ELEV_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.30122, 37.70486), 4326), 37.70486, -97.30122, 'Millbrook', 'Zone C - High'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- Well --------------------------------------------------------------
  INSERT INTO asset_types (id, code, name, description, "organizationId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'WELL', 'Well', 'Groundwater production wells, with design capacity, setting and what each one produced and cost to run.', v_org, now(), now())
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_type FROM asset_types WHERE code = 'WELL';

  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'FACILITY_ID', 'Facility ID', 'TEXT'::"AttributeDataType", NULL, false, 0, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'ADDRESS', 'Street Address', 'TEXT'::"AttributeDataType", NULL, false, 1, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'LOCATION_BASIS', 'Location Basis', 'TEXT'::"AttributeDataType", NULL, false, 2, '{"help":"How this asset came by its position: surveyed, geocoded from a published address, scattered inside the service area because the address did not match, or drawn illustratively. A basis that begins Scattered or Illustrative is not a real location, and the map draws it faded."}'::jsonb)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'DESIGN_CAPACITY_CFS', 'Design Capacity', 'NUMBER'::"AttributeDataType", 'cfs', false, 3, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'WELL_SETTING_LEVEL_FT', 'Well Setting Level', 'NUMBER'::"AttributeDataType", 'ft', false, 4, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'ANNUAL_PRODUCTION_AF', 'Annual Production', 'NUMBER'::"AttributeDataType", 'AF', false, 5, '{"help":"The most recent year. The year-by-year series is in Production History."}'::jsonb)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'ANNUAL_PRODUCTION_HISTORY', 'Production History', 'TEXT'::"AttributeDataType", NULL, false, 6, '{"help":"Year-by-year production as JSON, e.g. {\"2023\":812,\"2024\":905,\"2025\":774}. Text because the attribute model has no series type; the single number above is what anything sorting or ranking reads."}'::jsonb)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'TOTAL_POWER_COST', 'Total Power Cost', 'NUMBER'::"AttributeDataType", '$', false, 7, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'AVG_COST_PER_AF', 'Average Cost per Acre-Foot', 'NUMBER'::"AttributeDataType", '$/AF', false, 8, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;

  -- WEL-01  Riverside Well 1
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'WEL-01', 'Riverside Well 1', 'ACTIVE'::"AssetStatus", 'Water Supply', TIMESTAMP '1968-06-15 00:00:00', 50, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-01';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'WEL-01', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '80 Cottonwood Flats Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Riverside, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 3.1, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'DESIGN_CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 240, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'WELL_SETTING_LEVEL_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 874, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '{"2023":902,"2024":968,"2025":874}', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_HISTORY'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 50600, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 58, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.38284, 37.70632), 4326), 37.70632, -97.38284, 'Riverside', 'Zone A - Low'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- WEL-02  Riverside Well 2
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'WEL-02', 'Riverside Well 2', 'ACTIVE'::"AssetStatus", 'Water Supply', TIMESTAMP '1991-06-15 00:00:00', 50, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-02';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'WEL-02', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '145 Cottonwood Flats Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Riverside, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 2.4, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'DESIGN_CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 265, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'WELL_SETTING_LEVEL_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 703, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '{"2023":640,"2024":612,"2025":703}', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_HISTORY'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 43600, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 62, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.36612, 37.71884), 4326), 37.71884, -97.36612, 'Riverside', 'Zone A - Low'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- WEL-03  Southport Well
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'WEL-03', 'Southport Well', 'ACTIVE'::"AssetStatus", 'Water Supply', TIMESTAMP '1977-06-15 00:00:00', 50, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-03';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'WEL-03', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '612 Harbor Works Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Southport, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 4.2, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'DESIGN_CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 310, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'WELL_SETTING_LEVEL_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1096, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '{"2023":1180,"2024":1244,"2025":1096}', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_HISTORY'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 75800, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 69, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.29918, 37.67012), 4326), 37.67012, -97.29918, 'Southport', 'Zone A - Low'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- WEL-04  Eastgate Well
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'WEL-04', 'Eastgate Well', 'ACTIVE'::"AssetStatus", 'Water Supply', TIMESTAMP '2008-06-15 00:00:00', 50, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-04';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'WEL-04', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '1890 Orchard Street', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Eastgate, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1.9, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'DESIGN_CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 195, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'WELL_SETTING_LEVEL_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 502, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '{"2023":418,"2024":455,"2025":502}', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_HISTORY'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 25400, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 51, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.34188, 37.70214), 4326), 37.70214, -97.34188, 'Eastgate', 'Zone B - Mid'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- WEL-05  Millbrook Well
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'WEL-05', 'Millbrook Well', 'ACTIVE'::"AssetStatus", 'Water Supply', TIMESTAMP '1985-06-15 00:00:00', 50, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-05';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'WEL-05', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '4320 Quarry Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Millbrook, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 2.8, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'DESIGN_CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 402, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'WELL_SETTING_LEVEL_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 648, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '{"2023":735,"2024":690,"2025":648}', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_HISTORY'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 54400, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 84, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.30284, 37.72004), 4326), 37.72004, -97.30284, 'Millbrook', 'Zone C - High'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- WEL-06  Highland Park Well
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'WEL-06', 'Highland Park Well', 'ACTIVE'::"AssetStatus", 'Water Supply', TIMESTAMP '2015-06-15 00:00:00', 50, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'WEL-06';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'WEL-06', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '1205 Bench Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Highland Park, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 3.6, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'DESIGN_CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 355, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'WELL_SETTING_LEVEL_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1145, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '{"2023":1010,"2024":1092,"2025":1145}', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ANNUAL_PRODUCTION_HISTORY'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 87500, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 76, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.34402, 37.67288), 4326), 37.67288, -97.34402, 'Highland Park', 'Zone C - High'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- Booster Pump Station ----------------------------------------------
  INSERT INTO asset_types (id, code, name, description, "organizationId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'BOOSTER_PUMP_STATION', 'Booster Pump Station', 'Pump stations that lift water between pressure zones, with capacity, lift and what pumping cost.', v_org, now(), now())
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_type FROM asset_types WHERE code = 'BOOSTER_PUMP_STATION';

  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'FACILITY_ID', 'Facility ID', 'TEXT'::"AttributeDataType", NULL, false, 0, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'ADDRESS', 'Street Address', 'TEXT'::"AttributeDataType", NULL, false, 1, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'LOCATION_BASIS', 'Location Basis', 'TEXT'::"AttributeDataType", NULL, false, 2, '{"help":"How this asset came by its position: surveyed, geocoded from a published address, scattered inside the service area because the address did not match, or drawn illustratively. A basis that begins Scattered or Illustrative is not a real location, and the map draws it faded."}'::jsonb)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'ZONE', 'Pressure Zone', 'TEXT'::"AttributeDataType", NULL, false, 3, '{"help":"The zone the station discharges into, which is the one it exists to serve."}'::jsonb)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'CAPACITY_CFS', 'Capacity', 'NUMBER'::"AttributeDataType", 'cfs', false, 4, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'TOTAL_HP', 'Total Horsepower', 'NUMBER'::"AttributeDataType", 'hp', false, 5, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'AVG_DYNAMIC_LIFT_FT', 'Average Dynamic Lift', 'NUMBER'::"AttributeDataType", 'ft', false, 6, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'VOLUME_PUMPED_AF', 'Volume Pumped', 'NUMBER'::"AttributeDataType", 'AF', false, 7, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'TOTAL_POWER_COST', 'Total Power Cost', 'NUMBER'::"AttributeDataType", '$', false, 8, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;
  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)
  VALUES (gen_random_uuid()::text, v_type, 'AVG_COST_PER_AF', 'Average Cost per Acre-Foot', 'NUMBER'::"AttributeDataType", '$/AF', false, 9, NULL)
  ON CONFLICT ("assetTypeId", code) DO NOTHING;

  -- BPS-01  Riverside Booster Station
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'BPS-01', 'Riverside Booster Station', 'ACTIVE'::"AssetStatus", 'Pumping Operations', TIMESTAMP '1974-06-15 00:00:00', 40, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-01';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'BPS-01', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '55 Levee Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Riverside, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Zone B - Mid', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ZONE'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 5, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 75, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_HP'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 84, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_DYNAMIC_LIFT_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1820, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'VOLUME_PUMPED_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 24600, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 14, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.36884, 37.70288), 4326), 37.70288, -97.36884, 'Riverside', 'Zone A - Low'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- BPS-02  Southport Booster Station
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'BPS-02', 'Southport Booster Station', 'ACTIVE'::"AssetStatus", 'Pumping Operations', TIMESTAMP '1999-06-15 00:00:00', 40, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-02';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'BPS-02', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '1040 Southport Avenue', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Southport, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Zone B - Mid', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ZONE'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 3.4, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 50, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_HP'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 84, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_DYNAMIC_LIFT_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1150, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'VOLUME_PUMPED_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 15500, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 14, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.28112, 37.66884), 4326), 37.66884, -97.28112, 'Southport', 'Zone A - Low'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- BPS-03  Downtown Booster Station
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'BPS-03', 'Downtown Booster Station', 'ACTIVE'::"AssetStatus", 'Pumping Operations', TIMESTAMP '1983-06-15 00:00:00', 40, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-03';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'BPS-03', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '820 Foundry Street', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Downtown, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Zone C - High', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ZONE'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 4.2, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 75, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_HP'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 88, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_DYNAMIC_LIFT_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 1410, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'VOLUME_PUMPED_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 20000, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 14, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.36184, 37.66012), 4326), 37.66012, -97.36184, 'Downtown', 'Zone B - Mid'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- BPS-04  Eastgate Booster Station
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'BPS-04', 'Eastgate Booster Station', 'ACTIVE'::"AssetStatus", 'Pumping Operations', TIMESTAMP '2007-06-15 00:00:00', 40, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-04';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'BPS-04', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '2455 Eastgate Boulevard', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Eastgate, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Zone C - High', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ZONE'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 2.6, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 50, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_HP'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 88, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_DYNAMIC_LIFT_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 940, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'VOLUME_PUMPED_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 13300, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 14, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.32188, 37.70602), 4326), 37.70602, -97.32188, 'Eastgate', 'Zone B - Mid'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);

  -- BPS-05  River Road High Service Station
  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, v_org, v_type, 'BPS-05', 'River Road High Service Station', 'ACTIVE'::"AssetStatus", 'Pumping Operations', TIMESTAMP '2016-06-15 00:00:00', 40, now(), now())
  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;
  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = 'BPS-05';
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'BPS-05', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'FACILITY_ID'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, '210 River Road', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ADDRESS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside Riverside, the service area this facility works for, the same way the sample network''s pipes are drawn.', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'LOCATION_BASIS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, 'Zone C - High', NULL, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'ZONE'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 2, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'CAPACITY_CFS'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 75, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_HP'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 172, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_DYNAMIC_LIFT_FT'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 610, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'VOLUME_PUMPED_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 16900, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'TOTAL_POWER_COST'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")
  SELECT gen_random_uuid()::text, v_asset, d.id, NULL, 28, NULL
  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = 'AVG_COST_PER_AF'
  ON CONFLICT ("assetId", "definitionId") DO NOTHING;
  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(-97.37712, 37.70914), 4326), 37.70914, -97.37712, 'Riverside', 'Zone A - Low'
  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);
END $$;

-- What landed. Expect Booster Pump Station 5, Reservoir 7, Well 6 —
-- and 18 of those 18 with a position on the map.
SELECT t.name AS asset_type,
       count(*) AS facilities,
       count(l."assetId") AS with_a_position
FROM assets a
JOIN asset_types t ON t.id = a."assetTypeId"
LEFT JOIN asset_locations l ON l."assetId" = a.id
WHERE t.code IN ('RESERVOIR', 'WELL', 'BOOSTER_PUMP_STATION')
GROUP BY t.name ORDER BY t.name;
