import { PrismaClient, AssetStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  WATERLINE_ATTRIBUTE_DEFINITIONS,
  JOINT_TYPE_OPTIONS,
  LINING_TYPE_OPTIONS,
  INSTALLATION_METHOD_OPTIONS,
  CRITICALITY_OPTIONS,
} from "../src/domain/waterline/attributes";
import { WATERLINE_INSPECTION_FIELDS, WATERLINE_TEMPLATE_NAME, INSPECTION_TYPES } from "../src/domain/waterline/inspection";
import { WCI_MODEL_NAME, WCI_BANDS, WCI_COMPONENT_WEIGHTS, computeWCI } from "../src/domain/waterline/condition";
import { WATERLINE_FAILURE_TYPES, FAILURE_SEVERITIES } from "../src/domain/waterline/failure";
import { insertAssetLineLocation } from "../src/server/geo";
import { buildNetworkLayout, type NetworkEdge } from "../src/domain/waterline/network-layout";
import { recomputeRiskForOrganization } from "../src/server/risk";
import { generatePredictions } from "../src/server/deterioration";
import { ensureTreatments } from "../src/server/treatments";
import { ensureBaselineScenarios } from "../src/server/scenarios";
import { ensureBaselineWorkPlan } from "../src/server/workplans";
import { WATERLINE_TREATMENTS } from "../src/domain/waterline/treatment";

const prisma = new PrismaClient();

