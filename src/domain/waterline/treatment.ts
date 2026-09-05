// Treatment library + recommendation engine for waterlines.
//
// Two hard requirements from the spec shape this file:
//   §16 "Do not invent a black-box AI algorithm" — ranking is a published
//       formula over stored treatment parameters.
//   §32 "Never present an unexplained recommendation" — every evaluation
//       carries the reason bullets that produced it, citing real asset data.
//
// Definitions here are the seed values; they are written to Treatment rows so
// administrators can retune applicability/cost/effects without code changes.

import { ASSET_LABEL } from "@/config/labels";
import {
  qualifiesUnderRules,
  type QualifyMode,
  type DecisionInput,
  type DecisionField,
  type Comparator,
  type Condition,
  type Rule,
  type RuleEffect,
  type RuleOutcome,
} from "./decision-tree";

export type TreatmentCategory = "Assess" | "Repair" | "Rehabilitate" | "Renew" | "Retire";

export type TreatmentDef = {
  name: string;
  description: string;
  category: TreatmentCategory;
  /**
   * The old technical window. Since Phase 1 of the treatment model rebuild
   * these no longer decide anything — `rulesFromWindow` turns them into the
   * named rules that do, and the stored columns behind them are read only to
   * seed a fresh install. Phase 6 removes them.
   */
  /** Inclusive WCI window in which this treatment makes sense. */
  applicableConditionMin: number;
  applicableConditionMax: number;
  /** Empty = all materials. */
  applicableMaterials?: string[];
  applicableDiameterMin?: number;
  applicableDiameterMax?: number;
  /** Post-treatment WCI. Mutually exclusive with conditionGain. */
  conditionResetTo?: number;
  /** Additive WCI improvement (capped at 100). */
  conditionGain?: number;
  /** Multiplier applied to probability-of-failure (1 = no effect). */
  failureProbMultiplier: number;
  expectedLifeExtension: number;
  unitCost: number;
  costUnit: "per LF" | "per each";
  mobilizationCost: number;
  annualMaintenanceCost: number;
  usefulLife: number;
  implementationConstraints?: string;
  /** Every rule attached to this treatment. Empty means no gate at all, so
   * the treatment is considered for any inspected asset. */
  rules?: Rule[];
  /** Whether an asset must clear any one allow rule or all of them. Blocks
   * ignore this and always apply. */
  qualifyMode?: QualifyMode;
  /** Set for treatments loaded from the database. */
  id?: string;
};

const METALLIC = ["Cast Iron", "Ductile Iron", "Steel", "Copper"];

