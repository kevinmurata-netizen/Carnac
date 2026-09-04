import { prisma } from "@/lib/prisma";
import {
  parse,
  evaluate,
  fieldsUsed,
  toCriticalityScore,
  FormulaError,
  type Node,
} from "@/domain/waterline/criticality-formula";

/**
 * Criticality formulas: the field catalogue they can read, and running one.
 *
 * The catalogue is built from what an asset type actually has rather than a
 * hand-written list, so adding an attribute makes it available to formulas
 * without a code change — the same rule the rest of this application follows
 * for asset-type-agnostic configuration.
 */

export type FieldKind = "number" | "choice" | "derived";

export type FormulaField = {
  /** The token a formula uses, e.g. CUSTOMERS_SERVED. */
  code: string;
  label: string;
  kind: FieldKind;
  unit: string | null;
  /** For choices: the values present, so each can be given a number. */
  choices?: string[];
  /** How many assets carry a value — an empty field is visibly a poor input. */
  populated: number;
  observedMin: number | null;
  observedMax: number | null;
  help: string;
};

/**
 * Values every asset has regardless of its attributes.
 *
 * These are computed rather than stored, which is why they are listed
 * separately: a formula asking for AGE_YEARS should get today's age, not
 * whatever was true when a row was last written.
 */
const DERIVED_FIELDS = [
  { code: "AGE_YEARS", label: "Age", unit: "years", help: "Whole years since installation." },
  { code: "CONDITION", label: "Condition score", unit: null, help: "Most recent condition score, 0-100." },
  { code: "RISK_SCORE", label: "Risk score", unit: null, help: "Most recent risk score, 1-25." },
  { code: "FAILURE_COUNT", label: "Failures", unit: null, help: "Failures ever recorded against this asset." },
] as const;

export type AssetValues = {
  assetId: string;
  assetCode: string;
  values: Record<string, number>;
  /** Fields the formula wanted that this asset had no value for. */
  missing: string[];
};

/** Every field a formula for this asset type may read. */
export async function getFormulaFields(assetTypeId: string): Promise<FormulaField[]> {
  const [definitions, assetCount] = await Promise.all([
    prisma.assetAttributeDefinition.findMany({ where: { assetTypeId }, orderBy: { sortOrder: "asc" } }),
    prisma.asset.count({ where: { assetTypeId, deletedAt: null } }),
  ]);

  const fields: FormulaField[] = [];

  for (const def of definitions) {
    // Text is deliberately absent: a manufacturer name has no ordering, so
    // mapping it to a number would invite a meaningless formula.
    if (def.dataType === "NUMBER") {
      const stats = await prisma.assetAttributeValue.aggregate({
        where: { definitionId: def.id, asset: { deletedAt: null } },
        _count: { numberValue: true },
        _min: { numberValue: true },
        _max: { numberValue: true },
      });
      fields.push({
        code: def.code,
        label: def.label,
        kind: "number",
        unit: def.unit,
        populated: stats._count.numberValue,
        observedMin: stats._min.numberValue,
        observedMax: stats._max.numberValue,
        help: `Recorded on ${stats._count.numberValue} of ${assetCount} assets.`,
      });
      continue;
    }

    if (def.dataType === "ENUM") {
      const rows = await prisma.assetAttributeValue.groupBy({
        by: ["textValue"],
        where: { definitionId: def.id, asset: { deletedAt: null }, textValue: { not: null } },
        _count: { _all: true },
      });
      const choices = rows
        .map((r) => r.textValue!)
        .filter(Boolean)
        .sort();
      fields.push({
        code: def.code,
        label: def.label,
        kind: "choice",
        unit: def.unit,
        choices,
        populated: rows.reduce((sum, r) => sum + r._count._all, 0),
        observedMin: null,
        observedMax: null,
        help: `A dropdown — give each value a number below to use it in a formula.`,
      });
    }
  }

  for (const d of DERIVED_FIELDS) {
    fields.push({
      code: d.code,
      label: d.label,
      kind: "derived",
      unit: d.unit,
      populated: assetCount,
      observedMin: null,
      observedMax: null,
      help: d.help,
    });
  }

  return fields;
}

