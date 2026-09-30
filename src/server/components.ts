import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ComponentScore } from "@/domain/components/rollup";
import { attributesOf, coerceComponentAttributes, type ComponentAttribute } from "@/domain/components/attributes";
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
    /** The inspection these came from, when they did. */
    inspectionId?: string;
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
        inspectionId: input.inspectionId ?? null,
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
  componentTypeId: string;
  componentTypeName: string;
  /** The label as entered, null when the component goes by its type's name. */
  ownLabel: string | null;
  installationDate: Date | null;
  scoresAsOf: Date | null;
  /** What its type records, and what has been recorded. */
  attributeDefs: ComponentAttribute[];
  attributes: Record<string, unknown>;
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
      componentType: { select: { code: true, name: true, attributeSchema: true } },
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
      ownLabel: r.label,
      componentTypeId: r.componentTypeId,
      componentTypeCode: r.componentType.code,
      componentTypeName: r.componentType.name,
      attributeDefs: attributesOf(r.componentType.attributeSchema),
      attributes: (r.attributes ?? {}) as Record<string, unknown>,
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

// ---------------------------------------------------------------------------
// One asset's components: what it actually has, which is not always every
// part its type can have — a steel tank has cathodic protection, a concrete
// one may not — and sometimes more than one of a part: a station's pumps.
// ---------------------------------------------------------------------------

export type AddableComponentType = {
  id: string;
  name: string;
  description: string | null;
  attributes: ComponentAttribute[];
};

/** The component types an asset's own type is made of. */
export async function componentTypesForAsset(organizationId: string, assetId: string): Promise<AddableComponentType[]> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null },
    select: {
      assetType: {
        select: {
          componentTypes: {
            orderBy: { sortOrder: "asc" },
            include: { componentType: { select: { id: true, name: true, description: true, attributeSchema: true } } },
          },
        },
      },
    },
  });
  return (asset?.assetType.componentTypes ?? []).map(({ componentType: t }) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    attributes: attributesOf(t.attributeSchema),
  }));
}

export type ComponentDetails = {
  label: string | null;
  installationDate: Date | null;
  replacementCost: number | null;
  /** Attribute key → raw form string. Blank means not recorded. */
  attributes: Record<string, string>;
};

function checkCost(cost: number | null) {
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new Error("A replacement cost can't be negative");
  return cost;
}

/**
 * Add a part to an asset. A second of the same kind is numbered — "Pump 2" —
 * unless it is given a label of its own, so two rows never read the same.
 */
export async function addAssetComponent(
  organizationId: string,
  assetId: string,
  componentTypeId: string,
  details: ComponentDetails
) {
  const types = await componentTypesForAsset(organizationId, assetId);
  const type = types.find((t) => t.id === componentTypeId);
  if (!type) throw new Error("That component is not one this kind of asset is made of");

  const siblings = await prisma.assetComponent.count({ where: { assetId, componentTypeId } });
  const label = details.label?.trim() || (siblings > 0 ? `${type.name} ${siblings + 1}` : null);

  return prisma.assetComponent.create({
    data: {
      assetId,
      componentTypeId,
      label,
      installationDate: details.installationDate,
      replacementCost: checkCost(details.replacementCost),
      attributes: coerceComponentAttributes(type.attributes, details.attributes),
    },
    select: { id: true },
  });
}

/** Change what is known about a component. Its scores come from inspection
 * and are not edited here. */
export async function updateAssetComponent(organizationId: string, componentId: string, details: ComponentDetails) {
  const component = await prisma.assetComponent.findFirst({
    where: { id: componentId, asset: { organizationId, deletedAt: null } },
    include: { componentType: { select: { attributeSchema: true } } },
  });
  if (!component) throw new Error("Component not found");

  await prisma.assetComponent.update({
    where: { id: componentId },
    data: {
      label: details.label?.trim() || null,
      installationDate: details.installationDate,
      replacementCost: checkCost(details.replacementCost),
      attributes: coerceComponentAttributes(attributesOf(component.componentType.attributeSchema), details.attributes),
    },
  });
  return { assetId: component.assetId };
}

export type ComponentHistory = { observations: number; inspections: number };

/** How much has been recorded against each component — what removing it
 * would take with it. */
export async function componentHistory(componentIds: string[]): Promise<Map<string, ComponentHistory>> {
  if (componentIds.length === 0) return new Map();
  const [conditions, risks, inspections] = await Promise.all([
    prisma.conditionMeasurement.groupBy({
      by: ["assetComponentId"],
      where: { assetComponentId: { in: componentIds } },
      _count: { _all: true },
    }),
    prisma.riskAssessment.groupBy({
      by: ["assetComponentId"],
      where: { assetComponentId: { in: componentIds } },
      _count: { _all: true },
    }),
    prisma.inspection.groupBy({
      by: ["assetComponentId"],
      where: { assetComponentId: { in: componentIds } },
      _count: { _all: true },
    }),
  ]);
  const out = new Map<string, ComponentHistory>(componentIds.map((id) => [id, { observations: 0, inspections: 0 }]));
  for (const c of [...conditions, ...risks]) out.get(c.assetComponentId!)!.observations += c._count._all;
  for (const i of inspections) out.get(i.assetComponentId!)!.inspections = i._count._all;
  return out;
}

/**
 * Remove a component from an asset, with everything recorded against it.
 *
 * Its history goes too, deliberately: re-filed as the whole asset's, a
 * coating's findings would say something false about the reservoir. The
 * confirmation says how much is being removed before this runs.
 */
export async function removeAssetComponent(organizationId: string, componentId: string) {
  const component = await prisma.assetComponent.findFirst({
    where: { id: componentId, asset: { organizationId } },
    include: { componentType: { select: { name: true } } },
  });
  if (!component) throw new Error("Component not found");

  await prisma.$transaction(async (tx) => {
    const inspections = await tx.inspection.findMany({ where: { assetComponentId: componentId }, select: { id: true } });
    const inspectionIds = inspections.map((i) => i.id);
    const risks = await tx.riskAssessment.findMany({ where: { assetComponentId: componentId }, select: { id: true } });

    await tx.conditionMeasurement.deleteMany({
      where: { OR: [{ assetComponentId: componentId }, { inspectionId: { in: inspectionIds } }] },
    });
    await tx.riskFactor.deleteMany({ where: { riskAssessmentId: { in: risks.map((r) => r.id) } } });
    await tx.riskAssessment.deleteMany({ where: { assetComponentId: componentId } });
    await tx.inspectionResult.deleteMany({ where: { inspectionId: { in: inspectionIds } } });
    await tx.inspectionAttachment.deleteMany({ where: { inspectionId: { in: inspectionIds } } });
    await tx.inspection.deleteMany({ where: { id: { in: inspectionIds } } });
    await tx.assetComponent.delete({ where: { id: componentId } });
  });

  return { assetId: component.assetId, label: component.label ?? component.componentType.name };
}
