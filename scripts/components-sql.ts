import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { editAttributes } from "../src/domain/components/attributes";
import { DEFAULT_ROLLUP_STRATEGIES } from "../src/domain/components/rollup";
import { COMPONENT_SCOPE, componentConditionModelSpec, componentRiskModelSpec } from "../src/domain/components/scope";
import { COMPONENT_TYPES, COMPOSITION, DEFAULT_OBSERVED_AT, planComponentHistory } from "../prisma/component-plan";
import { SAMPLE_FACILITIES } from "../prisma/facilities";

/**
 * Write the sample components out as SQL, for a database this machine has no
 * connection string for — the companion to facilities-sql.ts, and run after
 * it: components attach to the sample facilities, so those must be there.
 *
 * Generated from prisma/component-plan.ts, the same plan the seeder reads,
 * so both produce the same component types, shares and condition history.
 *
 *   npm run db:seed:components:sql
 */

const OUT = join(__dirname, "..", "prisma", "sql", "components.sql");

/** A SQL string literal. Every value here is generated, none of it is user
 * input, so doubling the quote is all the escaping needed. */
function str(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonb(value: unknown): string {
  return `${str(JSON.stringify(value))}::jsonb`;
}

/** Naive UTC, the way Prisma writes timestamp columns. */
function timestamp(date: Date): string {
  return `TIMESTAMP '${date.toISOString().slice(0, 19).replace("T", " ")}'`;
}

const lines: string[] = [];
const write = (line = "") => lines.push(line);

let componentCount = 0;
let observationCount = 0;

write("-- CARNAC — sample components for the sample facilities");
write("--");
write("-- GENERATED FILE. Produced by `npm run db:seed:components:sql` from");
write("-- prisma/component-plan.ts. Edit that and regenerate; edits here are lost.");
write("--");
write("-- Run it after facilities.sql: it attaches components to those facilities.");
write("-- Paste the whole file into a SQL console (Neon's editor, psql, …). It is");
write("-- one transaction: it either all lands or none of it does. It adds the three");
write("-- roll-up strategies (if the organization has none yet), 11 component types,");
write("-- which parts each facility type is made of, and each sample facility's");
write("-- components with their condition and risk history. It creates only what is");
write("-- missing: a facility that already has components is left exactly as it is,");
write("-- so it is safe to run again.");
write("--");
write("-- It writes to the organization created first, which is the only one in");
write("-- every CARNAC instance so far. If yours holds more than one, put the id");
write("-- you want in the SELECT below.");
write("");
write("DO $$");
write("DECLARE");
write("  v_org       text;");
write("  v_type      text;");
write("  v_type_name text;");
write("  v_cm        text;");
write("  v_rm        text;");
write("  v_asset     text;");
write("  v_component text;");
write("BEGIN");
write('  SELECT id INTO v_org FROM organizations ORDER BY "createdAt" ASC LIMIT 1;');
write("  IF v_org IS NULL THEN");
write("    RAISE EXCEPTION 'No organization in this database — nothing to attach components to.';");
write("  END IF;");

// Roll-up strategies ----------------------------------------------------------
write("");
write("  -- Roll-up strategies. The app creates these the first time Component");
write("  -- Roll-up is opened; they are here so scores roll up before anyone has.");
write('  IF NOT EXISTS (SELECT 1 FROM rollup_strategies WHERE "organizationId" = v_org) THEN');
for (const s of DEFAULT_ROLLUP_STRATEGIES) {
  write(
    `    INSERT INTO rollup_strategies (id, "organizationId", name, description, "strategyType", config, "isDefault", "createdAt", "updatedAt")`
  );
  write(
    `    VALUES (gen_random_uuid()::text, v_org, ${str(s.name)}, ${str(s.description)}, ${str(s.type)}::"RollupStrategyType", ` +
      `${jsonb(s.config)}, ${s.isDefault}, now(), now());`
  );
}
write("  END IF;");

// Component types -------------------------------------------------------------
write("");
write("  -- Component types -------------------------------------------------");
for (const spec of COMPONENT_TYPES) {
  write(
    `  INSERT INTO component_types (id, "organizationId", code, name, description, "attributeSchema", "createdAt", "updatedAt")`
  );
  write(
    `  VALUES (gen_random_uuid()::text, v_org, ${str(spec.code)}, ${str(spec.name)}, ${str(spec.description)}, ` +
      `${jsonb(editAttributes(spec.attributeSchema, {}))}, now(), now())`
  );
  write(`  ON CONFLICT ("organizationId", code) DO NOTHING;`);
}

// Each facility type ----------------------------------------------------------
const conditionSuffix = componentConditionModelSpec("").name;
const riskSpec = componentRiskModelSpec("");
const conditionSpec = componentConditionModelSpec("");

for (const [assetTypeCode, parts] of Object.entries(COMPOSITION)) {
  write("");
  write(`  -- ${assetTypeCode} ${"-".repeat(Math.max(0, 66 - assetTypeCode.length))}`);
  write(
    `  SELECT id, name INTO v_type, v_type_name FROM asset_types WHERE "organizationId" = v_org AND code = ${str(assetTypeCode)};`
  );
  write("  IF v_type IS NULL THEN");
  write(`    RAISE NOTICE 'No ${assetTypeCode} asset type — run facilities.sql first. Skipped.';`);
  write("  ELSE");

  parts.forEach((part, sortOrder) => {
    write(`    INSERT INTO asset_type_component_types ("assetTypeId", "componentTypeId", "defaultCostWeight", "sortOrder")`);
    write(
      `    SELECT v_type, ct.id, ${part.weight}, ${sortOrder} FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = ${str(part.code)}`
    );
    write(`    ON CONFLICT ("assetTypeId", "componentTypeId") DO NOTHING;`);
  });

  write("");
  write("    -- The models component scores belong to, marked so that whole-asset");
  write("    -- lookups never take them for the asset's own.");
  write("    v_cm := NULL;");
  write(`    SELECT id INTO v_cm FROM condition_models WHERE "assetTypeId" = v_type AND formula->>'scope' = ${str(COMPONENT_SCOPE)} LIMIT 1;`);
  write("    IF v_cm IS NULL THEN");
  write(`      INSERT INTO condition_models (id, "assetTypeId", name, "scaleMin", "scaleMax", bands, formula, "isActive")`);
  write(
    `      VALUES (gen_random_uuid()::text, v_type, v_type_name || ${str(conditionSuffix)}, ${conditionSpec.scaleMin}, ${conditionSpec.scaleMax}, ` +
      `${jsonb(conditionSpec.bands)}, ${jsonb(conditionSpec.formula)}, true)`
  );
  write("      RETURNING id INTO v_cm;");
  write("    END IF;");
  write("    v_rm := NULL;");
  write(
    `    SELECT id INTO v_rm FROM risk_models WHERE "assetTypeId" = v_type AND "probabilityConfig"->>'scope' = ${str(COMPONENT_SCOPE)} LIMIT 1;`
  );
  write("    IF v_rm IS NULL THEN");
  write(`      INSERT INTO risk_models (id, "assetTypeId", name, "probabilityConfig", "consequenceConfig", "isActive")`);
  write(
    `      VALUES (gen_random_uuid()::text, v_type, v_type_name || ${str(componentRiskModelSpec("").name)}, ` +
      `${jsonb(riskSpec.probabilityConfig)}, ${jsonb(riskSpec.consequenceConfig)}, true)`
  );
  write("      RETURNING id INTO v_rm;");
  write("    END IF;");

  for (const facility of SAMPLE_FACILITIES.filter((f) => f.typeCode === assetTypeCode)) {
    const inspected = facility.attributes.find((a) => a.code === "LAST_INSPECTED");
    const observedAt = (inspected && "date" in inspected ? inspected.date : undefined) ?? DEFAULT_OBSERVED_AT;

    write("");
    write(`    -- ${facility.assetCode}  ${facility.name}`);
    write("    v_asset := NULL;");
    write(
      `    SELECT id INTO v_asset FROM assets WHERE "organizationId" = v_org AND "assetCode" = ${str(facility.assetCode)} AND "deletedAt" IS NULL;`
    );
    write(`    IF v_asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM asset_components WHERE "assetId" = v_asset) THEN`);

    for (const part of parts) {
      const history = planComponentHistory(facility.assetCode, facility.installYear, observedAt, part);
      const latest = history.at(-1)!;
      componentCount++;

      // The snapshot is written with the row rather than refreshed after, so
      // it has to be the latest observation — which is what the plan puts last.
      write(
        `      INSERT INTO asset_components (id, "assetId", "componentTypeId", "conditionScore", "riskScore", "scoresAsOf", attributes, "createdAt", "updatedAt")`
      );
      write(
        `      SELECT gen_random_uuid()::text, v_asset, ct.id, ${latest.conditionScore}, ${latest.probability * latest.consequence}, ` +
          `${timestamp(latest.observedAt)}, '{}'::jsonb, now(), now()`
      );
      write(`      FROM component_types ct WHERE ct."organizationId" = v_org AND ct.code = ${str(part.code)}`);
      write("      RETURNING id INTO v_component;");
      for (const o of history) {
        observationCount++;
        write(
          `      INSERT INTO condition_measurements (id, "assetId", "assetComponentId", "conditionModelId", score, "measurementDate", source)`
        );
        write(
          `      VALUES (gen_random_uuid()::text, v_asset, v_component, v_cm, ${o.conditionScore}, ${timestamp(o.observedAt)}, 'Inspection');`
        );
        write(
          `      INSERT INTO risk_assessments (id, "assetId", "assetComponentId", "riskModelId", "probabilityScore", "consequenceScore", "riskScore", "assessmentDate")`
        );
        write(
          `      VALUES (gen_random_uuid()::text, v_asset, v_component, v_rm, ${o.probability}, ${o.consequence}, ` +
            `${o.probability * o.consequence}, ${timestamp(o.observedAt)});`
        );
      }
    }
    write("    END IF;");
  }
  write("  END IF;");
}

write("END $$;");
write("");
write("-- What landed. Expect Booster Pump Station 5 facilities with 20 components,");
write("-- Reservoir 7 with 35, Well 6 with 24 — every component scored.");
write("SELECT t.name AS asset_type,");
write("       count(DISTINCT a.id) AS facilities,");
write("       count(c.id) AS components,");
write('       count(c."conditionScore") AS scored,');
write('       (SELECT count(*) FROM asset_type_component_types l WHERE l."assetTypeId" = t.id) AS component_types');
write("FROM asset_types t");
write('JOIN assets a ON a."assetTypeId" = t.id AND a."deletedAt" IS NULL');
write('LEFT JOIN asset_components c ON c."assetId" = a.id');
write("WHERE t.code IN (" + Object.keys(COMPOSITION).map(str).join(", ") + ")");
write("GROUP BY t.id, t.name ORDER BY t.name;");
write("");

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`Wrote ${OUT}`);
console.log(
  `  ${COMPONENT_TYPES.length} component types, ${componentCount} components, ${observationCount} observations, ${lines.length} lines`
);
