import { prisma } from "@/lib/prisma";
import {
  enumerateOptions,
  recommendTreatment,
  WATERLINE_TREATMENTS,
  type TreatmentCategory,
} from "@/domain/waterline/treatment";
import {
  benefitCof,
  optionTerms,
  priorityScore,
  scoreBenefits,
  type BenefitTerms,
  type BenefitWeights,
} from "@/domain/waterline/benefit";
import { NEUTRAL_SCALE_FACTOR } from "@/domain/waterline/scale-factor";
import { categoryWeight, type CategoryWeights } from "@/domain/waterline/category-weight";
import { computeCriticalityScore } from "@/domain/waterline/risk";
import { buildContexts } from "@/server/treatments";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { loadCombinations } from "@/server/combinations";
import { buildLccaEvaluator } from "@/server/lcca-evaluator";
import { getMaterialCurves } from "@/server/settings";
import { resolveWeights } from "@/server/weight-sets";
import { resolveCategoryWeights } from "@/server/category-weight-sets";
import { assetScaleFactors } from "@/server/scale-factors";

/**
 * Every treatment option on every asset, scored and ranked.
 *
 *   Priority Score = Criticality × Scale Factor × Category Weight
 *                    × Expected Benefit ÷ Total Cost
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.4.
 *
 * The important word is *every*. What existed before ranked one option per
 * asset — whatever `recommendTreatment` had already chosen on its own
 * risk-reduction-per-$1,000 basis — which meant the Priority Score could only
 * ever re-order a set someone else had picked. A combination that would have
 * won on priority never got the chance to, because it was filtered out one
 * step earlier. Scoring the whole set is what makes the formula the ranking
 * rather than a commentary on it.
 *
 * `recommendTreatment` stays exactly where it is. It answers a different
 * question — "what should we do to this asset, considered alone" — and it
 * carries the professional overrides (a patch may not headline on a failing
 * main, repeated repair steers to renewal) that no arithmetic ranking should
 * quietly discard. Its choice is carried through here as a flag so the two
 * answers can be compared rather than conflated.
 */

export type PriorityOptionRow = {
  assetId: string;
  assetCode: string;
  conditionScore: number | null;
  riskScore: number | null;

  /** "t:Relining" or "combo:<id>" — stable within a run. */
  optionId: string;
  optionLabel: string;
  category: TreatmentCategory;
  /** Member treatment names. One entry for a single treatment. */
  members: string[];
  isCombination: boolean;

  totalCost: number;
  benefitTerms: BenefitTerms;
  expectedBenefit: number;

  criticality: number;
  scaleFactor: number;
  /** Whether the scale factor is a real answer or the fallback, so a run can
   * report how much of its ranking rests on missing data. */
  scaleFactorMissing: boolean;
  categoryWeight: number;

  /** Null when the option could not be priced. */
  priority: number | null;

  /** What `recommendTreatment` would pick for this asset on its own terms. */
  isRecommended: boolean;
};

export type PriorityRanking = {
  rows: PriorityOptionRow[];
  /** Distinct assets that produced at least one priced option. */
  assetsWithOptions: number;
  optionsScored: number;
  combinationsScored: number;
  /** Options that could not be priced and so carry no score. */
  unpriced: number;
  /** Assets whose scale factor fell back to 1 because a field the formula
   * reads is missing. */
  scaleFactorFallbacks: number;
  weightSetName: string;
  categoryWeightSetName: string;
  scaleFactorName: string | null;
  /** Categories the chosen weighting switches off entirely. Their options are
   * still scored — at zero — so the plan can say what it excluded rather than
   * silently omitting it. */
  excludedCategories: TreatmentCategory[];
  ms: number;
};

export type PriorityOptions = {
  /** Null falls back to the organization's default set. */
  weightSetId?: string | null;
  categoryWeightSetId?: string | null;
};