export type ValueMaps = Record<string, Record<string, number>>;

export function readValueMaps(raw: unknown): ValueMaps {
  if (!raw || typeof raw !== "object") return {};
  const out: ValueMaps = {};
  for (const [field, mapping] of Object.entries(raw as Record<string, unknown>)) {
    if (!mapping || typeof mapping !== "object") continue;
    const inner: Record<string, number> = {};
    for (const [value, score] of Object.entries(mapping as Record<string, unknown>)) {
      const n = Number(score);
      if (Number.isFinite(n)) inner[value] = n;
    }
    out[field] = inner;
  }
  return out;
}

/**
 * Each asset's numbers, ready for a formula.
 *
 * Loaded in one pass for the whole asset type rather than per asset: a model
 * run scores every asset, and a query per asset would turn one page load into
 * hundreds.
 */
export async function loadAssetValues(
  organizationId: string,
  assetTypeId: string,
  valueMaps: ValueMaps
): Promise<AssetValues[]> {
  const assets = await prisma.asset.findMany({
    where: { organizationId, assetTypeId, deletedAt: null },
    select: {
      id: true,
      assetCode: true,
      installationDate: true,
      attributeValues: {
        select: { numberValue: true, textValue: true, definition: { select: { code: true, dataType: true } } },
      },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1, select: { score: true } },
      riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1, select: { riskScore: true } },
      _count: { select: { failureEvents: true } },
    },
  });

  const now = Date.now();

  return assets.map((asset) => {
    const values: Record<string, number> = {};
    const missing: string[] = [];

    for (const av of asset.attributeValues) {
      const code = av.definition.code;
      if (av.definition.dataType === "NUMBER") {
        if (av.numberValue != null) values[code] = av.numberValue;
      } else if (av.definition.dataType === "ENUM" && av.textValue != null) {
        const mapped = valueMaps[code]?.[av.textValue];
        // An unmapped choice is left absent rather than guessed at, so the
        // preview can report it instead of scoring on a silent zero.
        if (typeof mapped === "number") values[code] = mapped;
        else missing.push(code);
      }
    }

    if (asset.installationDate) {
      values.AGE_YEARS = Math.floor((now - asset.installationDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
    const condition = asset.conditionMeasurements[0]?.score;
    if (condition != null) values.CONDITION = condition;
    const risk = asset.riskAssessments[0]?.riskScore;
    if (risk != null) values.RISK_SCORE = risk;
    values.FAILURE_COUNT = asset._count.failureEvents;

    return { assetId: asset.id, assetCode: asset.assetCode, values, missing };
  });
}

export type ScoredAsset = { assetId: string; assetCode: string; score: number; missing: string[] };

export function scoreAssets(tree: Node, assets: AssetValues[]): ScoredAsset[] {
  const used = fieldsUsed(tree);
  return assets.map((asset) => {
    const result = evaluate(tree, asset.values);
    return {
      assetId: asset.assetId,
      assetCode: asset.assetCode,
      score: result.ok ? toCriticalityScore(result.value) : 0,
      // Only the fields this formula actually reads matter; an unmapped
      // dropdown the formula ignores is not a problem worth reporting.
      missing: used.filter((f) => !(f in asset.values)),
    };
  });
}

export type FormulaPreview = {
  ok: boolean;
  error?: string;
  errorAt?: number;
  fieldsUsed?: string[];
  unknownFields?: string[];
  assetsScored?: number;
  assetsMissingInputs?: number;
  min?: number;
  max?: number;
  average?: number;
  /** Rough shape of the distribution, in ten buckets of ten. */
  histogram?: number[];
  highest?: ScoredAsset[];
  lowest?: ScoredAsset[];
};

/**
 * Compiles and runs a formula against every asset, without saving anything.
 *
 * A formula that parses can still be wrong in the way that matters — every
 * asset scoring 100, or nothing scoring at all — and only running it against
 * real data shows that. Hence the distribution rather than a bare "valid".
 */
export async function previewFormula(
  organizationId: string,
  assetTypeId: string,
  expression: string,
  valueMaps: ValueMaps
): Promise<FormulaPreview> {
  let tree: Node;
  try {
    tree = parse(expression);
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message, errorAt: e.at };
    return { ok: false, error: e instanceof Error ? e.message : "Could not read that formula" };
  }

  const fields = await getFormulaFields(assetTypeId);
  const known = new Set(fields.map((f) => f.code));
  const used = fieldsUsed(tree);
  const unknown = used.filter((f) => !known.has(f));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `No field called ${unknown.map((u) => `"${u}"`).join(", ")} on this asset type`,
      unknownFields: unknown,
      fieldsUsed: used,
    };
  }

  const assets = await loadAssetValues(organizationId, assetTypeId, valueMaps);
  const scored = scoreAssets(tree, assets);
  if (scored.length === 0) {
    return { ok: true, fieldsUsed: used, assetsScored: 0, assetsMissingInputs: 0 };
  }

  const scores = scored.map((s) => s.score);
  const histogram = Array.from({ length: 10 }, () => 0);
  for (const s of scores) histogram[Math.min(Math.floor(s / 10), 9)]++;

  const ranked = [...scored].sort((a, b) => b.score - a.score);

  return {
    ok: true,
    fieldsUsed: used,
    assetsScored: scored.length,
    assetsMissingInputs: scored.filter((s) => s.missing.length > 0).length,
    min: Math.min(...scores),
    max: Math.max(...scores),
    average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    histogram,
    highest: ranked.slice(0, 5),
    lowest: ranked.slice(-5).reverse(),
  };
}

