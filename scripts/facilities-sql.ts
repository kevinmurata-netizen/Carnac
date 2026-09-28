import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FACILITY_ASSET_TYPES } from "../src/domain/facility/attributes";
import { FACILITY_INSPECTION_TEMPLATES } from "../src/domain/facility/inspection";
import { SAMPLE_FACILITIES } from "../prisma/facilities";

/**
 * Write the sample facilities out as SQL, for a database this machine has no
 * connection string for.
 *
 * `npm run db:seed:facilities` is the ordinary way in, but it needs
 * DATABASE_URL, and Vercel will not hand back a secret once it is set. This
 * produces one file to paste into a database console instead — Neon's SQL
 * editor, psql, anything — with no credential ever reaching this machine.
 *
 * Generated from `prisma/facilities.ts`, the same source the seeder reads, so
 * the two cannot drift: change a reservoir there and re-run this.
 *
 *   npm run db:seed:facilities:sql
 */

const OUT = join(__dirname, "..", "prisma", "sql", "facilities.sql");

/** A SQL string literal. Doubling the quote is the whole of the escaping this
 * needs: every value here is generated, none of it is user input. */
function str(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonb(value: unknown): string {
  return `${str(JSON.stringify(value))}::jsonb`;
}

/** Prisma writes timestamp columns as naive UTC, so this has to as well, or the
 * rows this file creates would sit an offset away from the rows the seeder
 * creates. */
function timestamp(date: Date): string {
  return `TIMESTAMP '${date.toISOString().slice(0, 19).replace("T", " ")}'`;
}

function nullable(value: string | null | undefined): string {
  return value == null ? "NULL" : str(value);
}

const lines: string[] = [];
const write = (line = "") => lines.push(line);

write("-- CARNAC — sample storage, supply and pumping facilities");
write("--");
write("-- GENERATED FILE. Produced by `npm run db:seed:facilities:sql` from");
write("-- prisma/facilities.ts. Edit that and regenerate; edits here are lost.");
write("--");
write("-- Paste the whole file into a SQL console (Neon's editor, psql, …). It is");
write("-- one transaction: it either all lands or none of it does. It adds three");
write("-- asset types with their attribute definitions and inspection forms, and");
write("-- 18 facilities with their attributes and map positions. It creates only");
write("-- what is missing and changes nothing that is already there, so it is safe");
write("-- to run again over a database that already took an earlier version.");
write("--");
write("-- It writes to the organization created first, which is the only one in");
write("-- every CARNAC instance so far. If yours holds more than one, put the id");
write("-- you want in the SELECT below.");
write("");
write("DO $$");
write("DECLARE");
write("  v_org  text;");
write("  v_type text;");
write("  v_asset text;");
write("  v_template text;");
write("BEGIN");
write("  SELECT id INTO v_org FROM organizations ORDER BY \"createdAt\" ASC LIMIT 1;");
write("  IF v_org IS NULL THEN");
write("    RAISE EXCEPTION 'No organization in this database — nothing to attach facilities to.';");
write("  END IF;");

for (const type of FACILITY_ASSET_TYPES) {
  write("");
  write(`  -- ${type.name} ${"-".repeat(Math.max(0, 66 - type.name.length))}`);
  write(`  INSERT INTO asset_types (id, code, name, description, "organizationId", "createdAt", "updatedAt")`);
  write(
    `  VALUES (gen_random_uuid()::text, ${str(type.code)}, ${str(type.name)}, ${str(type.description)}, v_org, now(), now())`
  );
  write("  ON CONFLICT (code) DO NOTHING;");
  write(`  SELECT id INTO v_type FROM asset_types WHERE code = ${str(type.code)};`);
  write("");

  type.attributes.forEach((attribute, sortOrder) => {
    const config =
      attribute.options || attribute.help
        ? jsonb({
            ...(attribute.options ? { options: attribute.options } : {}),
            ...(attribute.help ? { help: attribute.help } : {}),
          })
        : "NULL";
    write(
      `  INSERT INTO asset_attribute_definitions (id, "assetTypeId", code, label, "dataType", unit, "isRequired", "sortOrder", config)`
    );
    write(
      `  VALUES (gen_random_uuid()::text, v_type, ${str(attribute.code)}, ${str(attribute.label)}, ` +
        `${str(attribute.dataType)}::"AttributeDataType", ${nullable(attribute.unit)}, false, ${sortOrder}, ${config})`
    );
    write(`  ON CONFLICT ("assetTypeId", code) DO NOTHING;`);
  });

  for (const template of FACILITY_INSPECTION_TEMPLATES.filter((t) => t.assetTypeCode === type.code)) {
    write("");
    write(`  -- ${template.name}`);
    write(`  SELECT id INTO v_template FROM inspection_templates WHERE "assetTypeId" = v_type AND name = ${str(template.name)};`);
    write("  IF v_template IS NULL THEN");
    write(`    INSERT INTO inspection_templates (id, "assetTypeId", name, description, "isActive", "createdAt", "updatedAt")`);
    write(
      `    VALUES (gen_random_uuid()::text, v_type, ${str(template.name)}, ${str(template.description)}, true, now(), now())`
    );
    write("    RETURNING id INTO v_template;");
    write("  END IF;");

    for (const field of template.fields) {
      const config = jsonb({
        helpText: field.helpText,
        ...(field.dataType === "NUMBER" ? { min: 0, max: 10 } : {}),
      });
      write(`  INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config)`);
      write(
        `  VALUES (gen_random_uuid()::text, v_template, ${str(field.code)}, ${str(field.label)}, ` +
          `${str(field.dataType)}::"AttributeDataType", NULL, ${field.isRequired}, ${field.sortOrder}, ${config})`
      );
      write(`  ON CONFLICT ("templateId", code) DO NOTHING;`);
    }
  }

  for (const facility of SAMPLE_FACILITIES.filter((f) => f.typeCode === type.code)) {
    const installed = new Date(Date.UTC(facility.installYear, 5, 15));
    const basis =
      `Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside ` +
      `${facility.serviceArea}, the service area this facility works for, the same way the sample network's pipes are drawn.`;

    write("");
    write(`  -- ${facility.assetCode}  ${facility.name}`);
    write(
      `  INSERT INTO assets (id, "organizationId", "assetTypeId", "assetCode", name, status, "ownerDepartment", "installationDate", "expectedUsefulLife", "createdAt", "updatedAt")`
    );
    write(
      `  VALUES (gen_random_uuid()::text, v_org, v_type, ${str(facility.assetCode)}, ${str(facility.name)}, ` +
        `'ACTIVE'::"AssetStatus", ${str(facility.ownerDepartment)}, ${timestamp(installed)}, ${facility.expectedUsefulLife}, now(), now())`
    );
    write(`  ON CONFLICT ("organizationId", "assetCode") DO NOTHING;`);
    write(
      `  SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = ${str(facility.assetCode)};`
    );

    const attributes = [
      { code: "FACILITY_ID", text: facility.assetCode },
      { code: "ADDRESS", text: facility.address },
      { code: "LOCATION_BASIS", text: basis },
      ...facility.attributes,
    ];

    for (const attribute of attributes) {
      const text = "text" in attribute ? attribute.text : undefined;
      const number = "number" in attribute ? attribute.number : undefined;
      const date = "date" in attribute ? attribute.date : undefined;
      write(
        `  INSERT INTO asset_attribute_values (id, "assetId", "definitionId", "textValue", "numberValue", "dateValue")`
      );
      write(
        `  SELECT gen_random_uuid()::text, v_asset, d.id, ${text == null ? "NULL" : str(text)}, ` +
          `${number ?? "NULL"}, ${date ? timestamp(date) : "NULL"}`
      );
      write(`  FROM asset_attribute_definitions d WHERE d."assetTypeId" = v_type AND d.code = ${str(attribute.code)}`);
      write(`  ON CONFLICT ("assetId", "definitionId") DO NOTHING;`);
    }

    write(
      `  INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")`
    );
    write(
      `  SELECT 'loc_' || v_asset, v_asset, ST_SetSRID(ST_MakePoint(${facility.lng}, ${facility.lat}), 4326), ` +
        `${facility.lat}, ${facility.lng}, ${str(facility.serviceArea)}, ${str(facility.pressureZone)}`
    );
    write(`  WHERE NOT EXISTS (SELECT 1 FROM asset_locations WHERE "assetId" = v_asset);`);
  }
}

write("END $$;");
write("");
write("-- What landed. Expect Booster Pump Station 5, Reservoir 7, Well 6 — all of");
write("-- them with a position on the map, and each type with one inspection form.");
write("SELECT t.name AS asset_type,");
write("       count(a.id) AS facilities,");
write("       count(l.\"assetId\") AS with_a_position,");
write("       (SELECT count(*) FROM inspection_templates i WHERE i.\"assetTypeId\" = t.id) AS forms,");
write("       (SELECT count(*) FROM inspection_template_fields f");
write("          JOIN inspection_templates i ON i.id = f.\"templateId\"");
write("         WHERE i.\"assetTypeId\" = t.id) AS questions");
write("FROM asset_types t");
write("LEFT JOIN assets a ON a.\"assetTypeId\" = t.id AND a.\"deletedAt\" IS NULL");
write("LEFT JOIN asset_locations l ON l.\"assetId\" = a.id");
write("WHERE t.code IN (" + FACILITY_ASSET_TYPES.map((t) => str(t.code)).join(", ") + ")");
write("GROUP BY t.id, t.name ORDER BY t.name;");
write("");

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`Wrote ${OUT}`);
console.log(`  ${FACILITY_ASSET_TYPES.length} asset types, ${SAMPLE_FACILITIES.length} facilities, ${lines.length} lines`);