// Deterministic PRNG so re-running the seed produces the same demo network.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260101);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function weightedPick<T>(entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// Sum of uniforms approximates a bounded normal-ish distribution without
// pulling in a stats dependency for a one-shot seed script.
function noise(spread: number): number {
  return (rand() + rand() + rand() - 1.5) * (spread / 1.5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const MATERIAL_WEIGHTS: Array<[string, number]> = [
  ["Cast Iron", 30],
  ["Ductile Iron", 25],
  ["PVC", 20],
  ["HDPE", 10],
  ["Asbestos Cement", 10],
  ["Steel", 5],
];

const USEFUL_LIFE_BY_MATERIAL: Record<string, number> = {
  "Cast Iron": 80,
  "Ductile Iron": 100,
  PVC: 75,
  HDPE: 75,
  "Asbestos Cement": 70,
  Steel: 75,
  Copper: 70,
};

// Baseline component-score-out-of-10 for a brand-new pipe of this material —
// drives the seeded inspection results so condition correlates sensibly with
// material and age rather than being pure noise.
const MATERIAL_BASELINE_HEALTH: Record<string, number> = {
  PVC: 9.2,
  HDPE: 9.0,
  "Ductile Iron": 8.5,
  Copper: 8.0,
  Steel: 7.0,
  "Cast Iron": 6.0,
  "Asbestos Cement": 5.0,
};

const DIAMETER_WEIGHTS: Array<[number, number]> = [
  [4, 8],
  [6, 22],
  [8, 25],
  [10, 12],
  [12, 18],
  [16, 8],
  [20, 4],
  [24, 3],
];

const STATUS_WEIGHTS: Array<[AssetStatus, number]> = [
  [AssetStatus.ACTIVE, 90],
  [AssetStatus.INACTIVE, 5],
  [AssetStatus.ABANDONED, 3],
  [AssetStatus.PLANNED, 2],
];

const CUSTOMER_TYPE_WEIGHTS: Array<[string, number]> = [
  ["Residential", 55],
  ["Commercial", 20],
  ["Mixed", 15],
  ["Institutional", 6],
  ["Industrial", 4],
];

const FAILURE_CAUSES = [
  "Corrosive soil conditions",
  "Third-party excavation damage",
  "Freeze-thaw cycling",
  "Age-related material fatigue",
  "Water hammer / surge pressure",
  "Traffic loading over shallow main",
  "Manufacturing defect",
];

const NOW = new Date();

async function main() {
  console.log("Seeding CARNAC demo data (inventory, inspections, condition, failures)…");

  await prisma.workPlanItem.deleteMany({});
  await prisma.workPlan.deleteMany({});
  await prisma.scenarioResult.deleteMany({});
  await prisma.scenarioAssumption.deleteMany({});
  await prisma.scenario.deleteMany({});
  await prisma.cost.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.treatmentRule.deleteMany({});
  await prisma.treatmentCost.deleteMany({});
  await prisma.treatment.deleteMany({});
  await prisma.deteriorationPrediction.deleteMany({});
  await prisma.deteriorationParameter.deleteMany({});
  await prisma.deteriorationModel.deleteMany({});
  await prisma.riskFactor.deleteMany({});
  await prisma.riskAssessment.deleteMany({});
  await prisma.riskModel.deleteMany({});
  await prisma.criticalityScore.deleteMany({});
  await prisma.conditionMeasurement.deleteMany({});
  await prisma.inspectionResult.deleteMany({});
  await prisma.inspectionAttachment.deleteMany({});
  await prisma.inspection.deleteMany({});
  await prisma.inspectionTemplateField.deleteMany({});
  await prisma.inspectionTemplate.deleteMany({});
  await prisma.conditionModel.deleteMany({});
  await prisma.failureEvent.deleteMany({});
  await prisma.failureType.deleteMany({});
  await prisma.assetAttributeValue.deleteMany({});
  await prisma.$executeRawUnsafe(`DELETE FROM asset_locations`);
  await prisma.asset.deleteMany({});
  await prisma.assetAttributeDefinition.deleteMany({});
  await prisma.assetType.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.organization.deleteMany({});

  const org = await prisma.organization.create({
    data: { name: "Meridian Falls Water Utility" },
  });

  const roles = await Promise.all([
    prisma.role.create({
      data: {
        name: "Administrator",
        permissions: ["*"],
      },
    }),
    prisma.role.create({
      data: {
        name: "AssetManager",
        permissions: [
          "assets:read",
          "assets:write",
          "inspections:write",
          "models:write",
          "treatments:write",
          "scenarios:write",
          "work-plans:write",
        ],
      },
    }),
    prisma.role.create({
      data: {
        name: "Inspector",
        permissions: ["assets:read", "inspections:read", "inspections:write"],
      },
    }),
    prisma.role.create({
      data: {
        name: "Executive",
        permissions: ["assets:read", "dashboards:read", "reports:read", "scenarios:read", "work-plans:read"],
      },
    }),
  ]);

  const passwordHash = await bcrypt.hash("Carnac#2026", 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: org.id,
        email: "admin@carnac.local",
        name: "Alex Rivera",
        passwordHash,
        roleId: roles[0].id,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: org.id,
        email: "manager@carnac.local",
        name: "Jordan Blake",
        passwordHash,
        roleId: roles[1].id,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: org.id,
        email: "inspector@carnac.local",
        name: "Sam Ortega",
        passwordHash,
        roleId: roles[2].id,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: org.id,
        email: "executive@carnac.local",
        name: "Taylor Kim",
        passwordHash,
        roleId: roles[3].id,
      },
    }),
  ]);
  // Inspection authorship weighted toward the Inspector and Asset Manager accounts.
  const inspectorPool = [users[2], users[2], users[2], users[1], users[1], users[0]];

  const assetType = await prisma.assetType.create({
    data: {
      code: "WATERLINE",
      name: "Waterline",
      description: "Water distribution pipeline segment",
      organizationId: org.id,
    },
  });

  const definitions = await Promise.all(
    WATERLINE_ATTRIBUTE_DEFINITIONS.map((def) =>
      prisma.assetAttributeDefinition.create({
        data: {
          assetTypeId: assetType.id,
          code: def.code,
          label: def.label,
          dataType: def.dataType,
          unit: def.unit,
          isRequired: def.isRequired ?? false,
          sortOrder: def.sortOrder,
          config: def.options ? { options: def.options } : undefined,
        },
      })
    )
  );
  const defByCode = new Map(definitions.map((d) => [d.code, d]));

  const conditionModel = await prisma.conditionModel.create({
    data: {
      assetTypeId: assetType.id,
      name: WCI_MODEL_NAME,
      scaleMin: 0,
      scaleMax: 100,
      bands: WCI_BANDS,
      formula: { method: "weighted_average_0_10_scale", components: WCI_COMPONENT_WEIGHTS },
    },
  });

  const template = await prisma.inspectionTemplate.create({
    data: {
      assetTypeId: assetType.id,
      name: WATERLINE_TEMPLATE_NAME,
      description: "Standard field assessment used to derive the Waterline Condition Index.",
    },
  });

  const templateFields = await Promise.all(
    WATERLINE_INSPECTION_FIELDS.map((f) =>
      prisma.inspectionTemplateField.create({
        data: {
          templateId: template.id,
          code: f.code,
          label: f.label,
          dataType: f.dataType,
          isRequired: f.isRequired,
          sortOrder: f.sortOrder,
          config: { helpText: f.helpText, ...(f.dataType === "NUMBER" ? { min: 0, max: 10 } : {}) },
        },
      })
    )
  );
  const fieldByCode = new Map(templateFields.map((f) => [f.code, f]));

  const failureTypes = await Promise.all(
    WATERLINE_FAILURE_TYPES.map((ft) =>
      prisma.failureType.create({
        data: { assetTypeId: assetType.id, code: ft.code, label: ft.label },
      })
    )
  );

  const ASSET_COUNT = 260;
  const CHUNK_SIZE = 15;

  // One connected network laid out over the street grid up front; each segment
  // then takes the run at its own index. Runs come back trunk-first, so the
  // lowest-numbered segments sit on the backbone.
  const layout = buildNetworkLayout(ASSET_COUNT);
  if (layout.length < ASSET_COUNT) {
    throw new Error(`Layout produced ${layout.length} runs for ${ASSET_COUNT} segments`);
  }

  for (let batchStart = 0; batchStart < ASSET_COUNT; batchStart += CHUNK_SIZE) {
    const batchEnd = Math.min(batchStart + CHUNK_SIZE, ASSET_COUNT);
    await Promise.all(
      Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i + 1).map((n) =>
        createWaterlineAsset(
          n,
          org.id,
          assetType.id,
          defByCode,
          {
            conditionModelId: conditionModel.id,
            templateId: template.id,
            fieldByCode,
            inspectorPool,
            failureTypes,
          },
          layout[n - 1]
        )
      )
    );
    console.log(`  seeded ${batchEnd}/${ASSET_COUNT} waterline segments`);
  }

  console.log("Computing risk assessments…");
  const assessed = await recomputeRiskForOrganization(org.id);
  console.log(`  assessed ${assessed} assets`);

  console.log("Generating deterioration forecasts…");
  const forecasted = await generatePredictions(org.id);
  console.log(`  forecasted ${forecasted} assets`);

  console.log("Loading treatment library…");
  await ensureTreatments(org.id);
  console.log(`  ${WATERLINE_TREATMENTS.length} treatments configured`);

  console.log("Building funding scenarios…");
  const scenarios = await ensureBaselineScenarios(org.id);
  console.log(`  ${scenarios} scenarios created and run`);

  console.log("Generating baseline work plan…");
  await ensureBaselineWorkPlan(org.id);
  console.log("  5-year capital work plan generated");

  console.log("Seed complete.");
  console.log("Demo logins (password: Carnac#2026):");
  console.log("  admin@carnac.local       Administrator");
  console.log("  manager@carnac.local     Asset Manager");
  console.log("  inspector@carnac.local   Inspector");
  console.log("  executive@carnac.local   Executive");
}

