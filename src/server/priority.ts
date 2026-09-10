import { prisma } from "@/lib/prisma";
import {
  clearsEffectivenessFloor,
  enumerateOptions,
  recommendTreatment,
  riskEffectOf,
  MATERIAL_INTERVENTION_CONDITION,
  MIN_RISK_REDUCTION_PCT,
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
import { buildLccaEvaluator } from "@/domain/waterline/lcca-evaluator";
import { getMaterialCurves } from "@/server/settings";
import { resolveWeights } from "@/server/weight-sets";
import { resolveCategoryWeights } from "@/server/category-weight-sets";
import { assetScaleFactors } from "@/server/scale-factors";
import { resolveOptionSelection } from "@/server/scenario-options";
import { CONSIDER_ALL, filterOptions } from "@/domain/waterline/option-selection";

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

  /** What this option does to the asset's risk score, as a percentage. Null
   * where risk has never been assessed. */
  riskReductionPct: number | null;

  /**
   * Whether this option may actually be funded.
   *
   * False only when the effectiveness floor rejects it: the asset is in Poor
   * condition or worse and this option would cut risk by less than
   * MIN_RISK_REDUCTION_PCT. It keeps its score and its place in the list —
   * a rejected option is a real alternative someone may want to see — but
   * nothing that allocates money may pick it.
   */
  eligible: boolean;

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
  /** Options the effectiveness floor rules out. Scored and listed, but never
   * funded. */
  belowFloor: number;
  /** The floor itself, so a screen can state the rule rather than describe it
   * in prose that can drift from the constant. */
  floor: { conditionBelow: number; minRiskReductionPct: number };
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
  /** Whether a scenario's own selection narrowed what was ranked. */
  limitedToSelection: boolean;
  ms: number;
};

export type PriorityOptions = {
  /** Null falls back to the organization's default set. */
  weightSetId?: string | null;
  categoryWeightSetId?: string | null;
  /** Rank as one scenario would: only what that scenario considers, weighted
   * and capped the way it is. Null ranks the whole library. */
  scenarioId?: string | null;
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

  const [contexts, library, combinations, curves, chosen, chosenCategories, selection, scale] =
    await Promise.all([
    buildContexts(organizationId),
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
    getMaterialCurves(organizationId),
    resolveWeights(organizationId, options.weightSetId),
    resolveCategoryWeights(organizationId, options.categoryWeightSetId),
    resolveOptionSelection(organizationId, options.scenarioId),
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
    // Narrowed to what this scenario considers, on the built option rather
    // than the library, so a combination can be selected without its members.
    const opts = filterOptions(selection, enumerateOptions(ctx, library, combinations));
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
      const riskEffect = riskEffectOf(option, ctx);

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
          riskReductionPct: riskEffect?.pct ?? null,
          eligible: clearsEffectivenessFloor(ctx.conditionScore, riskEffect?.pct ?? null),
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

  // Ranked descending. Two kinds of option sink to the bottom rather than
  // being dropped: ones the effectiveness floor rules out, and ones nobody
  // could price. Both are facts — about policy and about the cost rules — and
  // removing them from the list would make those facts invisible while
  // leaving the plan looking complete.
  rows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
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
    belowFloor: rows.filter((r) => !r.eligible).length,
    floor: {
      conditionBelow: MATERIAL_INTERVENTION_CONDITION,
      minRiskReductionPct: MIN_RISK_REDUCTION_PCT,
    },
    scaleFactorFallbacks,
    weightSetName: chosen.name,
    categoryWeightSetName: chosenCategories.name,
    scaleFactorName: scale.name,
    excludedCategories: (Object.keys(categoryWeights) as TreatmentCategory[]).filter(
      (k) => categoryWeights[k] === 0
    ),
    limitedToSelection: selection !== CONSIDER_ALL,
    ms: Date.now() - startedAt,
  };
}