export const WATERLINE_TREATMENTS: TreatmentDef[] = [
  {
    name: "Inspection",
    description: "Condition assessment to reduce uncertainty before committing capital.",
    category: "Assess",
    applicableConditionMin: 0,
    applicableConditionMax: 100,
    failureProbMultiplier: 1,
    expectedLifeExtension: 0,
    unitCost: 8,
    costUnit: "per LF",
    mobilizationCost: 1500,
    annualMaintenanceCost: 0,
    usefulLife: 0,
    implementationConstraints: "Improves data confidence; does not change physical condition.",
  },
  {
    name: "Leak Repair",
    description: "Targeted repair of an active leak at a discrete location.",
    category: "Repair",
    applicableConditionMin: 25,
    applicableConditionMax: 75,
    conditionGain: 5,
    failureProbMultiplier: 0.85,
    expectedLifeExtension: 3,
    unitCost: 4500,
    costUnit: "per each",
    mobilizationCost: 2000,
    annualMaintenanceCost: 200,
    usefulLife: 5,
  },
  {
    name: "Spot Repair",
    description: "Excavate and replace a short deteriorated section of pipe.",
    category: "Repair",
    applicableConditionMin: 25,
    applicableConditionMax: 60,
    conditionGain: 8,
    failureProbMultiplier: 0.8,
    expectedLifeExtension: 5,
    unitCost: 6500,
    costUnit: "per each",
    mobilizationCost: 2500,
    annualMaintenanceCost: 250,
    usefulLife: 8,
  },
  {
    name: "Valve Replacement",
    description: "Replace failed or inoperable isolation valve serving the segment.",
    category: "Repair",
    applicableConditionMin: 20,
    applicableConditionMax: 85,
    conditionGain: 3,
    failureProbMultiplier: 0.9,
    expectedLifeExtension: 10,
    unitCost: 9000,
    costUnit: "per each",
    mobilizationCost: 2500,
    annualMaintenanceCost: 150,
    usefulLife: 30,
    implementationConstraints: "Requires planned shutdown and customer notification.",
  },
  {
    name: "Cathodic Protection",
    description: "Install sacrificial anodes to arrest external corrosion on metallic mains.",
    category: "Rehabilitate",
    applicableConditionMin: 40,
    applicableConditionMax: 85,
    applicableMaterials: METALLIC,
    conditionGain: 10,
    failureProbMultiplier: 0.65,
    expectedLifeExtension: 15,
    unitCost: 35,
    costUnit: "per LF",
    mobilizationCost: 8000,
    annualMaintenanceCost: 400,
    usefulLife: 20,
    implementationConstraints: "Metallic pipe only; requires soil resistivity survey.",
  },
  {
    name: "Coating",
    description: "External protective coating to slow corrosion-driven deterioration.",
    category: "Rehabilitate",
    applicableConditionMin: 45,
    applicableConditionMax: 85,
    applicableMaterials: METALLIC,
    conditionResetTo: 65,
    failureProbMultiplier: 0.6,
    expectedLifeExtension: 15,
    unitCost: 60,
    costUnit: "per LF",
    mobilizationCost: 12000,
    annualMaintenanceCost: 300,
    usefulLife: 20,
  },
  {
    name: "Lining",
    description: "Cement-mortar lining to restore internal surface and flow capacity.",
    category: "Rehabilitate",
    applicableConditionMin: 40,
    applicableConditionMax: 70,
    applicableMaterials: METALLIC,
    applicableDiameterMin: 6,
    conditionResetTo: 70,
    failureProbMultiplier: 0.5,
    expectedLifeExtension: 25,
    unitCost: 120,
    costUnit: "per LF",
    mobilizationCost: 20000,
    annualMaintenanceCost: 500,
    usefulLife: 30,
    implementationConstraints: "Requires temporary bypass; not suitable below 6 inch diameter.",
  },
  {
    name: "Rehabilitation",
    description: "Structural rehabilitation of the existing main without full excavation.",
    category: "Rehabilitate",
    applicableConditionMin: 30,
    applicableConditionMax: 60,
    conditionResetTo: 75,
    failureProbMultiplier: 0.35,
    expectedLifeExtension: 30,
    unitCost: 150,
    costUnit: "per LF",
    mobilizationCost: 25000,
    annualMaintenanceCost: 600,
    usefulLife: 35,
  },
  {
    name: "Relining",
    description: "Cured-in-place structural liner installed through existing main.",
    category: "Rehabilitate",
    applicableConditionMin: 20,
    applicableConditionMax: 55,
    applicableDiameterMin: 6,
    conditionResetTo: 85,
    failureProbMultiplier: 0.2,
    expectedLifeExtension: 50,
    unitCost: 185,
    costUnit: "per LF",
    mobilizationCost: 30000,
    annualMaintenanceCost: 700,
    usefulLife: 50,
    implementationConstraints: "Trenchless; requires access pits and temporary bypass.",
  },
  {
    name: "Replacement",
    description: "Full open-cut replacement of the segment with new pipe.",
    category: "Renew",
    applicableConditionMin: 0,
    applicableConditionMax: 45,
    conditionResetTo: 100,
    failureProbMultiplier: 0.05,
    expectedLifeExtension: 80,
    unitCost: 300,
    costUnit: "per LF",
    mobilizationCost: 40000,
    annualMaintenanceCost: 400,
    usefulLife: 80,
  },
  {
    name: "Upsizing",
    description: "Replace with larger-diameter main to address capacity or fire-flow deficiency.",
    category: "Renew",
    applicableConditionMin: 0,
    applicableConditionMax: 45,
    applicableDiameterMax: 10,
    conditionResetTo: 100,
    failureProbMultiplier: 0.05,
    expectedLifeExtension: 80,
    unitCost: 385,
    costUnit: "per LF",
    mobilizationCost: 45000,
    annualMaintenanceCost: 450,
    usefulLife: 80,
    implementationConstraints: "Only where hydraulic analysis confirms a capacity deficiency.",
  },
  {
    name: "Abandonment",
    description: "Retire the segment in place where service can be provided by other mains.",
    category: "Retire",
    applicableConditionMin: 0,
    applicableConditionMax: 30,
    conditionResetTo: 0,
    failureProbMultiplier: 0,
    expectedLifeExtension: 0,
    unitCost: 45,
    costUnit: "per LF",
    mobilizationCost: 10000,
    annualMaintenanceCost: 0,
    usefulLife: 0,
    implementationConstraints: "Requires confirmed redundancy; only for very low customer counts.",
  },
  {
    name: "Emergency Repair",
    description: "Reactive repair following an in-service failure.",
    category: "Repair",
    applicableConditionMin: 0,
    applicableConditionMax: 50,
    conditionGain: 4,
    failureProbMultiplier: 0.9,
    expectedLifeExtension: 2,
    unitCost: 15000,
    costUnit: "per each",
    mobilizationCost: 5000,
    annualMaintenanceCost: 0,
    usefulLife: 3,
    implementationConstraints: "Unplanned; carries the highest unit cost and service disruption.",
  },
];