// ---------------------------------------------------------------------------
// Stored formulas
// ---------------------------------------------------------------------------

export type CriticalityModelSummary = {
  id: string;
  assetTypeId: string;
  name: string;
  expression: string;
  valueMaps: ValueMaps;
  isActive: boolean;
};

export async function listCriticalityModels(organizationId: string): Promise<
  Array<{ assetTypeId: string; assetTypeName: string; assetCount: number; models: CriticalityModelSummary[] }>
> {
  const types = await prisma.assetType.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    include: {
      criticalityModels: { orderBy: [{ isActive: "desc" }, { name: "asc" }] },
      _count: { select: { assets: true } },
    },
  });

  return types.map((t) => ({
    assetTypeId: t.id,
    assetTypeName: t.name,
    assetCount: t._count.assets,
    models: t.criticalityModels.map((m) => ({
      id: m.id,
      assetTypeId: m.assetTypeId,
      name: m.name,
      expression: m.expression,
      valueMaps: readValueMaps(m.valueMaps),
      isActive: m.isActive,
    })),
  }));
}

/** Every formula, flattened for a picker — what a scenario may choose from. */
export async function listFormulaChoices(
  organizationId: string
): Promise<Array<{ id: string; name: string; assetTypeName: string; isActive: boolean }>> {
  const groups = await listCriticalityModels(organizationId);
  return groups.flatMap((g) =>
    g.models.map((m) => ({
      id: m.id,
      name: m.name,
      assetTypeName: g.assetTypeName,
      isActive: m.isActive,
    }))
  );
}

async function assertAssetTypeInOrg(organizationId: string, assetTypeId: string) {
  const type = await prisma.assetType.findFirst({ where: { id: assetTypeId, organizationId } });
  if (!type) throw new Error("Asset type not found");
  return type;
}

function validateName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Give the formula a name");
  if (trimmed.length > 60) throw new Error("Keep formula names under 60 characters");
  return trimmed;
}

/** Parses and checks every field exists, so an unusable formula is never
 * stored — the model run should not be where a typo first shows up. */
async function validateExpression(assetTypeId: string, expression: string) {
  let tree: Node;
  try {
    tree = parse(expression);
  } catch (e) {
    if (e instanceof FormulaError) throw new Error(`${e.message} (at character ${e.at + 1})`);
    throw e;
  }
  const fields = await getFormulaFields(assetTypeId);
  const known = new Set(fields.map((f) => f.code));
  const unknown = fieldsUsed(tree).filter((f) => !known.has(f));
  if (unknown.length > 0) {
    throw new Error(`No field called ${unknown.map((u) => `"${u}"`).join(", ")} on this asset type`);
  }
  return tree;
}