type FieldRow = { id: string; code: string };
type UserRow = { id: string };
type FailureTypeRow = { id: string; code: string };

function healthBaseAt(material: string, installationDate: Date, expectedUsefulLife: number, asOf: Date): number {
  const ageYears = (asOf.getTime() - installationDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const ageRatio = Math.max(0, ageYears / expectedUsefulLife);
  const baseline = MATERIAL_BASELINE_HEALTH[material] ?? 7;
  return clamp(baseline - ageRatio * 5.5, 0.5, 10);
}

function generateComponentScores(healthBase: number): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const code of Object.keys(WCI_COMPONENT_WEIGHTS)) {
    scores[code] = Math.round(clamp(healthBase + noise(2.2), 0, 10));
  }
  return scores;
}

async function createInspection(
  assetId: string,
  templateId: string,
  conditionModelId: string,
  fieldByCode: Map<string, FieldRow>,
  inspector: UserRow,
  inspectionDate: Date,
  healthBase: number
) {
  const scores = generateComponentScores(healthBase);
  const wci = computeWCI(scores);
  const qualityScore = Math.round((0.75 + rand() * 0.25) * 100) / 100;
  const requiresFollowUp = wci < 40 && rand() < 0.7;

  const results: Array<{ fieldId: string; numberValue?: number; textValue?: string }> = Object.entries(
    scores
  ).flatMap(([code, value]) => {
    const field = fieldByCode.get(code);
    if (!field) return [];
    return [{ fieldId: field.id, numberValue: value }];
  });

  if (wci < 55 && rand() < 0.3) {
    const otherField = fieldByCode.get("OTHER_DEFICIENCIES");
    if (otherField) {
      results.push({
        fieldId: otherField.id,
        textValue: pick([
          "Minor surface staining noted near joint.",
          "Recommend follow-up inspection within 12 months.",
          "Localized soil settlement observed along alignment.",
          "Access point partially obstructed; limited visual inspection.",
        ]),
      });
    }
  }

  const inspection = await prisma.inspection.create({
    data: {
      assetId,
      templateId,
      inspectionDate,
      inspectorId: inspector.id,
      inspectionType: weightedPick<(typeof INSPECTION_TYPES)[number]>([
        ["Routine", 55],
        ["Condition Assessment", 30],
        ["Post-Failure", 8],
        ["Follow-Up", 7],
      ]),
      qualityScore,
      requiresFollowUp,
      notes: requiresFollowUp ? "Condition below target threshold — schedule follow-up assessment." : null,
      results: { create: results },
    },
  });

  await prisma.conditionMeasurement.create({
    data: {
      assetId,
      conditionModelId,
      inspectionId: inspection.id,
      score: wci,
      measurementDate: inspectionDate,
      confidence: qualityScore,
      source: "Inspection",
    },
  });
}