// ---------------------------------------------------------------------------
// Turning the old technical window into rules
// ---------------------------------------------------------------------------

/**
 * The rules a treatment's technical window and hard-coded gates amount to.
 *
 * The Phase 1 migration does exactly this in SQL for databases that already
 * hold treatments. This is the same conversion for the other case: seeding a
 * fresh organization, and the fallback library a brand-new install runs on
 * before anything is stored. The two must agree — same names, same
 * conditions — or a seeded database and a migrated one would disagree about
 * which assets qualify. `npm run qa:matrix` on a freshly seeded database is
 * what checks that.
 *
 * Names are formulaic ("Condition 0-45") so that two treatments sharing a
 * window share one rule rather than each carrying a private copy.
 */
const BLOCK_RULES: Record<string, { name: string; description: string; field: DecisionField; operator: Comparator; value: string }> = {
  Inspection: {
    name: "Skip inspection when condition is Excellent",
    description:
      "Was hard-coded. A routine inspection of a segment already in Excellent condition padded the identified-need total with work that is not needed.",
    field: "condition",
    operator: "gte",
    value: "85",
  },
  Abandonment: {
    name: "No abandonment above 25 customers",
    description:
      "Was hard-coded. Retiring a main that still serves a meaningful customer base is not a real option whatever its condition.",
    field: "customersServed",
    operator: "gt",
    value: "25",
  },
  "Emergency Repair": {
    name: "Emergency repair only after a recorded failure",
    description:
      "Was hard-coded. Emergency repair is reactive, so it is only offered where a failure has actually been recorded.",
    field: "failuresLast10Years",
    operator: "eq",
    value: "0",
  },
};

/** Matches the SQL's trim_scale(round(x, 2)): no trailing zeros, so a window
 * of 0-45 is named "Condition 0-45" and not "Condition 0.00-45.00". */
function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function makeRule(
  name: string,
  description: string,
  effect: RuleEffect,
  condition: Omit<Condition, "kind" | "id">
): Rule {
  // Derived from the name so that two treatments generating the same rule
  // generate the identical object, which is what makes them shareable.
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `gen-${key}`,
    name,
    description,
    enabled: true,
    effect,
    isGenerated: true,
    root: {
      kind: "group",
      id: `gen-g-${key}`,
      join: "AND",
      children: [{ kind: "condition", id: `gen-c-${key}`, ...condition }],
    },
  };
}

export function rulesFromWindow(def: TreatmentDef): Rule[] {
  const rules: Rule[] = [];

  // A 0-100 window constrains nothing, so it produces no rule.
  if (def.applicableConditionMin > 0 || def.applicableConditionMax < 100) {
    const lo = num(def.applicableConditionMin);
    const hi = num(def.applicableConditionMax);
    rules.push(
      makeRule(`Condition ${lo}-${hi}`, "The condition window this treatment was written for.", "allow", {
        field: "condition",
        operator: "between",
        value: lo,
        value2: hi,
      })
    );
  }

  if (def.applicableMaterials && def.applicableMaterials.length > 0) {
    const list = def.applicableMaterials.join(", ");
    rules.push(
      makeRule(`Material - ${list}`, "The materials this treatment can be used on.", "allow", {
        field: "material",
        operator: "in",
        value: list,
      })
    );
  }

  if (def.applicableDiameterMin != null) {
    rules.push(
      makeRule(
        `Diameter at least ${num(def.applicableDiameterMin)}`,
        "The smallest diameter this treatment works on.",
        "allow",
        { field: "diameterInches", operator: "gte", value: num(def.applicableDiameterMin) }
      )
    );
  }

  if (def.applicableDiameterMax != null) {
    rules.push(
      makeRule(
        `Diameter at most ${num(def.applicableDiameterMax)}`,
        "The largest diameter this treatment works on.",
        "allow",
        { field: "diameterInches", operator: "lte", value: num(def.applicableDiameterMax) }
      )
    );
  }

  const block = BLOCK_RULES[def.name];
  if (block) {
    rules.push(
      makeRule(block.name, block.description, "block", {
        field: block.field,
        operator: block.operator,
        value: block.value,
      })
    );
  }

  return rules;
}

