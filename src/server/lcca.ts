import { prisma } from "@/lib/prisma";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import {
  computeLcca,
  DEFAULT_LCCA_ASSUMPTIONS,
  EMERGENCY_COST_PREMIUM,
  type LccaResult,
  type LccaAssumptions,
} from "@/domain/waterline/lcca";
import {
  WATERLINE_TREATMENTS,
  isApplicable,
  estimateTreatmentCost,
  type AssetTreatmentContext,
} from "@/domain/waterline/treatment";
import { curveFor } from "@/domain/waterline/scenario";
import { effectiveAgeForCondition } from "@/domain/waterline/deterioration";
import { ageInYears } from "@/lib/format";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { getMaterialCurves } from "@/server/settings";

export type AssetLcca = {
  assumptions: LccaAssumptions;
  options: LccaResult[];
  /** Lowest total NPV among the options. */
  bestLabel: string | null;
  doNothingNpv: number | null;
};

const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

/**
 * Life-cycle cost for each treatment that could be applied to this asset,
 * plus a do-nothing baseline. Answers the §32 question "is renewal actually
 * cheaper than continuing to repair?" — which comparing sticker prices cannot.
 */
export async function getAssetLcca(
  organizationId: string,
  assetId: string,
  assumptions: LccaAssumptions = DEFAULT_LCCA_ASSUMPTIONS
): Promise<AssetLcca | null> {
  const since = new Date(Date.now() - TEN_YEARS_MS);
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1 },
      riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
      failureEvents: { where: { failureDate: { gte: since } }, select: { id: true } },
      location: { select: { serviceArea: true, pressureZone: true } },
    },
  });
  if (!asset) return null;

  const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
  const risk = asset.riskAssessments[0];
  const conditionScore = asset.conditionMeasurements[0]?.score ?? null;
  const diameterInches = attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null;
  const lengthFt = attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null;
  const customersServed = attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null;
  const currentPof = risk?.probabilityScore ?? 3;

  const ctx: AssetTreatmentContext = {
    conditionScore,
    material: attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null,
    diameterInches,
    lengthFt,
    customersServed,
    pof: currentPof,
    cof: risk?.consequenceScore ?? null,
    riskScore: risk?.riskScore ?? null,
    failuresLast10Years: asset.failureEvents.length,
    ageYears: ageInYears(asset.installationDate),
    expectedUsefulLife: asset.expectedUsefulLife ?? 75,
    criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
    serviceArea: asset.location?.serviceArea ?? null,
    pressureZone: asset.location?.pressureZone ?? null,
  };

  const assetCostInputs = { diameterInches, customersServed };
  const library = await loadTreatmentDefs(organizationId);

  // How long before this asset is exhausted if nothing resets its condition.
  const curve = curveFor(attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null, await getMaterialCurves(organizationId));
  const currentCurveAge =
    conditionScore != null
      ? effectiveAgeForCondition(curve, conditionScore)
      : (ageInYears(asset.installationDate) ?? 0);
  const remainingLife = Math.max(1, Math.round(curve.serviceLife - currentCurveAge));

  // Cost of the replacement that eventually becomes unavoidable, at the
  // emergency premium since it happens on the pipe's schedule, not ours.
  const replacementDef = library.find((d) => d.name === "Replacement") ?? WATERLINE_TREATMENTS.find((d) => d.name === "Replacement")!;
  const plannedReplacementCost = estimateTreatmentCost(replacementDef, { lengthFt, diameterInches });
  const forcedReplacementCost = Math.round(plannedReplacementCost * EMERGENCY_COST_PREMIUM);

  // Baseline: keep operating as-is. No capital cost today, but the pipe keeps
  // degrading — failure probability climbs and replacement still arrives,
  // just as an emergency instead of a planned project.
  const doNothing = computeLcca(
    {
      label: "Do nothing",
      initialCost: 0,
      annualMaintenanceCost: 0,
      resultingPof: currentPof,
      serviceLifeYears: 0,
      pofEscalationYears: remainingLife,
      forcedReplacement: { year: remainingLife, cost: forcedReplacementCost },
    },
    assetCostInputs,
    assumptions
  );

  const options: LccaResult[] = [doNothing];
  for (const def of library) {
    if (def.category === "Assess" || def.category === "Retire") continue;
    if (!isApplicable(def, ctx)) continue;

    // A treatment that only nudges condition (a patch) leaves the pipe on the
    // same deterioration path, so it inherits the escalating failure rate and
    // the eventual forced replacement — just deferred by its life extension.
    const resetsCondition = def.conditionResetTo != null;
    const deferredLife = remainingLife + def.expectedLifeExtension;

    options.push(
      computeLcca(
        {
          label: def.name,
          initialCost: estimateTreatmentCost(def, { lengthFt, diameterInches }),
          annualMaintenanceCost: def.annualMaintenanceCost,
          resultingPof: Math.max(1, currentPof * def.failureProbMultiplier),
          serviceLifeYears: def.usefulLife,
          ...(resetsCondition
            ? {}
            : {
                pofEscalationYears: deferredLife,
                forcedReplacement: { year: deferredLife, cost: forcedReplacementCost },
              }),
        },
        assetCostInputs,
        assumptions
      )
    );
  }

  const best = options.reduce((b, o) => (o.totalNpv < b.totalNpv ? o : b), options[0]);

  return {
    assumptions,
    options: options.sort((a, b) => a.totalNpv - b.totalNpv),
    bestLabel: best?.label ?? null,
    doNothingNpv: doNothing.totalNpv,
  };
}
