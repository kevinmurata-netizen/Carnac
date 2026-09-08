import {
  estimateTreatmentCost,
  type AssetTreatmentContext,
  type TreatmentDef,
  type TreatmentOption,
} from "@/domain/waterline/treatment";

import { computeLcca, DEFAULT_LCCA_ASSUMPTIONS, EMERGENCY_COST_PREMIUM } from "@/domain/waterline/lcca";
import { curveFor } from "@/domain/waterline/scenario";
import { effectiveAgeForCondition, type CurveParams } from "@/domain/waterline/deterioration";

/**
 * Life-cycle saving for one asset's options: what leaving it alone costs over
 * the horizon, minus what treating it costs.
 *
 * Extracted because two paths now need the same number — the work plan, which
 * ranks assets by it, and Treatment Planning, which shows it as one of the
 * three terms behind Expected Benefit. Two copies of this arithmetic would
 * drift, and the ranking would then disagree with the figure printed beside
 * the recommendation it produced.
 */
export type LccaEvaluator = {
  /** Saving versus doing nothing. Positive means the treatment pays for
   * itself over the horizon. */
  savingFor: (option: TreatmentOption) => number;
  /** Years before the asset would need replacing untreated. */
  remainingLife: number;
};

/**
 * Returns null when the asset cannot be priced for Replacement — every
 * comparison here is measured against that baseline, so without it there is
 * nothing to compare to and a fabricated zero would read as "no saving"
 * rather than "not known".
 */
export function buildLccaEvaluator(
  ctx: AssetTreatmentContext,
  conditionScore: number,
  library: TreatmentDef[],
  curves: Record<string, CurveParams>,
  fallbackReplacement: TreatmentDef
): LccaEvaluator | null {
  const curve = curveFor(ctx.material, curves);
  const remainingLife = Math.max(
    1,
    Math.round(curve.serviceLife - effectiveAgeForCondition(curve, conditionScore))
  );

  const replacementDef = library.find((d) => d.name === "Replacement") ?? fallbackReplacement;
  const plannedReplacementCost = estimateTreatmentCost(replacementDef, ctx);
  if (plannedReplacementCost == null) return null;

  const forcedReplacementCost = Math.round(plannedReplacementCost * EMERGENCY_COST_PREMIUM);
  const costInputs = { diameterInches: ctx.diameterInches, customersServed: ctx.customersServed };
  const pof = ctx.pof ?? 1;

  const doNothing = computeLcca(
    {
      label: "Do nothing",
      initialCost: 0,
      annualMaintenanceCost: 0,
      resultingPof: pof,
      serviceLifeYears: 0,
      pofEscalationYears: remainingLife,
      forcedReplacement: { year: remainingLife, cost: forcedReplacementCost },
    },
    costInputs,
    DEFAULT_LCCA_ASSUMPTIONS
  );

  return {
    remainingLife,
    savingFor: (option) => {
      // A treatment that resets condition renews the asset, so no forced
      // replacement is scheduled against it; one that only adds points stays
      // on the same deterioration path and still faces the original date,
      // pushed out by whatever life it bought.
      const resetsCondition = option.members.some((m) => m.conditionResetTo != null);
      const deferredLife = remainingLife + option.expectedLifeExtension;

      const lcca = computeLcca(
        {
          label: option.label,
          initialCost: option.cost,
          // From the rate, not the treatment: a rate that prices the work
          // differently generally maintains it differently too.
          annualMaintenanceCost: option.annualMaintenanceCost,
          resultingPof: Math.max(1, pof * option.failureProbMultiplier),
          serviceLifeYears: option.usefulLife,
          ...(resetsCondition
            ? {}
            : {
                pofEscalationYears: deferredLife,
                forcedReplacement: { year: deferredLife, cost: forcedReplacementCost },
              }),
        },
        costInputs,
        DEFAULT_LCCA_ASSUMPTIONS
      );

      return doNothing.totalNpv - lcca.totalNpv;
    },
  };
}