/** Larger mains cost disproportionately more; normalized so 8" = 1.0. */
export function diameterCostFactor(diameterInches: number | null): number {
  if (!diameterInches) return 1;
  return Math.round(Math.pow(diameterInches / 8, 0.7) * 100) / 100;
}

export function estimateTreatmentCost(
  def: Pick<TreatmentDef, "unitCost" | "costUnit" | "mobilizationCost">,
  asset: { lengthFt: number | null; diameterInches: number | null }
): number {
  const factor = diameterCostFactor(asset.diameterInches);
  const base =
    def.costUnit === "per LF" ? def.unitCost * factor * (asset.lengthFt ?? 0) : def.unitCost * factor;
  return Math.round(base + def.mobilizationCost);
}

export function projectedConditionAfter(def: Pick<TreatmentDef, "conditionResetTo" | "conditionGain">, current: number): number {
  if (def.conditionResetTo != null) return def.conditionResetTo;
  if (def.conditionGain != null) return Math.min(100, current + def.conditionGain);
  return current;
}

export type AssetTreatmentContext = {
  conditionScore: number | null;
  material: string | null;
  diameterInches: number | null;
  lengthFt: number | null;
  customersServed: number | null;
  pof: number | null;
  cof: number | null;
  riskScore: number | null;
  failuresLast10Years: number;
  ageYears: number | null;
  expectedUsefulLife: number;
  /** Optional — only decision trees test it, so call sites that predate
   * trees need not supply it. */
  criticality?: string | null;
  /** Where the asset sits. Only rules test these, but they are required rather
   * than optional: a call site that quietly omitted a district would make every
   * district rule match nothing, and nothing would report that. */
  serviceArea: string | null;
  pressureZone: string | null;
};

/**
 * Whether this treatment is on the table for this asset.
 *
 * Everything that used to live here as a condition window, a material list, a
 * diameter bound or a hard-coded exception is now a named rule an
 * administrator can read and edit — see docs/TREATMENT-MODEL-REBUILD.md. The
 * Phase 1 migration converted each of them, so this returns exactly what it
 * returned before; what changed is that the reasoning is now visible.
 *
 * One check stays in code. An asset nobody has inspected has no condition to
 * reason from, and recommending capital work off a condition that does not
 * exist would be a fabricated justification (SPEC §32) rather than a policy
 * choice. That is not a rule to be tuned, so it is not offered as one.
 */
export function isApplicable(def: TreatmentDef, ctx: AssetTreatmentContext): boolean {
  if (ctx.conditionScore == null) return def.name === "Inspection";
  return explainApplicability(def, ctx).pass;
}

/** The same decision, with the trace that produced it. */
export function explainApplicability(def: TreatmentDef, ctx: AssetTreatmentContext): RuleOutcome {
  return qualifiesUnderRules(def.rules ?? [], def.qualifyMode ?? "all", toDecisionInput(ctx));
}

/** Flatten a treatment context into the shape a decision tree tests. */
export function toDecisionInput(ctx: AssetTreatmentContext): DecisionInput {
  return {
    condition: ctx.conditionScore,
    ageYears: ctx.ageYears,
    ageRatio:
      ctx.ageYears != null && ctx.expectedUsefulLife > 0
        ? Math.round((ctx.ageYears / ctx.expectedUsefulLife) * 100) / 100
        : null,
    diameterInches: ctx.diameterInches,
    lengthFt: ctx.lengthFt,
    customersServed: ctx.customersServed,
    riskScore: ctx.riskScore,
    pof: ctx.pof,
    cof: ctx.cof,
    failuresLast10Years: ctx.failuresLast10Years,
    material: ctx.material,
    criticality: ctx.criticality ?? null,
    serviceArea: ctx.serviceArea,
    pressureZone: ctx.pressureZone,
  };
}

