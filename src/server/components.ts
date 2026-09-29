import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ComponentScore } from "@/domain/components/rollup";
import {
  COMPONENT_SCOPE,
  componentConditionModelSpec,
  componentRiskModelSpec,
  isComponentScoped,
} from "@/domain/components/scope";

/**
 * Components: the parts an asset is made of, each tracked on its own.
 *
 * A component's history lives in the same tables as the whole asset's —
 * ConditionMeasurement and RiskAssessment rows with assetComponentId set — so
 * there is one history, not two. Every whole-asset reader in the app filters
 * `assetComponentId: null`; this module is where component rows are written
 * and read.
 */

export { COMPONENT_SCOPE, isComponentScoped };

/** The whole-asset condition model for a type, never a component-scoped one. */
export async function wholeAssetConditionModel(assetTypeId: string) {
  const models = await prisma.conditionModel.findMany({ where: { assetTypeId }, orderBy: { name: "asc" } });
  return models.find((m) => !isComponentScoped(m.formula)) ?? null;
}

/** The model component condition rows belong to for this asset type,
 * created on first use. */
async function componentConditionModel(assetTypeId: string, typeName: string) {
  const models = await prisma.conditionModel.findMany({ where: { assetTypeId } });
  const existing = models.find((m) => isComponentScoped(m.formula));
  if (existing) return existing;
  const spec = componentConditionModelSpec(typeName);
  return prisma.conditionModel.create({
    data: { assetTypeId, ...spec, bands: spec.bands as Prisma.InputJsonArray },
  });
}

async function componentRiskModel(assetTypeId: string, typeName: string) {
  const models = await prisma.riskModel.findMany({ where: { assetTypeId } });
  const existing = models.find((m) => isComponentScoped(m.probabilityConfig));
  if (existing) return existing;
  return prisma.riskModel.create({ data: { assetTypeId, ...componentRiskModelSpec(typeName) } });
}

/**
 * Record what was found on one component: a new condition row, a new risk
 * row, or both. Append-only — nothing earlier is touched — and the
 * component's snapshot is then refreshed from the latest rows, so the
 * snapshot can never say something the history does not.
 */
export async function recordComponentScores(
  organizationId: string,
  componentId: string,
  input: {
    observedAt: Date;
    conditionScore?: number | null;
    /** Probability and consequence, 1-5 each; risk is their product. */
    probability?: number | null;
    consequence?: number | null;
    source?: string;
  }
) {
  const component = await prisma.assetComponent.findFirst({
    where: { id: componentId, asset: { organizationId } },
    include: { asset: { select: { id: true, assetTypeId: true, assetType: { select: { name: true } } } } },
  });
  if (!component) throw new Error("Component not found");
  const { asset } = component;

  if (input.conditionScore != null) {
    const model = await componentConditionModel(asset.assetTypeId, asset.assetType.name);
    await prisma.conditionMeasurement.create({
      data: {
        assetId: asset.id,
        assetComponentId: component.id,
        conditionModelId: model.id,
        score: Math.max(0, Math.min(100, input.conditionScore)),
        measurementDate: input.observedAt,
        source: input.source ?? "Inspection",
      },
    });
  }

  if (input.probability != null && input.consequence != null) {
    const model = await componentRiskModel(asset.assetTypeId, asset.assetType.name);
    await prisma.riskAssessment.create({
      data: {
        assetId: asset.id,
        assetComponentId: component.id,
        riskModelId: model.id,
        probabilityScore: input.probability,
        consequenceScore: input.consequence,
        riskScore: input.probability * input.consequence,
        assessmentDate: input.observedAt,
      },
    });
  }

  await refreshComponentSnapshot(component.id);
}

/** Copy the latest condition and risk rows onto the component. */
export async function refreshComponentSnapshot(componentId: string) {
  const [condition, risk] = await Promise.all([
    prisma.conditionMeasurement.findFirst({
      where: { assetComponentId: componentId },
      orderBy: { measurementDate: "desc" },
      select: { score: true, measurementDate: true },
    }),
    prisma.riskAssessment.findFirst({
      where: { assetComponentId: componentId },
      orderBy: { assessmentDate: "desc" },
      select: { riskScore: true, assessmentDate: true },
    }),
  ]);
  const dates = [condition?.measurementDate, risk?.assessmentDate].filter((d): d is Date => d != null);
  await prisma.assetComponent.update({
    where: { id: componentId },
    data: {
      conditionScore: condition?.score ?? null,
      riskScore: risk?.riskScore ?? null,
      scoresAsOf: dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
    },
  });
}

export type AssetComponentRow = ComponentScore & {
  componentTypeName: string;
  installationDate: Date | null;
  scoresAsOf: Date | null;
};

/**
 * Every component of the given assets, shaped for the roll-up: its snapshot
 * scores, its own replacement cost, and its asset type's default weight for
 * its kind.
 */
export async function loadAssetComponents(
  organizationId: string,
  assetIds: string[]
): Promise<Map<string, AssetComponentRow[]>> {
  if (assetIds.length === 0) return new Map();
  const rows = await prisma.assetComponent.findMany({
    where: { assetId: { in: assetIds }, asset: { organizationId } },
    include: {
      componentType: { select: { code: true, name: true } },
      asset: { select: { assetTypeId: true } },
    },
    orderBy: [{ assetId: "asc" }, { createdAt: "asc" }],
  });

  const links = await prisma.assetTypeComponentType.findMany({
    where: { componentTypeId: { in: [...new Set(rows.map((r) => r.componentTypeId))] } },
  });
  const weightOf = new Map(links.map((l) => [`${l.assetTypeId}:${l.componentTypeId}`, l]));

  const byAsset = new Map<string, AssetComponentRow[]>();
  for (const r of rows) {
    const link = weightOf.get(`${r.asset.assetTypeId}:${r.componentTypeId}`);
    const list = byAsset.get(r.assetId) ?? [];
    list.push({
      id: r.id,
      label: r.label ?? r.componentType.name,
      componentTypeCode: r.componentType.code,
      componentTypeName: r.componentType.name,
      conditionScore: r.conditionScore,
      riskScore: r.riskScore,
      replacementCost: r.replacementCost,
      defaultCostWeight: link?.defaultCostWeight ?? null,
      installationDate: r.installationDate,
      scoresAsOf: r.scoresAsOf,
    });
    byAsset.set(r.assetId, list);
  }
  // Sorted the way the asset type lists its components, so a reservoir always
  // reads shell, roof, floor, coating, cathodic protection.
  for (const [assetId, list] of byAsset) {
    const typeId = rows.find((r) => r.assetId === assetId)!.asset.assetTypeId;
    list.sort(
      (a, b) =>
        (weightOf.get(`${typeId}:${rows.find((r) => r.id === a.id)!.componentTypeId}`)?.sortOrder ?? 0) -
        (weightOf.get(`${typeId}:${rows.find((r) => r.id === b.id)!.componentTypeId}`)?.sortOrder ?? 0)
    );
  }
  return byAsset;
}
