import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONDITION_READING, componentInspectionSpec } from "../src/domain/components/inspection";
import { COMPONENT_SCOPE, componentConditionModelSpec, componentRiskModelSpec } from "../src/domain/components/scope";
import { FACILITY_INSPECTION_TEMPLATES } from "../src/domain/facility/inspection";
import {
  COMPONENT_TYPES,
  COMPOSITION,
  DEFAULT_OBSERVED_AT,
  planSiteVisits,
  plannedReadings,
  plannedSiteRating,
  type PlannedReading,
} from "../prisma/component-plan";
import { SAMPLE_FACILITIES } from "../prisma/facilities";

/**
 * Write the sample facilities' site visits out as SQL, for a database this
 * machine can't reach — the third of the sample files, run after
 * facilities.sql and components.sql.
 *
 * Generated from prisma/component-plan.ts, the plan the seeder reads, so
 * both produce the same visits, findings and readings. A finding on a date
 * the component history already holds is attached to that reading rather
 * than adding another, so no score or roll-up changes.
 *
 *   npm run db:seed:inspections:sql
 */

const OUT = join(__dirname, "..", "prisma", "sql", "inspections.sql");

function str(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
function jsonb(value: unknown): string {
  return `${str(JSON.stringify(value))}::jsonb`;
}
function timestamp(date: Date): string {
  return `TIMESTAMP '${date.toISOString().slice(0, 19).replace("T", " ")}'`;
}

/** The column an answer is kept in, and its literal. */
function resultColumn(value: PlannedReading): [string, string] {
  if (typeof value === "boolean") return ['"booleanValue"', String(value)];
  if (typeof value === "number") return ['"numberValue"', String(value)];
  return ['"textValue"', str(value)];
}

const nameOf = new Map(COMPONENT_TYPES.map((t) => [t.code, t.name]));
const lines: string[] = [];
const write = (line = "") => lines.push(line);
let visitCount = 0;
let findingCount = 0;

write("-- CARNAC — sample site visits for the sample facilities");
write("--");
write("-- GENERATED FILE. Produced by `npm run db:seed:inspections:sql` from");
write("-- prisma/component-plan.ts. Edit that and regenerate; edits here are lost.");
write("--");
write("-- Run it after facilities.sql and components.sql. Paste the whole file into");
write("-- a SQL console (Neon's editor, psql, …). It is one transaction: it either");
write("-- all lands or none of it does. It:");
write("--   * sets each component's consequence of failure where none is set yet;");
write("--   * adds each component type's inspection form, if the app hasn't yet;");
write("--   * records up to three site visits per sample facility — its latest and");
write("--     ones five and ten years before — each with the site form's answers and");
write("--     a finding, with readings, for every component the facility has.");
write("-- A finding on a date a component's history already holds is attached to");
write("-- that reading, so no current score or roll-up changes. A facility that");
write("-- already has any inspection is left alone, so it is safe to run again.");
write("");
write("DO $$");
write("DECLARE");
write("  v_org       text;");
write("  v_inspector text;");
write("  v_type      text;");
write("  v_type_name text;");
write("  v_site      text;");
write("  v_ctpl      text;");
write("  v_cm        text;");
write("  v_rm        text;");
write("  v_asset     text;");
write("  v_visit     text;");
write("  v_child     text;");
write("  v_comp      text;");
write("  v_cons      integer;");
write("  v_n         integer;");
write("BEGIN");
write('  SELECT id INTO v_org FROM organizations ORDER BY "createdAt" ASC LIMIT 1;');
write("  IF v_org IS NULL THEN");
write("    RAISE EXCEPTION 'No organization in this database.';");
write("  END IF;");
write("");
write("  -- Recorded against an inspector, or failing that anyone active.");
write('  SELECT u.id INTO v_inspector FROM users u JOIN roles r ON r.id = u."roleId"');
write('   WHERE u."organizationId" = v_org AND u."isActive" AND r.code = \'INSPECTOR\' ORDER BY u.email LIMIT 1;');
write("  IF v_inspector IS NULL THEN");
write('    SELECT id INTO v_inspector FROM users WHERE "organizationId" = v_org AND "isActive" ORDER BY email LIMIT 1;');
write("  END IF;");
write("  IF v_inspector IS NULL THEN");
write("    RAISE EXCEPTION 'No user to record the sample inspections against.';");
write("  END IF;");

const conditionSpec = componentConditionModelSpec("");
const riskSpec = componentRiskModelSpec("");

for (const [assetTypeCode, parts] of Object.entries(COMPOSITION)) {
  const siteForm = FACILITY_INSPECTION_TEMPLATES.find((t) => t.assetTypeCode === assetTypeCode);
  write("");
  write(`  -- ${assetTypeCode} ${"=".repeat(Math.max(0, 66 - assetTypeCode.length))}`);
  write("  v_type := NULL;");
  write(`  SELECT id, name INTO v_type, v_type_name FROM asset_types WHERE "organizationId" = v_org AND code = ${str(assetTypeCode)};`);
  write("  v_site := NULL;");
  write(
    `  SELECT id INTO v_site FROM inspection_templates WHERE "assetTypeId" = v_type AND "componentTypeId" IS NULL AND "isActive" ORDER BY "createdAt" LIMIT 1;`
  );
  write("  IF v_type IS NULL OR v_site IS NULL THEN");
  write(`    RAISE NOTICE '${assetTypeCode}: no asset type or no site form — run facilities.sql first. Skipped.';`);
  write("  ELSE");

  write("");
  write("    -- Consequence of failure, where none is set yet.");
  for (const part of parts) {
    write(
      `    UPDATE asset_type_component_types l SET consequence = ${part.consequence} FROM component_types ct` +
        ` WHERE l."assetTypeId" = v_type AND l."componentTypeId" = ct.id AND ct."organizationId" = v_org AND ct.code = ${str(part.code)} AND l.consequence IS NULL;`
    );
  }

  write("");
  write("    -- Each component type's inspection form, as the app would create it.");
  for (const part of parts) {
    const spec = componentInspectionSpec(part.code, nameOf.get(part.code) ?? part.code);
    write("    v_ctpl := NULL;");
    write(
      `    SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId"` +
        ` WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = ${str(part.code)} ORDER BY t."createdAt" LIMIT 1;`
    );
    write("    IF v_ctpl IS NULL THEN");
    write(
      `      INSERT INTO inspection_templates (id, "assetTypeId", "componentTypeId", name, description, "isActive", "createdAt", "updatedAt")`
    );
    write(
      `      SELECT gen_random_uuid()::text, v_type, ct.id, ${str(spec.name)}, ${str(spec.description)}, true, now(), now()` +
        ` FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = ${str(part.code)}`
    );
    write("      RETURNING id INTO v_ctpl;");
    write("    END IF;");
    write("    IF v_ctpl IS NOT NULL THEN");
    spec.readings.forEach((r, sortOrder) => {
      const config = {
        ...(r.help ? { helpText: r.help } : {}),
        ...(r.options ? { options: r.options } : {}),
        ...(r.min != null ? { min: r.min } : {}),
        ...(r.max != null ? { max: r.max } : {}),
      };
      write(
        `      INSERT INTO inspection_template_fields (id, "templateId", code, label, "dataType", unit, "isRequired", "sortOrder", config)` +
          ` VALUES (gen_random_uuid()::text, v_ctpl, ${str(r.code)}, ${str(r.label)}, ${str(r.dataType)}::"AttributeDataType", ` +
          `${r.unit ? str(r.unit) : "NULL"}, ${r.isRequired ?? false}, ${sortOrder}, ${jsonb(config)}) ON CONFLICT ("templateId", code) DO NOTHING;`
      );
    });
    write("    END IF;");
  }

  write("");
  write("    -- The models component scores are filed under (components.sql made them).");
  write("    v_cm := NULL;");
  write(`    SELECT id INTO v_cm FROM condition_models WHERE "assetTypeId" = v_type AND formula->>'scope' = ${str(COMPONENT_SCOPE)} LIMIT 1;`);
  write("    IF v_cm IS NULL THEN");
  write(
    `      INSERT INTO condition_models (id, "assetTypeId", name, "scaleMin", "scaleMax", bands, formula, "isActive") VALUES (gen_random_uuid()::text, v_type, ` +
      `v_type_name || ${str(conditionSpec.name)}, 0, 100, ${jsonb(conditionSpec.bands)}, ${jsonb(conditionSpec.formula)}, true) RETURNING id INTO v_cm;`
  );
  write("    END IF;");
  write("    v_rm := NULL;");
  write(
    `    SELECT id INTO v_rm FROM risk_models WHERE "assetTypeId" = v_type AND "probabilityConfig"->>'scope' = ${str(COMPONENT_SCOPE)} LIMIT 1;`
  );
  write("    IF v_rm IS NULL THEN");
  write(
    `      INSERT INTO risk_models (id, "assetTypeId", name, "probabilityConfig", "consequenceConfig", "isActive") VALUES (gen_random_uuid()::text, v_type, ` +
      `v_type_name || ${str(riskSpec.name)}, ${jsonb(riskSpec.probabilityConfig)}, ${jsonb(riskSpec.consequenceConfig)}, true) RETURNING id INTO v_rm;`
  );
  write("    END IF;");

  for (const facility of SAMPLE_FACILITIES.filter((f) => f.typeCode === assetTypeCode)) {
    const inspected = facility.attributes.find((a) => a.code === "LAST_INSPECTED");
    const observedAt = (inspected && "date" in inspected ? inspected.date : undefined) ?? DEFAULT_OBSERVED_AT;
    const visits = planSiteVisits(facility.assetCode, facility.installYear, observedAt, parts);

    write("");
    write(`    -- ${facility.assetCode}  ${facility.name} ${"-".repeat(Math.max(0, 50 - facility.name.length))}`);
    write("    v_asset := NULL;");
    write(
      `    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = ${str(facility.assetCode)} AND "deletedAt" IS NULL;`
    );
    write(
      `    IF v_asset IS NOT NULL AND EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset)` +
        ` AND NOT EXISTS (SELECT 1 FROM inspections WHERE "assetId" = v_asset) THEN`
    );

    for (const visit of visits) {
      visitCount++;
      const stamp = visit.date.toISOString().slice(0, 10);
      const conditions = parts.map((p) => visit.parts[p.code].condition);
      const average = conditions.reduce((a, b) => a + b, 0) / conditions.length;

      write(`      -- visit ${stamp}`);
      write(
        `      INSERT INTO inspections (id, "assetId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", notes, "createdAt")` +
          ` VALUES (gen_random_uuid()::text, v_asset, v_site, ${timestamp(visit.date)}, v_inspector, 'Condition Assessment', false, 'Sample inspection.', now())` +
          ` RETURNING id INTO v_visit;`
      );
      for (const field of siteForm?.fields.filter((f) => f.dataType === "NUMBER") ?? []) {
        write(
          `      INSERT INTO inspection_results (id, "inspectionId", "fieldId", "numberValue") SELECT gen_random_uuid()::text, v_visit, f.id, ` +
            `${plannedSiteRating(average, `${facility.assetCode}:${stamp}:${field.code}`)} FROM inspection_template_fields f WHERE f."templateId" = v_site AND f.code = ${str(field.code)};`
        );
      }

      for (const part of parts) {
        findingCount++;
        const plan = visit.parts[part.code];
        const label = nameOf.get(part.code) ?? part.code;
        const readings: Record<string, PlannedReading> = {
          [CONDITION_READING.code]: plan.condition / 10,
          ...plannedReadings(part.code, plan.condition, `${facility.assetCode}:${label}:${stamp}`),
        };
        write("      v_comp := NULL;");
        write(
          `      SELECT c.id INTO v_comp FROM asset_components c JOIN component_types ct ON ct.id = c."componentTypeId"` +
            ` WHERE c."assetId" = v_asset AND ct.code = ${str(part.code)} ORDER BY c."createdAt" LIMIT 1;`
        );
        write("      IF v_comp IS NOT NULL THEN");
        write(
          `        SELECT t.id INTO v_ctpl FROM inspection_templates t JOIN component_types ct ON ct.id = t."componentTypeId"` +
            ` WHERE t."assetTypeId" = v_type AND ct."organizationId" = v_org AND ct.code = ${str(part.code)} ORDER BY t."createdAt" LIMIT 1;`
        );
        write(
          `        SELECT l.consequence INTO v_cons FROM asset_type_component_types l JOIN component_types ct ON ct.id = l."componentTypeId"` +
            ` WHERE l."assetTypeId" = v_type AND ct.code = ${str(part.code)};`
        );
        write(
          `        INSERT INTO inspections (id, "assetId", "assetComponentId", "parentInspectionId", "templateId", "inspectionDate", "inspectorId", "inspectionType", "requiresFollowUp", "createdAt")` +
            ` VALUES (gen_random_uuid()::text, v_asset, v_comp, v_visit, v_ctpl, ${timestamp(visit.date)}, v_inspector, 'Condition Assessment', false, now()) RETURNING id INTO v_child;`
        );
        for (const [code, value] of Object.entries(readings)) {
          const [column, literal] = resultColumn(value);
          write(
            `        INSERT INTO inspection_results (id, "inspectionId", "fieldId", ${column}) SELECT gen_random_uuid()::text, v_child, f.id, ${literal}` +
              ` FROM inspection_template_fields f WHERE f."templateId" = v_ctpl AND f.code = ${str(code)};`
          );
        }
        write(
          `        UPDATE condition_measurements SET "inspectionId" = v_child WHERE "assetComponentId" = v_comp AND "measurementDate" = ${timestamp(visit.date)} AND "inspectionId" IS NULL;`
        );
        write("        GET DIAGNOSTICS v_n = ROW_COUNT;");
        write("        IF v_n = 0 THEN");
        write(
          `          INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source, "inspectionId")` +
            ` VALUES (gen_random_uuid()::text, v_asset, v_comp, v_cm, ${plan.condition}, ${timestamp(visit.date)}, 'Inspection', v_child);`
        );
        write(
          `          INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")` +
            ` VALUES (gen_random_uuid()::text, v_asset, v_comp, v_rm, ${plan.probability}, COALESCE(v_cons, ${plan.consequence}), ` +
            `${plan.probability} * COALESCE(v_cons, ${plan.consequence}), ${timestamp(visit.date)});`
        );
        write("        END IF;");
        write("      END IF;");
      }
    }
    write("    END IF;");
  }
  write("  END IF;");
}

write("");
write("  -- Each sample component's snapshot follows its latest readings, as the app keeps it.");
write('  UPDATE asset_components c SET');
write('    "conditionScore" = (SELECT m.score FROM condition_measurements m WHERE m."assetComponentId" = c.id ORDER BY m."measurementDate" DESC LIMIT 1),');
write('    "riskScore" = (SELECT r."riskScore" FROM risk_assessments r WHERE r."assetComponentId" = c.id ORDER BY r."assessmentDate" DESC LIMIT 1),');
write('    "scoresAsOf" = GREATEST(');
write('      (SELECT max(m."measurementDate") FROM condition_measurements m WHERE m."assetComponentId" = c.id),');
write('      (SELECT max(r."assessmentDate") FROM risk_assessments r WHERE r."assetComponentId" = c.id)),');
write('    "updatedAt" = now()');
write('  FROM assets a WHERE a.id = c."assetId" AND a."organizationId" = v_org');
write("    AND a.\"assetCode\" IN (" + SAMPLE_FACILITIES.map((f) => str(f.assetCode)).join(", ") + ");");
write("END $$;");
write("");
write("-- What landed. Expect every sample facility to have its visits, a finding for");
write("-- each component on each, and every component reading linked to a visit.");
write("SELECT t.name AS asset_type,");
write("       count(DISTINCT a.id) AS facilities,");
write('       count(*) FILTER (WHERE i."assetComponentId" IS NULL) AS visits,');
write('       count(*) FILTER (WHERE i."assetComponentId" IS NOT NULL) AS component_findings,');
write("       (SELECT count(*) FROM condition_measurements m JOIN assets a2 ON a2.id = m.\"assetId\"");
write('         WHERE a2."assetTypeId" = t.id AND m."assetComponentId" IS NOT NULL AND m."inspectionId" IS NULL) AS readings_without_a_visit');
write("FROM asset_types t");
write('JOIN assets a ON a."assetTypeId" = t.id AND a."deletedAt" IS NULL');
write('LEFT JOIN inspections i ON i."assetId" = a.id');
write("WHERE t.code IN (" + Object.keys(COMPOSITION).map(str).join(", ") + ")");
write("GROUP BY t.id, t.name ORDER BY t.name;");
write("");

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`Wrote ${OUT}`);
console.log(`  ${visitCount} visits, ${findingCount} component findings, ${lines.length} lines`);