export type TreatmentEvaluation = {
  name: string;
  category: TreatmentCategory;
  description: string;
  estimatedCost: number;
  projectedCondition: number;
  conditionGain: number;
  projectedRisk: number | null;
  riskReductionPct: number | null;
  expectedLifeExtension: number;
  /** Risk points removed per $1,000 spent — the ranking objective. */
  riskReductionPerThousand: number | null;
  reasons: string[];
};

export function evaluateTreatment(def: TreatmentDef, ctx: AssetTreatmentContext): TreatmentEvaluation {
  const estimatedCost = estimateTreatmentCost(def, { lengthFt: ctx.lengthFt, diameterInches: ctx.diameterInches });
  const current = ctx.conditionScore ?? 0;
  const projectedCondition = projectedConditionAfter(def, current);

  let projectedRisk: number | null = null;
  let riskReductionPct: number | null = null;
  let riskReductionPerThousand: number | null = null;
  if (ctx.pof != null && ctx.cof != null && ctx.riskScore != null && ctx.riskScore > 0) {
    const projectedPof = Math.max(1, ctx.pof * def.failureProbMultiplier);
    projectedRisk = Math.round(projectedPof * ctx.cof * 10) / 10;
    // Abandonment removes the asset from service entirely: no residual risk.
    if (def.failureProbMultiplier === 0) projectedRisk = 0;
    const reduction = ctx.riskScore - projectedRisk;
    riskReductionPct = Math.round((reduction / ctx.riskScore) * 1000) / 10;
    riskReductionPerThousand = estimatedCost > 0 ? Math.round((reduction / (estimatedCost / 1000)) * 1000) / 1000 : null;
  }

  return {
    name: def.name,
    category: def.category,
    description: def.description,
    estimatedCost,
    projectedCondition,
    conditionGain: Math.round((projectedCondition - current) * 10) / 10,
    projectedRisk,
    riskReductionPct,
    expectedLifeExtension: def.expectedLifeExtension,
    riskReductionPerThousand,
    reasons: [],
  };
}

export type Recommendation = {
  recommended: TreatmentEvaluation | null;
  alternatives: TreatmentEvaluation[];
  /** Present when nothing is applicable, explaining why. */
  noActionReason: string | null;
};

function bandLabel(condition: number): string {
  if (condition >= 85) return "Excellent";
  if (condition >= 70) return "Good";
  if (condition >= 50) return "Fair";
  if (condition >= 25) return "Poor";
  return "Very Poor";
}

/** Below this WCI an asset is Poor or worse, and a treatment must materially
 * address its condition rather than merely be cheap. */
const MATERIAL_INTERVENTION_CONDITION = 50;
/** Minimum risk reduction for a treatment to headline on such an asset. This
 * cleanly separates work that resets condition (lining, rehabilitation,
 * relining, replacement) from patches (valve/leak/spot/emergency repair). */
const MIN_RISK_REDUCTION_PCT = 25;

/**
 * Ranks applicable treatments by risk reduction per $1,000 (a transparent,
 * defensible value-for-money objective), then applies three published
 * overrides that stop pure cost-efficiency producing indefensible advice:
 *   1. Diagnostic-only actions never outrank physical work when the asset's
 *      condition is already known.
 *   2. On assets in Poor condition or worse, a treatment must achieve at
 *      least MIN_RISK_REDUCTION_PCT to be the headline recommendation — a
 *      cheap patch scores well per dollar but leaves a failing main failing.
 *      Patches remain visible as alternatives.
 *   3. Very Poor condition plus a repeat-failure record steers to renewal,
 *      because repeated repair never resets the asset's condition.
 */