export async function rankOptions(
  organizationId: string,
  options: PriorityOptions = {}
): Promise<PriorityRanking> {
  const startedAt = Date.now();

  const assetType = await prisma.assetType.findFirst({
    where: { organizationId, code: "WATERLINE" },
    select: { id: true },
  });

  const [contexts, library, combinations, curves, chosen, chosenCategories, scale] = await Promise.all([
    buildContexts(organizationId),
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
    getMaterialCurves(organizationId),
    resolveWeights(organizationId, options.weightSetId),
    resolveCategoryWeights(organizationId, options.categoryWeightSetId),
    assetType
      ? assetScaleFactors(organizationId, assetType.id)
      : Promise.resolve({ factors: new Map<string, { factor: number; missing: boolean }>(), name: null }),
  ]);

  // Criticality is absent from these weights on purpose: it multiplies the
  // benefit rather than forming part of it. §5.3.
  const benefitWeights: BenefitWeights = {
    conditionImprovement: chosen.weights.conditionImprovement,
    riskReduction: chosen.weights.riskReduction,
    lifeCycleSaving: chosen.weights.lifeCycleCost,
  };
  const categoryWeights: CategoryWeights = chosenCategories.weights;

  const fallbackReplacement = WATERLINE_TREATMENTS.find((d) => d.name === "Replacement")!;

  type Pending = Omit<PriorityOptionRow, "expectedBenefit" | "priority" | "benefitTerms">;
  const pending: Array<{ item: Pending; terms: BenefitTerms }> = [];

  const assetsSeen = new Set<string>();
  let scaleFactorFallbacks = 0;

  for (const { asset, ctx } of contexts) {
    const opts = enumerateOptions(ctx, library, combinations);
    if (opts.length === 0) continue;

    const cofNoCriticality = benefitCof({
      customersServed: ctx.customersServed,
      criticality: ctx.criticality ?? null,
      diameterInches: ctx.diameterInches,
      customerType: ctx.customerType ?? null,
    });

    const criticality =
      asset.storedCriticality ??
      computeCriticalityScore({
        customersServed: ctx.customersServed,
        criticality: ctx.criticality ?? null,
        diameterInches: ctx.diameterInches,
        customerType: ctx.customerType ?? null,
      }).score;

    // One evaluator per asset, reused across its options. Building it per
    // option would repeat the whole deterioration walk for every candidate.
    const lcca =
      ctx.conditionScore != null
        ? buildLccaEvaluator(ctx, ctx.conditionScore, library, curves, fallbackReplacement)
        : null;

    const scaled = scale.factors.get(asset.id);
    const scaleFactor = scaled?.factor ?? NEUTRAL_SCALE_FACTOR;
    const scaleMissing = scaled?.missing ?? false;
    if (scaleMissing) scaleFactorFallbacks++;

    assetsSeen.add(asset.id);

    // What this asset's own recommendation would be, so the two answers can be
    // compared. Deliberately not used to filter: the whole point of scoring
    // every option is that the ranking is not confined to a set chosen by a
    // different rule.
    const recommended = recommendTreatment(ctx, library, combinations).recommended?.name ?? null;

    for (const option of opts) {
      const lifeCycleSaving = lcca ? lcca.savingFor(option) : 0;

      pending.push({
        item: {
          assetId: asset.id,
          assetCode: asset.assetCode,
          conditionScore: ctx.conditionScore,
          riskScore: ctx.riskScore,
          optionId: option.id,
          optionLabel: option.label,
          category: option.category,
          members: option.members.map((m) => m.name),
          isCombination: option.id.startsWith("combo:"),
          totalCost: option.cost,
          criticality,
          scaleFactor,
          scaleFactorMissing: scaleMissing,
          categoryWeight: categoryWeight(categoryWeights, option.category),
          isRecommended: option.label === recommended,
        },
        terms: optionTerms(option, ctx, cofNoCriticality, lifeCycleSaving),
      });
    }
  }

  // Normalized across every option on every asset, so two rows' benefit scores
  // mean the same thing. §5.3 — one set, one answer.
  const rows: PriorityOptionRow[] = scoreBenefits(pending, benefitWeights).map((s) => ({
    ...s.item,
    benefitTerms: s.raw,
    expectedBenefit: s.benefit,
    priority: priorityScore({
      criticality: s.item.criticality,
      scaleFactor: s.item.scaleFactor,
      categoryWeight: s.item.categoryWeight,
      benefit: s.benefit,
      totalCost: s.item.totalCost,
    }),
  }));

  // Ranked descending, unpriced options last rather than dropped — an option
  // nobody could price is a fact about the cost rules, and hiding it makes
  // that fact invisible.
  rows.sort((a, b) => {
    if (a.priority == null && b.priority == null) return 0;
    if (a.priority == null) return 1;
    if (b.priority == null) return -1;
    return b.priority - a.priority;
  });

  return {
    rows,
    assetsWithOptions: assetsSeen.size,
    optionsScored: rows.length,
    combinationsScored: rows.filter((r) => r.isCombination).length,
    unpriced: rows.filter((r) => r.priority == null).length,
    scaleFactorFallbacks,
    weightSetName: chosen.name,
    categoryWeightSetName: chosenCategories.name,
    scaleFactorName: scale.name,
    excludedCategories: (Object.keys(categoryWeights) as TreatmentCategory[]).filter(
      (k) => categoryWeights[k] === 0
    ),
    ms: Date.now() - startedAt,
  };
}
