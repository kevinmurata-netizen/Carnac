import { parseFailureCost } from "@/domain/waterline/lcca";
import { prisma } from "@/lib/prisma";
import { WCI_BANDS } from "@/domain/waterline/condition";
import { isComponentScoped } from "@/domain/components/scope";
import { isDerivedMetric } from "@/server/metrics-shared";
import { parseMeasureCodes } from "@/server/measures";
import { ensureRiskModel } from "@/server/risk";
import { MEASURE_ROLES } from "@/lib/measure-roles";

/**
 * Turning an asset type's modelling on and off, and what it needs to be
 * worth modelling.
 *
 * A modelled type's assets join scenarios, Treatment Planning, work plans,
 * risk and forecasts. Nothing stops a type being modelled half set up — every
 * reader treats what is missing as unknown — but the checklist says what is
 * missing and where it is set, so a new asset class is brought up deliberately
 * rather than discovered through odd numbers.
 */

export type ReadinessItem = {
  key: "measures" | "conditionIndex" | "riskModel" | "curves" | "treatments" | "inspectionForm" | "failureCost";
  label: string;
  ok: boolean;
  detail: string;
  /** Where it is set up — the settings screen's tab for this type. */
  href: string;
};

/** Every asset type's checklist, by type id. */
export async function getModellingReadiness(organizationId: string): Promise<Map<string, ReadinessItem[]>> {
  const types = await prisma.assetType.findMany({
    where: { organizationId },
    select: {
      id: true,
      measures: true,
      failureCost: true,
      conditionModels: { select: { formula: true } },
      riskModels: { where: { isActive: true }, select: { probabilityConfig: true, consequenceConfig: true } },
      deteriorationModels: { where: { isActive: true, modelType: { not: "MARKOV" } }, select: { applicability: true } },
      treatments: { select: { role: true } },
      inspectionTemplates: { where: { isActive: true, componentTypeId: null }, select: { id: true } },
    },
  });

  const out = new Map<string, ReadinessItem[]>();
  for (const t of types) {
    const tab = `?type=${t.id}`;
    const measuresSet = Object.keys(parseMeasureCodes(t.measures)).length;
    const index = t.conditionModels.find((m) => !isDerivedMetric(m.formula) && !isComponentScoped(m.formula));
    const components = Object.keys(
      ((index?.formula as { components?: Record<string, unknown> } | null)?.components ?? {}) as object
    ).length;
    const risk = t.riskModels.find((m) => !isComponentScoped(m.probabilityConfig));
    const factorCount = (config: unknown) => ((config as { factors?: unknown[] } | null)?.factors ?? []).length;
    const curves = t.deteriorationModels.filter(
      (m) => typeof (m.applicability as { material?: unknown } | null)?.material === "string"
    ).length;
    const hasReplacement = t.treatments.some((x) => x.role === "replacement");
    const hasInspection = t.treatments.some((x) => x.role === "inspection");

    out.set(t.id, [
      {
        key: "measures",
        label: "Measures",
        ok: measuresSet > 0,
        detail: `${measuresSet} of ${MEASURE_ROLES.length} set — any left unset read as unknown`,
        href: "/settings/asset-types",
      },
      {
        key: "conditionIndex",
        label: "Condition index",
        ok: components > 0,
        detail: !index
          ? "None yet — created when the type is modelled"
          : components > 0
            ? `${components} component${components === 1 ? "" : "s"}`
            : "No components yet, so inspections record answers but no score",
        href: `/settings/condition-index${tab}`,
      },
      {
        key: "riskModel",
        label: "Risk model",
        ok: !!risk,
        detail: risk
          ? `${factorCount(risk.probabilityConfig)} probability and ${factorCount(risk.consequenceConfig)} consequence factors`
          : "None yet — a starter is created when the type is modelled",
        href: `/settings/risk-models${tab}`,
      },
      {
        key: "curves",
        label: "Deterioration curves",
        ok: curves > 0,
        detail: curves > 0 ? `${curves} material curve${curves === 1 ? "" : "s"}` : "None — its assets age on the generic 75-year curve",
        href: `/settings/deterioration-models${tab}`,
      },
      {
        key: "treatments",
        label: "Treatments",
        ok: hasReplacement,
        detail:
          t.treatments.length === 0
            ? "None — no work can be proposed for it"
            : hasReplacement
              ? `${t.treatments.length} treatment${t.treatments.length === 1 ? "" : "s"}, with a replacement baseline${hasInspection ? " and an inspection" : ""}`
              : `${t.treatments.length} treatment${t.treatments.length === 1 ? "" : "s"}, but none is its replacement, so no life-cycle comparison — and no work — can be proposed`,
        href: `/settings/treatments${tab}`,
      },
      {
        key: "failureCost",
        label: "Cost of a failure",
        ok: parseFailureCost(t.failureCost) != null,
        detail: parseFailureCost(t.failureCost)
          ? "Set — failures avoided count in life-cycle savings"
          : "Not set — life-cycle savings count no failures avoided",
        href: "/settings/asset-types",
      },
      {
        key: "inspectionForm",
        label: "Inspection form",
        ok: t.inspectionTemplates.length > 0,
        detail: t.inspectionTemplates.length > 0 ? "An active form" : "None — its assets can't be inspected in the field",
        href: "/settings/inspection-templates",
      },
    ]);
  }
  return out;
}

