import { combineFactors, type FactorRating } from "@/domain/waterline/risk";

/**
 * Scoring a finished-water reservoir.
 *
 * A tank is not a pipe. It does not fail along its length, its consequence is
 * the storage a zone loses rather than the customers on one main, and the most
 * telling thing about it is often when somebody last went inside. So this is a
 * separate model rather than the waterline one with different weights.
 *
 * **It is a demonstration model, not JVWCD's.** The District publishes
 * capacity, material, build year and inspection year, and nothing about how it
 * judges condition or consequence. Everything below is a defensible reading of
 * those four fields — service lives from common practice, an inspection
 * interval of five years from AWWA guidance — and would be replaced by the
 * District's own criteria before anyone made a decision with it.
 */

/** Years of service a tank is expected to give, by what it is built of. */
export const SERVICE_LIFE_YEARS: Record<string, number> = {
  Concrete: 80,
  "Prestressed Concrete": 70,
  "Buried Concrete": 80,
  Steel: 60,
  Other: 70,
  Unknown: 70,
};

export const RESERVOIR_POF_WEIGHTS = {
  /** How far through its expected life it is. */
  AGE: 0.4,
  /** How long since anyone looked inside. */
  INSPECTION: 0.35,
  /** What it is built of, before age is considered. */
  MATERIAL: 0.25,
} as const;

export const RESERVOIR_COF_WEIGHTS = {
  /** Storage lost if it goes out of service. */
  CAPACITY: 1,
} as const;

export function serviceLifeFor(material: string | null): number {
  return (material ? SERVICE_LIFE_YEARS[material] : undefined) ?? SERVICE_LIFE_YEARS.Unknown;
}

/**
 * A condition index from age alone, 0-100.
 *
 * Not a measurement and never presented as one — no tank here has been
 * assessed. A tank holds condition well for most of its life and falls away
 * near the end of it, which the exponent is doing; at its expected life it
 * reads 30 rather than 0, because a 60-year-old steel tank is usually still
 * standing and still in service.
 */
export function conditionFromAge(ageYears: number | null, serviceLife: number): number | null {
  if (ageYears == null || serviceLife <= 0) return null;
  const used = Math.max(0, ageYears) / serviceLife;
  const score = 100 - 70 * Math.pow(Math.min(used, 1.6), 1.4);
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

export type ReservoirInputs = {
  ageYears: number | null;
  material: string | null;
  /** Years since the last interior inspection; null when there has never been
   * one, which is treated as worse than a long gap rather than as unknown. */
  yearsSinceInspection: number | null;
  capacityMg: number | null;
};

/** 1-5 from a value and four ascending thresholds. */
function rate(value: number, bands: [number, number, number, number]): number {
  if (value < bands[0]) return 1;
  if (value < bands[1]) return 2;
  if (value < bands[2]) return 3;
  if (value < bands[3]) return 4;
  return 5;
}

export function reservoirPofFactors(inputs: ReservoirInputs): FactorRating[] {
  const life = serviceLifeFor(inputs.material);
  const factors: FactorRating[] = [];

  if (inputs.ageYears != null) {
    const used = inputs.ageYears / life;
    factors.push({
      name: "Age against expected life",
      observed: `${Math.round(inputs.ageYears)} of ${life} years (${Math.round(used * 100)}%)`,
      rating: rate(used, [0.25, 0.5, 0.75, 1]),
      weight: RESERVOIR_POF_WEIGHTS.AGE,
    });
  }

  // AWWA's guidance is an interior inspection every five years; the bands step
  // up from there. Never inspected is the top rating, not a gap in the data:
  // the whole point of the figure is that nobody has looked.
  factors.push({
    name: "Since last inspection",
    observed: inputs.yearsSinceInspection == null ? "never inspected" : `${inputs.yearsSinceInspection} years`,
    rating: inputs.yearsSinceInspection == null ? 5 : rate(inputs.yearsSinceInspection, [3, 5, 10, 15]),
    weight: RESERVOIR_POF_WEIGHTS.INSPECTION,
  });

  // Steel corrodes and is coated; concrete cracks and is patched. The rating
  // is about how quickly a tank deteriorates when neglected, not about which
  // is better.
  const materialRating = inputs.material === "Steel" ? 4 : inputs.material == null ? 3 : 2;
  factors.push({
    name: "Material",
    observed: inputs.material ?? "unknown",
    rating: materialRating,
    weight: RESERVOIR_POF_WEIGHTS.MATERIAL,
  });

  return factors;
}

export function reservoirCofFactors(inputs: ReservoirInputs): FactorRating[] {
  return [
    {
      name: "Storage lost if out of service",
      observed: inputs.capacityMg != null ? `${inputs.capacityMg} MG` : "unknown",
      rating: inputs.capacityMg == null ? 3 : rate(inputs.capacityMg, [1, 3, 6, 10]),
      weight: RESERVOIR_COF_WEIGHTS.CAPACITY,
    },
  ];
}

export type ReservoirScore = {
  pof: number;
  cof: number;
  riskScore: number;
  condition: number | null;
  serviceLife: number;
  factors: FactorRating[];
};

export function scoreReservoir(inputs: ReservoirInputs): ReservoirScore {
  const pofFactors = reservoirPofFactors(inputs);
  const cofFactors = reservoirCofFactors(inputs);
  const pof = combineFactors(pofFactors);
  const cof = combineFactors(cofFactors);
  const serviceLife = serviceLifeFor(inputs.material);

  return {
    pof,
    cof,
    riskScore: Math.round(pof * cof * 10) / 10,
    condition: conditionFromAge(inputs.ageYears, serviceLife),
    serviceLife,
    factors: [...pofFactors, ...cofFactors],
  };
}
