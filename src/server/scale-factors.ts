import { prisma } from "@/lib/prisma";
import { evaluate, fieldsUsed, parse, FormulaError, type Node } from "@/domain/waterline/criticality-formula";
import { toScaleFactor, NEUTRAL_SCALE_FACTOR } from "@/domain/waterline/scale-factor";
import {
  getFormulaFields,
  loadAssetValues,
  readValueMaps,
  type ValueMaps,
} from "@/server/criticality";
import { assertAssetTypeInOrg, validateExpression, validateFormulaName } from "@/server/formula";

/**
 * Scale Factor formulas — how big a piece of work each asset represents.
 *
 * Everything about reading a formula is shared with criticality: the same
 * language, the same field catalogue, the same evaluator. What is different
 * lives here — the answer is a multiplier rather than a 0-100 rating, so it is
 * not clamped, and the preview reports the spread of a magnitude rather than
 * the distribution of a score.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.2.
 */

export type ScaleFactorSummary = {
  id: string;
  assetTypeId: string;
  name: string;
  expression: string;
  valueMaps: ValueMaps;
  isActive: boolean;
};

export async function listScaleFactors(organizationId: string): Promise<
  Array<{ assetTypeId: string; assetTypeName: string; assetCount: number; models: ScaleFactorSummary[] }>
> {
  const types = await prisma.assetType.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    include: {
      scaleFactorModels: { orderBy: [{ isActive: "desc" }, { name: "asc" }] },
      _count: { select: { assets: true } },
    },
  });

  return types.map((t) => ({
    assetTypeId: t.id,
    assetTypeName: t.name,
    assetCount: t._count.assets,
    models: t.scaleFactorModels.map((m) => ({
      id: m.id,
      assetTypeId: m.assetTypeId,
      name: m.name,
      expression: m.expression,
      valueMaps: readValueMaps(m.valueMaps),
      isActive: m.isActive,
    })),
  }));
}

export type ScaledAsset = { assetId: string; assetCode: string; factor: number; missing: string[] };

/** Every asset's scale factor under one formula. Unclamped — see
 * domain/waterline/scale-factor.ts for why. */
export function scaleAssets(
  tree: Node,
  assets: Array<{ assetId: string; assetCode: string; values: Record<string, number> }>
): ScaledAsset[] {
  const used = fieldsUsed(tree);
  return assets.map((asset) => {
    const result = evaluate(tree, asset.values);
    return {
      assetId: asset.assetId,
      assetCode: asset.assetCode,
      factor: result.ok ? toScaleFactor(result.value) : NEUTRAL_SCALE_FACTOR,
      missing: used.filter((f) => !(f in asset.values)),
    };
  });
}

export type ScaleFactorPreview = {
  ok: boolean;
  error?: string;
  errorAt?: number;
  fieldsUsed?: string[];
  unknownFields?: string[];
  assetsScored?: number;
  /** How many fell back to the neutral factor. Worth watching: where the
   * formula is LENGTH and typical values are in the thousands, an asset that
   * lands on 1 ranks far below its neighbours. */
  assetsMissingInputs?: number;
  min?: number;
  max?: number;
  median?: number;
  /** The spread, as a multiple. A factor that varies 400-fold moves the
   * ranking far more than one that varies threefold, and the author should
   * see which they have written. */
  spread?: number;
  highest?: ScaledAsset[];
  lowest?: ScaledAsset[];
};

/**
 * Run a candidate formula over the real network.
 *
 * Reports the median rather than the mean, and the spread as a ratio, because
 * a scale factor is a multiplier: what matters is how far apart it pushes the
 * top and bottom of the ranking, not where its centre sits.
 */