/**
 * Model an asset type, or stop modelling it.
 *
 * Turning one on creates what its settings screens need to exist to be used —
 * a condition index with no components yet, and the starter risk model —
 * where the type has none. Turning one off is refused for the last modelled
 * type, which would leave scenarios and planning with nothing, and for a type
 * a scenario is narrowed to, which would leave that scenario running over
 * nothing it was asked about.
 */
export async function setAssetTypeModelled(
  organizationId: string,
  assetTypeId: string,
  modelled: boolean
): Promise<{ name: string; created: string[] }> {
  const type = await prisma.assetType.findFirst({ where: { id: assetTypeId, organizationId } });
  if (!type) throw new Error("Asset type not found");
  if (type.isModelled === modelled) return { name: type.name, created: [] };

  if (!modelled) {
    const others = await prisma.assetType.count({ where: { organizationId, isModelled: true, id: { not: type.id } } });
    if (others === 0) {
      throw new Error(`${type.name} is the only modelled asset type. Model another before turning this one off.`);
    }
    const scenarios = await prisma.scenario.findMany({
      where: { organizationId, assetTypes: { some: { assetTypeId: type.id } } },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    if (scenarios.length > 0) {
      throw new Error(
        `${scenarios.map((s) => s.name).join(", ")} ${scenarios.length === 1 ? "is" : "are"} narrowed to ${type.name}. Change ${scenarios.length === 1 ? "its" : "their"} asset types first.`
      );
    }
    await prisma.assetType.update({ where: { id: type.id }, data: { isModelled: false } });
    return { name: type.name, created: [] };
  }

  const created: string[] = [];
  await prisma.assetType.update({ where: { id: type.id }, data: { isModelled: true } });

  const conditionModels = await prisma.conditionModel.findMany({ where: { assetTypeId: type.id }, select: { formula: true } });
  if (!conditionModels.some((m) => !isDerivedMetric(m.formula) && !isComponentScoped(m.formula))) {
    await prisma.conditionModel.create({
      data: {
        assetTypeId: type.id,
        name: `${type.name} Condition Index`,
        scaleMin: 0,
        scaleMax: 100,
        bands: WCI_BANDS,
        formula: { method: "weighted_average_0_10_scale", components: {} },
      },
    });
    created.push("a condition index, with no components yet");
  }

  const riskBefore = await prisma.riskModel.count({ where: { assetTypeId: type.id } });
  const risk = await ensureRiskModel(type.id);
  if ((await prisma.riskModel.count({ where: { assetTypeId: type.id } })) > riskBefore) {
    created.push(`the starter ${risk.name}`);
  }
  return { name: type.name, created };
}
