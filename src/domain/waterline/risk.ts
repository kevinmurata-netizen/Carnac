// Risk = Probability of Failure × Consequence of Failure, both scored 1-5,
// giving a 1-25 risk score — the classic configurable matrix from the spec.
// Every factor contribution is kept and stored (RiskFactor rows) so any risk
// number in the UI can be traced back to "which inputs drove this" — the
// explainability requirement. No black boxes: each factor maps an observable
// input to a 1-5 rating, and POF/COF are weighted averages of those ratings.

import type { MeasureRole } from "@/lib/measure-roles";

export type FactorRating = {
  name: string;
  /** Raw observed input, for display ("62.4", "3 failures in 10 yr") */
  observed: string;
  /** 1-5 rating this input maps to */
  rating: number;
  /** Weight within its POF/COF group (group weights sum to 1) */
  weight: number;
};

export const POF_WEIGHTS = {
  CONDITION: 0.4,
  AGE: 0.25,
  FAILURE_HISTORY: 0.25,
  MATERIAL: 0.1,
} as const;

export const COF_WEIGHTS = {
  CUSTOMERS_SERVED: 0.35,
  CRITICALITY: 0.3,
  DIAMETER: 0.2,
  CUSTOMER_TYPE: 0.15,
} as const;

export const RISK_MODEL_NAME = "Waterline Risk Model (POF × COF)";

/**
 * What a factor rates, and how.
 *
 * A factor reads one input — the asset's condition, its age against its
 * expected life, its recent failures, or one of its measures (material, size,
 * customers served…, whichever attribute its type names for each) — and maps
 * it to 1–5: a number by four breakpoints, a word by a table. These are data,
 * kept on each asset type's risk model, so another asset class scores on its
 * own factors. The waterline's are below, and are what its risk model holds.
 */
export type RiskFactorSource = "condition" | "ageRatio" | "failures" | MeasureRole;

export type RiskFactorDef = {
  /** Stable key: what the weights are stored against. */
  key: string;
  /** The name recorded on each assessment's factor rows. */
  name: string;
  /** A longer label for the weights editor, where it differs. */
  label?: string;
  source: RiskFactorSource;
  /** For a number: the value at which the rating reaches 2, 3, 4 and 5.
   * Condition is rated on how far below 100 it is, so worse is higher. */
  breakpoints?: [number, number, number, number];
  /** For a word: the rating each value gets. */
  ratings?: Record<string, number>;
  /** Wrapped around a number in the recorded observation ("WCI 62", 10"). */
  prefix?: string;
  suffix?: string;
  /** The rating when the input is unknown, or a word the table lacks. */
  unknownRating?: number;
  /** The weight where a computation uses the built-in weighting rather than
   * the model's configured one (benefit, and the fallback criticality). */
  defaultWeight: number;
};

export const DEFAULT_POF_FACTORS: RiskFactorDef[] = [
  { key: "CONDITION", name: "Condition", label: "Condition (WCI)", source: "condition", breakpoints: [15, 30, 50, 75], prefix: "WCI ", defaultWeight: 0.4 },
  { key: "AGE", name: "Age", label: "Age vs expected life", source: "ageRatio", breakpoints: [0.35, 0.55, 0.75, 0.95], defaultWeight: 0.25 },
  { key: "FAILURE_HISTORY", name: "Failure History", label: "Failure history (10 yr)", source: "failures", breakpoints: [1, 2, 3, 4], defaultWeight: 0.25 },
  {
    key: "MATERIAL",
    name: "Material",
    source: "material",
    // Inherent likelihood of failure by material (cast iron and AC age poorly).
    ratings: { "Asbestos Cement": 5, "Cast Iron": 4, Steel: 3, Copper: 3, "Ductile Iron": 2, HDPE: 1, PVC: 1 },
    defaultWeight: 0.1,
  },
];

export const DEFAULT_COF_FACTORS: RiskFactorDef[] = [
  { key: "CUSTOMERS_SERVED", name: "Customers Served", label: "Customers served", source: "customersServed", breakpoints: [50, 120, 250, 400], defaultWeight: 0.35 },
  {
    key: "CRITICALITY",
    name: "Criticality",
    source: "criticality",
    ratings: { Critical: 5, High: 4, Moderate: 3, Low: 1 },
    defaultWeight: 0.3,
  },
  { key: "DIAMETER", name: "Diameter", source: "diameter", breakpoints: [6, 10, 16, 20], suffix: '"', defaultWeight: 0.2 },
  {
    key: "CUSTOMER_TYPE",
    name: "Customer Type",
    label: "Customer type",
    source: "customerType",
    // Hospitals and schools are critical customers.
    ratings: { Institutional: 5, Industrial: 4, Commercial: 3, Mixed: 3, Residential: 2 },
    defaultWeight: 0.15,
  },
];

/** The built-in weighting of a set of factors, by key. */
export function defaultWeights(defs: RiskFactorDef[]): Record<string, number> {
  return Object.fromEntries(defs.map((d) => [d.key, d.defaultWeight]));
}

function scaleToRating(value: number, breakpoints: [number, number, number, number]): number {
  const [b1, b2, b3, b4] = breakpoints;
  if (value < b1) return 1;
  if (value < b2) return 2;
  if (value < b3) return 3;
  if (value < b4) return 4;
  return 5;
}

export type PofInputs = {
  /** Latest WCI 0-100, or null if never inspected */
  conditionScore: number | null;
  ageYears: number | null;
  expectedUsefulLife: number;
  failuresLast10Years: number;
  material: string | null;
};

