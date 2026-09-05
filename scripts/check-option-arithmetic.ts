/**
 * The combining arithmetic has no data driving it until Phase 4, so this
 * exercises it directly: once for a single member (where every rule must
 * reduce to the identity) and once for a bundle (where each rule in
 * docs/TREATMENT-MODEL-REBUILD.md §5.1 must hold).
 */
import {
  WATERLINE_TREATMENTS,
  buildOption,
  priceWithRate,
  type AssetTreatmentContext,
  type CostRate,
} from "../src/domain/waterline/treatment";

const rate = (name: string, unitCost: number, mob: number, maint: number): CostRate => ({
  id: `r-${name}`,
  name,
  sortOrder: 0,
  rule: null,
  unitCost,
  costUnit: "per LF",
  mobilizationCost: mob,
  annualMaintenanceCost: maint,
});

const withRate = (name: string, r: CostRate) => {
  const def = WATERLINE_TREATMENTS.find((t) => t.name === name)!;
  return { ...def, costRates: [r], qualifyMode: "all" as const };
};

const relining = withRate("Relining", rate("Standard", 185, 30000, 700));
const cathodic = withRate("Cathodic Protection", rate("Standard", 35, 8000, 400));

// 1,000 ft of 8" pipe, so the diameter factor is exactly 1 and the arithmetic
// is checkable by hand.
const ctx: AssetTreatmentContext = {
  conditionScore: 30,
  material: "Cast Iron",
  diameterInches: 8,
  lengthFt: 1000,
  customersServed: 100,
  pof: 4,
  cof: 3,
  riskScore: 12,
  failuresLast10Years: 1,
  ageYears: 60,
  expectedUsefulLife: 75,
  criticality: "High",
  serviceArea: "Downtown",
  pressureZone: "Zone A",
};

const results: Array<[string, boolean, string]> = [];
const check = (label: string, actual: unknown, expected: unknown) =>
  results.push([label, JSON.stringify(actual) === JSON.stringify(expected), `got ${actual}, expected ${expected}`]);

// --- one member: every rule must be the identity ---------------------------
const single = buildOption("t:Relining", "Relining", [relining], ctx)!;
check("single cost equals priceWithRate", single.cost, priceWithRate(relining.costRates![0], ctx));
check("single cost is 185*1000 + 30000", single.cost, 215000);
check("single condition is the reset", single.projectedCondition, 85);
check("single failure multiplier untouched", single.failureProbMultiplier, 0.2);
check("single life extension untouched", single.expectedLifeExtension, 50);
check("single maintenance untouched", single.annualMaintenanceCost, 700);
check("single category untouched", single.category, "Rehabilitate");

// --- two members: §5.1 -----------------------------------------------------
const combo = buildOption("combo:x", "Trenchless package", [relining, cathodic], ctx)!;
check("unit costs sum, mobilization taken once at its largest", combo.cost, 185 * 1000 + 35 * 1000 + 30000);
check("mobilization is NOT summed", combo.cost !== 185 * 1000 + 35 * 1000 + 38000, true);
check("condition: max reset then gains on top", combo.projectedCondition, 95);
check("failure multipliers compound", Math.round(combo.failureProbMultiplier * 1000) / 1000, 0.13);
check("life extension is max, not sum", combo.expectedLifeExtension, 50);
check("maintenance sums", combo.annualMaintenanceCost, 1100);
check("useful life is max", combo.usefulLife, 50);
check("two cost reasons, one per member", combo.costReasons.length, 2);

// Condition cap.
const nearFull = buildOption("combo:y", "y", [relining, cathodic], { ...ctx, conditionScore: 99 })!;
check("condition capped at 100", nearFull.projectedCondition <= 100, true);

for (const [label, ok, detail] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`);
if (results.some(([, ok]) => !ok)) process.exitCode = 1;