export async function previewScaleFactor(
  organizationId: string,
  assetTypeId: string,
  expression: string,
  valueMaps: ValueMaps
): Promise<ScaleFactorPreview> {
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
  const scored = scaleAssets(tree, assets);
  if (scored.length === 0) {
    return { ok: true, fieldsUsed: used, assetsScored: 0, assetsMissingInputs: 0 };
  }

  const factors = scored.map((s) => s.factor).sort((a, b) => a - b);
  const min = factors[0];
  const max = factors[factors.length - 1];
  const ranked = [...scored].sort((a, b) => b.factor - a.factor);

  return {
    ok: true,
    fieldsUsed: used,
    assetsScored: scored.length,
    assetsMissingInputs: scored.filter((s) => s.missing.length > 0).length,
    min,
    max,
    median: factors[Math.floor(factors.length / 2)],
    spread: min > 0 ? Math.round((max / min) * 10) / 10 : undefined,
    highest: ranked.slice(0, 5),
    lowest: ranked.slice(-5).reverse(),
  };
}

export async function saveScaleFactor(
  organizationId: string,
  input: { id?: string; assetTypeId: string; name: string; expression: string; valueMaps: ValueMaps }
) {
  await assertAssetTypeInOrg(organizationId, input.assetTypeId);
  const name = validateFormulaName(input.name);
  await validateExpression(input.assetTypeId, input.expression);

  const clash = await prisma.scaleFactorModel.findFirst({
    where: {
      assetTypeId: input.assetTypeId,
      name: { equals: name, mode: "insensitive" },
      ...(input.id ? { id: { not: input.id } } : {}),
    },
  });
  if (clash) throw new Error(`There is already a scale factor called "${clash.name}" for this asset type`);

  if (input.id) {
    return prisma.scaleFactorModel.update({
      where: { id: input.id },
      data: { name, expression: input.expression.trim(), valueMaps: input.valueMaps },
    });
  }

  return prisma.scaleFactorModel.create({
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
export async function activateScaleFactor(organizationId: string, id: string) {
  const model = await prisma.scaleFactorModel.findUnique({ where: { id } });
  if (!model) throw new Error("Scale factor not found");
  await assertAssetTypeInOrg(organizationId, model.assetTypeId);

  // Re-validated on the way in: a formula written before an attribute was
  // renamed would otherwise become the live one and fail on every asset.
  await validateExpression(model.assetTypeId, model.expression);

  await prisma.$transaction([
    prisma.scaleFactorModel.updateMany({
      where: { assetTypeId: model.assetTypeId },
      data: { isActive: false },
    }),
    prisma.scaleFactorModel.update({ where: { id }, data: { isActive: true } }),
  ]);
}

/**
 * Stand the active formula down.
 *
 * With none active every asset scales at 1, which means the Priority Score
 * stops accounting for size at all and divides by total cost alone — a real
 * change in what gets funded, not a return to some neutral state. The page
 * says so rather than leaving it to be discovered.
 */
export async function deactivateScaleFactor(organizationId: string, id: string) {
  const model = await prisma.scaleFactorModel.findUnique({ where: { id } });
  if (!model) throw new Error("Scale factor not found");
  await assertAssetTypeInOrg(organizationId, model.assetTypeId);
  await prisma.scaleFactorModel.update({ where: { id }, data: { isActive: false } });
}

export async function deleteScaleFactor(organizationId: string, id: string) {
  const model = await prisma.scaleFactorModel.findUnique({ where: { id } });
  if (!model) throw new Error("Scale factor not found");
  await assertAssetTypeInOrg(organizationId, model.assetTypeId);
  if (model.isActive) {
    throw new Error(
      `"${model.name}" is the active scale factor. Activate another or stand it down first — deleting it would change what every plan funds without saying so.`
    );
  }
  await prisma.scaleFactorModel.delete({ where: { id } });
}

export type CompiledScaleFactor = {
  id: string;
  name: string;
  assetTypeId: string;
  tree: Node;
  valueMaps: ValueMaps;
};

/**
 * The active formula for an asset type, compiled — or null.
 *
 * Null rather than throwing, so a formula that has gone stale cannot stop a
 * work plan generating. The caller falls back to the neutral factor, which is
 * what the ranking did before scale factors existed.
 */
export async function getActiveScaleFactor(assetTypeId: string): Promise<CompiledScaleFactor | null> {
  const model = await prisma.scaleFactorModel.findFirst({ where: { assetTypeId, isActive: true } });
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