async function maybeCreateFailures(
  assetId: string,
  material: string,
  installationDate: Date,
  expectedUsefulLife: number,
  failureTypes: FailureTypeRow[]
) {
  const ageYears = (NOW.getTime() - installationDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const ageRatio = clamp(ageYears / expectedUsefulLife, 0, 1.5);
  const failureProbability = clamp(ageRatio * 0.28, 0, 0.55);
  if (rand() > failureProbability) return;

  const eventCount = rand() < 0.75 ? 1 : 2;
  const agedTypes: Array<[string, number]> =
    material === "Cast Iron" || material === "Asbestos Cement"
      ? [["BREAK", 35], ["LEAK", 30], ["CORROSION", 20], ["JOINT_FAILURE", 10], ["STRUCTURAL_DETERIORATION", 5]]
      : [["LEAK", 30], ["JOINT_FAILURE", 20], ["BREAK", 15], ["EXTERNAL_LOADING", 15], ["GROUND_MOVEMENT", 10], ["PRESSURE_RELATED", 10]];

  for (let i = 0; i < eventCount; i++) {
    const typeCode = weightedPick(agedTypes);
    const failureType = failureTypes.find((ft) => ft.code === typeCode) ?? failureTypes[0];
    const yearsAgo = rand() * Math.min(ageYears, 10);
    const failureDate = new Date(NOW.getTime() - yearsAgo * 365.25 * 24 * 60 * 60 * 1000);
    const severity = weightedPick<(typeof FAILURE_SEVERITIES)[number]>([
      ["Minor", 40],
      ["Moderate", 35],
      ["Major", 18],
      ["Critical", 7],
    ]);
    const severityCostMultiplier = { Minor: 1, Moderate: 2.5, Major: 6, Critical: 12 }[severity];

    await prisma.failureEvent.create({
      data: {
        assetId,
        failureTypeId: failureType.id,
        failureDate,
        severity,
        cause: pick(FAILURE_CAUSES),
        repairCost: Math.round(randInt(1500, 6000) * severityCostMultiplier),
        downtimeHours: Math.round(randInt(1, 6) * severityCostMultiplier * 10) / 10,
        customersAffected: randInt(0, 400),
        restorationTime: Math.round(randInt(2, 10) * severityCostMultiplier * 10) / 10,
        consequenceNotes:
          severity === "Critical" || severity === "Major"
            ? "Emergency shutoff required; boil-water notice issued to affected customers."
            : null,
      },
    });
  }
}

async function createWaterlineAsset(
  n: number,
  organizationId: string,
  assetTypeId: string,
  defByCode: Map<string, { id: string }>,
  phase2: {
    conditionModelId: string;
    templateId: string;
    fieldByCode: Map<string, FieldRow>;
    inspectorPool: UserRow[];
    failureTypes: FailureTypeRow[];
  },
  edge: NetworkEdge
) {
  const assetCode = `WL-${String(n).padStart(4, "0")}`;
  // The run this segment occupies, assigned by the caller so the whole system
  // forms one connected network rather than 260 unrelated sticks.
  const area = { name: edge.serviceArea, pressureZone: edge.pressureZone, lat: edge.startLat };
  const material = weightedPick(MATERIAL_WEIGHTS);
  const diameter = weightedPick(DIAMETER_WEIGHTS);
  // Length is the length of the run it actually occupies, so the mileage on
  // the dashboard describes the network drawn on the map.
  const lengthFt = edge.lengthFt;
  const installYear = randInt(1945, 2024);
  const installationDate = new Date(Date.UTC(installYear, randInt(0, 11), randInt(1, 28)));
  const status = weightedPick(STATUS_WEIGHTS);
  const expectedUsefulLife = USEFUL_LIFE_BY_MATERIAL[material] ?? 75;
  const customersServed = randInt(2, 480);
  const customerType = weightedPick(CUSTOMER_TYPE_WEIGHTS);

  const attributeValues = [
    { code: "FACILITY_ID", text: `NET-${area.name.slice(0, 3).toUpperCase()}-${n}` },
    { code: "MATERIAL", text: material },
    { code: "DIAMETER", number: diameter },
    { code: "LENGTH", number: lengthFt },
    { code: "PRESSURE_CLASS", text: pick(["150 psi", "200 psi", "250 psi"]) },
    { code: "PIPE_CLASS", text: pick(["Class 50", "Class 52", "Class 54", "DR 18", "DR 14"]) },
    { code: "MANUFACTURER", text: pick(["Ferrocast Inc.", "Aqualine Pipe Co.", "Ridgeline Materials", "Northbend Foundry"]) },
    { code: "JOINT_TYPE", text: pick(JOINT_TYPE_OPTIONS) },
    { code: "LINING_TYPE", text: pick(LINING_TYPE_OPTIONS) },
    { code: "INSTALLATION_METHOD", text: pick(INSTALLATION_METHOD_OPTIONS) },
    { code: "NORMAL_OPERATING_PRESSURE", number: randInt(45, 120) },
    { code: "CRITICALITY", text: pick(CRITICALITY_OPTIONS) },
    { code: "CUSTOMERS_SERVED", number: customersServed },
    { code: "CUSTOMER_TYPE", text: customerType },
    { code: "OWNER", text: "Meridian Falls Water Utility" },
  ].flatMap(({ code, text, number }) => {
    const def = defByCode.get(code);
    if (!def) return [];
    return [{ definitionId: def.id, textValue: text, numberValue: number }];
  });

  const asset = await prisma.asset.create({
    data: {
      organizationId,
      assetTypeId,
      assetCode,
      status,
      ownerDepartment: "Water Distribution",
      installationDate,
      expectedUsefulLife,
      attributeValues: { create: attributeValues },
    },
  });

  await insertAssetLineLocation(
    asset.id,
    {
      startLat: edge.startLat,
      startLng: edge.startLng,
      endLat: edge.endLat,
      endLng: edge.endLng,
    },
    {
      depth: Math.round((randInt(30, 96) / 10) * 10) / 10,
      serviceArea: area.name,
      pressureZone: area.pressureZone,
    }
  );

  // Inspection & condition history — most assets have been inspected at least
  // once; some have two visits so the Condition tab shows a real trend; a
  // minority remain uninspected to exercise the "no data yet" state.
  const inspectionRoll = rand();
  const inspectionDates: Date[] = [];
  if (inspectionRoll < 0.15) {
    // no inspections yet
  } else if (inspectionRoll < 0.75) {
    inspectionDates.push(new Date(NOW.getTime() - randInt(30, 3 * 365) * 24 * 60 * 60 * 1000));
  } else {
    inspectionDates.push(new Date(NOW.getTime() - randInt(4 * 365, 6 * 365) * 24 * 60 * 60 * 1000));
    inspectionDates.push(new Date(NOW.getTime() - randInt(30, 2 * 365) * 24 * 60 * 60 * 1000));
  }

  for (const inspectionDate of inspectionDates) {
    const healthBase = healthBaseAt(material, installationDate, expectedUsefulLife, inspectionDate);
    await createInspection(
      asset.id,
      phase2.templateId,
      phase2.conditionModelId,
      phase2.fieldByCode,
      pick(phase2.inspectorPool),
      inspectionDate,
      healthBase
    );
  }

  await maybeCreateFailures(asset.id, material, installationDate, expectedUsefulLife, phase2.failureTypes);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
