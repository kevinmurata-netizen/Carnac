// Risk = Probability of Failure × Consequence of Failure, both scored 1-5,
// giving a 1-25 risk score — the classic configurable matrix from the spec.
// Every factor contribution is kept and stored (RiskFactor rows) so any risk
// number in the UI can be traced back to "which inputs drove this" — the
// explainability requirement. No black boxes: each factor maps an observable
// input to a 1-5 rating, and POF/COF are weighted averages of those ratings.

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

// Inherent likelihood-of-failure rating by material, reflecting the same
// material story used across seed/condition logic (cast iron & AC age poorly).
const MATERIAL_POF_RATING: Record<string, number> = {
  "Asbestos Cement": 5,
  "Cast Iron": 4,
  Steel: 3,
  Copper: 3,
  "Ductile Iron": 2,
  HDPE: 1,
  PVC: 1,
};

const CUSTOMER_TYPE_COF_RATING: Record<string, number> = {
  Institutional: 5, // hospitals, schools — critical customers
  Industrial: 4,
  Commercial: 3,
  Mixed: 3,
  Residential: 2,
};

const CRITICALITY_RATING: Record<string, number> = {
  Critical: 5,
  High: 4,
  Moderate: 3,
  Low: 1,
};

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

export type PofWeightMap = Record<keyof typeof POF_WEIGHTS, number>;
export type CofWeightMap = Record<keyof typeof COF_WEIGHTS, number>;

/** `weights` is injected so an administrator can reweight the model in
 * Settings without editing code; it defaults to the seeded weights. */
export function computePofFactors(inputs: PofInputs, weights: PofWeightMap = POF_WEIGHTS): FactorRating[] {
  const factors: FactorRating[] = [];

  // Condition: WCI 0-100 inverted onto 1-5. Uninspected assets get a
  // conservative middle rating of 3 rather than pretending we know.
  if (inputs.conditionScore != null) {
    const rating = scaleToRating(100 - inputs.conditionScore, [15, 30, 50, 75]);
    factors.push({
      name: "Condition",
      observed: `WCI ${inputs.conditionScore}`,
      rating,
      weight: weights.CONDITION,
    });
  } else {
    factors.push({ name: "Condition", observed: "Not inspected", rating: 3, weight: weights.CONDITION });
  }

  if (inputs.ageYears != null) {
    const ageRatio = inputs.ageYears / inputs.expectedUsefulLife;
    factors.push({
      name: "Age",
      observed: `${inputs.ageYears} yr (${Math.round(ageRatio * 100)}% of expected life)`,
      rating: scaleToRating(ageRatio, [0.35, 0.55, 0.75, 0.95]),
      weight: weights.AGE,
    });
  } else {
    factors.push({ name: "Age", observed: "Unknown", rating: 3, weight: weights.AGE });
  }

  factors.push({
    name: "Failure History",
    observed: `${inputs.failuresLast10Years} failure${inputs.failuresLast10Years === 1 ? "" : "s"} in 10 yr`,
    rating: scaleToRating(inputs.failuresLast10Years, [1, 2, 3, 4]),
    weight: weights.FAILURE_HISTORY,
  });

  factors.push({
    name: "Material",
    observed: inputs.material ?? "Unknown",
    rating: inputs.material ? (MATERIAL_POF_RATING[inputs.material] ?? 3) : 3,
    weight: weights.MATERIAL,
  });

  return factors;
}

export type CofInputs = {
  customersServed: number | null;
  criticality: string | null;
  diameterInches: number | null;
  customerType: string | null;
};

export function computeCofFactors(inputs: CofInputs, weights: CofWeightMap = COF_WEIGHTS): FactorRating[] {
  return [
    {
      name: "Customers Served",
      observed: inputs.customersServed != null ? String(inputs.customersServed) : "Unknown",
      rating: inputs.customersServed != null ? scaleToRating(inputs.customersServed, [50, 120, 250, 400]) : 3,
      weight: weights.CUSTOMERS_SERVED,
    },
    {
      name: "Criticality",
      observed: inputs.criticality ?? "Unknown",
      rating: inputs.criticality ? (CRITICALITY_RATING[inputs.criticality] ?? 3) : 3,
      weight: weights.CRITICALITY,
    },
    {
      name: "Diameter",
      observed: inputs.diameterInches != null ? `${inputs.diameterInches}"` : "Unknown",
      rating: inputs.diameterInches != null ? scaleToRating(inputs.diameterInches, [6, 10, 16, 20]) : 3,
      weight: weights.DIAMETER,
    },
    {
      name: "Customer Type",
      observed: inputs.customerType ?? "Unknown",
      rating: inputs.customerType ? (CUSTOMER_TYPE_COF_RATING[inputs.customerType] ?? 3) : 3,
      weight: weights.CUSTOMER_TYPE,
    },
  ];
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
  weights: CofWeightMap = COF_WEIGHTS
): { score: number; factors: FactorRating[] } {
  const factors = computeCofFactors(inputs, weights);
  const cof = combineFactors(factors);
  return { score: Math.round(((cof - 1) / 4) * 1000) / 10, factors };
}