export type CofInputs = {
  customersServed: number | null;
  criticality: string | null;
  diameterInches: number | null;
  customerType: string | null;
  /** The other measures, for a type whose consequence factors rate them. */
  material?: string | null;
  lengthFt?: number | null;
};

/** Everything a factor can read. Each computation passes what it has; a
 * factor whose input is absent rates as unknown. */
export type RiskInputs = Partial<PofInputs> & Partial<CofInputs>;

export type PofWeightMap = Record<string, number>;
export type CofWeightMap = Record<string, number>;

/** Each factor rated 1–5 with its weight, in the order the factors are given. */
export function rateFactors(defs: RiskFactorDef[], inputs: RiskInputs, weights: Record<string, number>): FactorRating[] {
  return defs.map((def) => {
    const weight = weights[def.key] ?? 0;
    const unknown = def.unknownRating ?? 3;
    switch (def.source) {
      case "condition": {
        // Uninspected assets get a conservative middle rating rather than
        // pretending we know.
        const score = inputs.conditionScore;
        if (score == null) return { name: def.name, observed: "Not inspected", rating: unknown, weight };
        return {
          name: def.name,
          observed: `${def.prefix ?? ""}${score}${def.suffix ?? ""}`,
          rating: def.breakpoints ? scaleToRating(100 - score, def.breakpoints) : unknown,
          weight,
        };
      }
      case "ageRatio": {
        if (inputs.ageYears == null) return { name: def.name, observed: "Unknown", rating: unknown, weight };
        const ageRatio = inputs.ageYears / (inputs.expectedUsefulLife as number);
        return {
          name: def.name,
          observed: `${inputs.ageYears} yr (${Math.round(ageRatio * 100)}% of expected life)`,
          rating: def.breakpoints ? scaleToRating(ageRatio, def.breakpoints) : unknown,
          weight,
        };
      }
      case "failures": {
        const n = inputs.failuresLast10Years ?? 0;
        return {
          name: def.name,
          observed: `${n} failure${n === 1 ? "" : "s"} in 10 yr`,
          rating: def.breakpoints ? scaleToRating(n, def.breakpoints) : unknown,
          weight,
        };
      }
      default: {
        const value = measureValue(def.source, inputs);
        if (value == null) return { name: def.name, observed: "Unknown", rating: unknown, weight };
        if (typeof value === "number") {
          return {
            name: def.name,
            observed: `${def.prefix ?? ""}${value}${def.suffix ?? ""}`,
            rating: def.breakpoints ? scaleToRating(value, def.breakpoints) : unknown,
            weight,
          };
        }
        return { name: def.name, observed: value, rating: def.ratings?.[value] ?? unknown, weight };
      }
    }
  });
}

function measureValue(role: MeasureRole, inputs: RiskInputs): string | number | null {
  switch (role) {
    case "material":
      return inputs.material ?? null;
    case "diameter":
      return inputs.diameterInches ?? null;
    case "length":
      return inputs.lengthFt ?? null;
    case "customersServed":
      return inputs.customersServed ?? null;
    case "criticality":
      return inputs.criticality ?? null;
    case "customerType":
      return inputs.customerType ?? null;
  }
}

/** `weights` is injected so an administrator can reweight the model in
 * Settings without editing code; `defs` so each asset type rates its own
 * factors. Both default to the waterline's. */
export function computePofFactors(
  inputs: PofInputs & Partial<CofInputs>,
  weights: PofWeightMap = POF_WEIGHTS,
  defs: RiskFactorDef[] = DEFAULT_POF_FACTORS
): FactorRating[] {
  return rateFactors(defs, inputs, weights);
}

export function computeCofFactors(
  inputs: CofInputs,
  weights: CofWeightMap = COF_WEIGHTS,
  defs: RiskFactorDef[] = DEFAULT_COF_FACTORS
): FactorRating[] {
  return rateFactors(defs, inputs, weights);
}

/** Weighted average of factor ratings → 1-5 score, one decimal. */
export function combineFactors(factors: FactorRating[]): number {
  let sum = 0;
  let totalWeight = 0;
  for (const f of factors) {
    sum += f.rating * f.weight;
    totalWeight += f.weight;
  }
  if (totalWeight === 0) return 1;
  return Math.round((sum / totalWeight) * 10) / 10;
}

export type RiskBand = { label: string; min: number; color: string };

// Sorted highest-to-lowest; matched by min (same pattern as condition bands).
export const RISK_BANDS: RiskBand[] = [
  { label: "Very High", min: 15, color: "#dc2626" },
  { label: "High", min: 10, color: "#f97316" },
  { label: "Moderate", min: 5, color: "#eab308" },
  { label: "Low", min: 0, color: "#16a34a" },
];

export function getRiskBand(riskScore: number): RiskBand {
  return RISK_BANDS.find((b) => riskScore >= b.min) ?? RISK_BANDS[RISK_BANDS.length - 1];
}

/** Criticality 0-100 from COF-style inputs — usable on its own (spec §12) and
 * alongside risk. Simple rescale of the weighted COF rating: (cof-1)/4*100. */
export function computeCriticalityScore(
  inputs: CofInputs,
  weights?: CofWeightMap,
  defs: RiskFactorDef[] = DEFAULT_COF_FACTORS
): { score: number; factors: FactorRating[] } {
  const factors = computeCofFactors(inputs, weights ?? defaultWeights(defs), defs);
  const cof = combineFactors(factors);
  return { score: Math.round(((cof - 1) / 4) * 1000) / 10, factors };
}