export function recommendTreatment(
  ctx: AssetTreatmentContext,
  library: TreatmentDef[] = WATERLINE_TREATMENTS
): Recommendation {
  const applicable = library.filter((def) => isApplicable(def, ctx));

  if (applicable.length === 0) {
    return {
      recommended: null,
      alternatives: [],
      noActionReason:
        ctx.conditionScore != null && ctx.conditionScore >= 85
          ? `Condition is ${bandLabel(ctx.conditionScore)} (WCI ${ctx.conditionScore}) — no intervention is warranted yet.`
          : `No treatment in the library matches this ${ASSET_LABEL.lower}'s condition, material, and diameter.`,
    };
  }

  const evaluations = applicable.map((def) => evaluateTreatment(def, ctx));

  // Rank by value for money; fall back to condition gain when risk is unknown.
  const ranked = [...evaluations].sort((a, b) => {
    if (a.riskReductionPerThousand != null && b.riskReductionPerThousand != null) {
      return b.riskReductionPerThousand - a.riskReductionPerThousand;
    }
    return b.conditionGain - a.conditionGain;
  });

  const isDiagnostic = (e: TreatmentEvaluation) => e.category === "Assess";
  const physical = ranked.filter((e) => !isDiagnostic(e));
  const overrideReasons: string[] = [];

  // Override 2: on a failing asset, require material effectiveness.
  let eligible = physical;
  const needsMaterialIntervention =
    ctx.conditionScore != null && ctx.conditionScore < MATERIAL_INTERVENTION_CONDITION;
  if (needsMaterialIntervention) {
    const effective = physical.filter((e) => (e.riskReductionPct ?? 0) >= MIN_RISK_REDUCTION_PCT);
    if (effective.length > 0) {
      const cheaper = physical[0];
      if (cheaper && !effective.includes(cheaper)) {
        overrideReasons.push(
          `${cheaper.name} scores better per dollar but would cut risk only ${cheaper.riskReductionPct}% — too little for a ${ASSET_LABEL.lower} in this condition, so it is listed as an alternative instead.`
        );
      }
      eligible = effective;
    }
  }

  let chosen = ctx.conditionScore != null && eligible.length > 0 ? eligible[0] : ranked[0];

  const repeatFailures = ctx.failuresLast10Years >= 2;
  const veryPoor = ctx.conditionScore != null && ctx.conditionScore < 25;
  if (veryPoor && repeatFailures && chosen.category === "Repair") {
    const renewal = ranked.find((e) => e.category === "Renew" || e.name === "Relining");
    if (renewal) {
      overrideReasons.push(
        `Repair was outranked on cost alone, but with ${ctx.failuresLast10Years} failures in 10 years and Very Poor condition, repeated repair does not reset the ${ASSET_LABEL.lower}'s condition.`
      );
      chosen = renewal;
    }
  }

  chosen.reasons = buildReasons(chosen, ctx, overrideReasons);

  return {
    recommended: chosen,
    alternatives: ranked.filter((e) => e !== chosen),
    noActionReason: null,
  };
}

function buildReasons(evaluation: TreatmentEvaluation, ctx: AssetTreatmentContext, extra: string[]): string[] {
  const reasons: string[] = [];

  if (ctx.conditionScore != null) {
    reasons.push(`Condition is ${bandLabel(ctx.conditionScore)} (WCI ${ctx.conditionScore}).`);
  } else {
    reasons.push(`${ASSET_LABEL.singular} has never been inspected — condition is unknown.`);
  }

  if (ctx.ageYears != null) {
    const pct = Math.round((ctx.ageYears / ctx.expectedUsefulLife) * 100);
    reasons.push(`Age is ${ctx.ageYears} years, ${pct}% of expected useful life.`);
  }

  if (ctx.failuresLast10Years > 0) {
    reasons.push(
      `${ctx.failuresLast10Years} recorded failure${ctx.failuresLast10Years === 1 ? "" : "s"} in the last 10 years.`
    );
  }

  if (ctx.riskScore != null) {
    reasons.push(`Current risk score is ${ctx.riskScore} of 25.`);
  }

  if (ctx.customersServed != null) {
    reasons.push(`Serves ${ctx.customersServed} customers.`);
  }

  reasons.push(...extra);

  if (evaluation.conditionGain > 0) {
    reasons.push(`Projected condition after treatment: ${evaluation.projectedCondition} (+${evaluation.conditionGain}).`);
  }
  if (evaluation.riskReductionPct != null) {
    reasons.push(`Expected risk reduction: ${evaluation.riskReductionPct}%.`);
  }
  if (evaluation.expectedLifeExtension > 0) {
    reasons.push(`Adds an expected ${evaluation.expectedLifeExtension} years of service life.`);
  }
  reasons.push(`Estimated cost: $${evaluation.estimatedCost.toLocaleString("en-US")}.`);

  return reasons;
}