export async function saveCriticalityModel(
  organizationId: string,
  input: { id?: string; assetTypeId: string; name: string; expression: string; valueMaps: ValueMaps }
) {
  await assertAssetTypeInOrg(organizationId, input.assetTypeId);
  const name = validateName(input.name);
  await validateExpression(input.assetTypeId, input.expression);

  const clash = await prisma.criticalityModel.findFirst({
    where: {
      assetTypeId: input.assetTypeId,
      name: { equals: name, mode: "insensitive" },
      ...(input.id ? { id: { not: input.id } } : {}),
    },
  });
  if (clash) throw new Error(`There is already a formula called "${clash.name}" for this asset type`);

  if (input.id) {
    return prisma.criticalityModel.update({
      where: { id: input.id },
      data: { name, expression: input.expression.trim(), valueMaps: input.valueMaps },
    });
  }

  return prisma.criticalityModel.create({
    data: {
      assetTypeId: input.assetTypeId,
      name,
      expression: input.expression.trim(),
      valueMaps: input.valueMaps,
      isActive: false,
    },
  });
}

/** Makes one formula the one that runs, standing the others down. */
export async function activateCriticalityModel(organizationId: string, id: string) {
  const model = await prisma.criticalityModel.findUnique({ where: { id } });
  if (!model) throw new Error("Formula not found");
  await assertAssetTypeInOrg(organizationId, model.assetTypeId);

  // Re-validated on the way in: a formula written before an attribute was
  // renamed would otherwise become the live one and fail on every asset.
  await validateExpression(model.assetTypeId, model.expression);

  await prisma.$transaction([
    prisma.criticalityModel.updateMany({
      where: { assetTypeId: model.assetTypeId },
      data: { isActive: false },
    }),
    prisma.criticalityModel.update({ where: { id }, data: { isActive: true } }),
  ]);
}

export async function deactivateCriticalityModel(organizationId: string, id: string) {
  const model = await prisma.criticalityModel.findUnique({ where: { id } });
  if (!model) throw new Error("Formula not found");
  await assertAssetTypeInOrg(organizationId, model.assetTypeId);
  await prisma.criticalityModel.update({ where: { id }, data: { isActive: false } });
}

export async function deleteCriticalityModel(organizationId: string, id: string) {
  const model = await prisma.criticalityModel.findUnique({ where: { id } });
  if (!model) throw new Error("Formula not found");
  await assertAssetTypeInOrg(organizationId, model.assetTypeId);
  await prisma.criticalityModel.delete({ where: { id } });
}

/**
 * The active formula for an asset type, compiled and ready — or null.
 *
 * Null is the signal to fall back to the consequence-of-failure derivation,
 * which is what criticality meant before formulas existed.
 */
export type CompiledFormula = {
  id: string;
  name: string;
  assetTypeId: string;
  tree: Node;
  valueMaps: ValueMaps;
};

/**
 * One stored formula, compiled — or null if it no longer parses.
 *
 * Null rather than throwing, because a formula that has gone stale (a renamed
 * attribute, say) must not be able to stop a model run or a work plan. The
 * caller falls back to what it would have done without a formula.
 */
export async function compileCriticalityModel(id: string): Promise<CompiledFormula | null> {
  const model = await prisma.criticalityModel.findUnique({ where: { id } });
  if (!model) return null;
  try {
    return {
      id: model.id,
      name: model.name,
      assetTypeId: model.assetTypeId,
      tree: parse(model.expression),
      valueMaps: readValueMaps(model.valueMaps),
    };
  } catch {
    return null;
  }
}

/**
 * The active formula for an asset type, compiled and ready — or null.
 *
 * Null is the signal to fall back to the consequence-of-failure derivation,
 * which is what criticality meant before formulas existed.
 */
export async function getActiveFormula(assetTypeId: string): Promise<CompiledFormula | null> {
  const model = await prisma.criticalityModel.findFirst({ where: { assetTypeId, isActive: true } });
  if (!model) return null;
  return compileCriticalityModel(model.id);
}
