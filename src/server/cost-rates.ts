import { prisma } from "@/lib/prisma";
import { describeNode } from "@/domain/waterline/decision-tree";
import { parseRules } from "@/server/rules";

/**
 * Cost rates are the prices a treatment can carry, and the rule saying when
 * each price applies. The whole set for one treatment is saved together, so
 * what the page shows and what the model charges never drift apart — and the
 * ordering, which decides which rate wins, is never half-written.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §4 Phase 2.
 */

export type CostRateRow = {
  id: string;
  name: string;
  sortOrder: number;
  ruleId: string | null;
  ruleName: string | null;
  /** How the rule reads, so the table explains itself without a second click. */
  ruleSummary: string | null;
  unitCost: number;
  costUnit: "per LF" | "per each";
  mobilizationCost: number;
  annualMaintenanceCost: number;
};

export type TreatmentCosts = {
  treatmentId: string;
  treatmentName: string;
  rates: CostRateRow[];
};

export async function getTreatmentCosts(
  organizationId: string,
  treatmentId: string
): Promise<TreatmentCosts | null> {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    include: { costRates: { include: { rule: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!treatment) return null;

  return {
    treatmentId: treatment.id,
    treatmentName: treatment.name,
    rates: treatment.costRates.map((r) => {
      const rule = r.rule ? (parseRules([r.rule])[0] ?? null) : null;
      return {
        id: r.id,
        name: r.name,
        sortOrder: r.sortOrder,
        ruleId: r.ruleId,
        ruleName: r.rule?.name ?? null,
        ruleSummary: rule ? describeNode(rule.root) : null,
        unitCost: r.unitCost,
        costUnit: r.costUnit === "per LF" ? "per LF" : "per each",
        mobilizationCost: r.mobilizationCost,
        annualMaintenanceCost: r.annualMaintenanceCost,
      };
    }),
  };
}

/** Every rate across the library, for the roll-up on the Treatments page —
 * which is what makes an annual rate review tolerable. */
export async function listAllCostRates(organizationId: string) {
  const rows = await prisma.treatmentCostRate.findMany({
    where: { treatment: { assetType: { code: "WATERLINE", organizationId } } },
    include: { treatment: { select: { id: true, name: true } }, rule: { select: { name: true } } },
    orderBy: [{ treatment: { name: "asc" } }, { sortOrder: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    treatmentId: r.treatment.id,
    treatmentName: r.treatment.name,
    name: r.name,
    ruleName: r.rule?.name ?? null,
    unitCost: r.unitCost,
    costUnit: r.costUnit,
    mobilizationCost: r.mobilizationCost,
    annualMaintenanceCost: r.annualMaintenanceCost,
  }));
}

export type CostRateInput = {
  name: string;
  ruleId: string | null;
  unitCost: number;
  costUnit: "per LF" | "per each";
  mobilizationCost: number;
  annualMaintenanceCost: number;
};

/**
 * Exported so a treatment being created can have its prices checked *before*
 * the treatment row exists. Creating first and validating second would leave a
 * half-built treatment behind whenever the prices turn out to be wrong.
 */
export function validateCostRates(rates: CostRateInput[]) {
  if (rates.length === 0) {
    throw new Error(
      "A treatment needs at least one cost rate. Without one it cannot be priced, so it would never be recommended."
    );
  }

  const names = new Set<string>();
  for (const rate of rates) {
    const name = rate.name.trim();
    if (!name) throw new Error("Give every rate a name");
    const key = name.toLowerCase();
    if (names.has(key)) throw new Error(`Two rates are both named "${name}"`);
    names.add(key);
    if (!Number.isFinite(rate.unitCost) || rate.unitCost < 0) throw new Error(`"${name}" has a negative or missing unit cost`);
    if (!Number.isFinite(rate.mobilizationCost) || rate.mobilizationCost < 0) throw new Error(`"${name}" has a negative mobilization cost`);
    if (!Number.isFinite(rate.annualMaintenanceCost) || rate.annualMaintenanceCost < 0) {
      throw new Error(`"${name}" has a negative annual maintenance cost`);
    }
  }

  // Exactly one catch-all, and it has to be last. More than one and the second
  // is unreachable; none at all and any asset the rules miss silently loses
  // the treatment; anywhere but last and every rate below it is dead.
  const fallbacks = rates.filter((r) => !r.ruleId);
  if (fallbacks.length === 0) {
    throw new Error(
      "One rate must have no rule — the fallback that prices anything the rates above it do not claim. Without it, an asset none of the rules match cannot be priced and the treatment is simply not offered for it."
    );
  }
  if (fallbacks.length > 1) {
    throw new Error(
      `Only one rate can be the fallback, and ${fallbacks.map((f) => `"${f.name.trim()}"`).join(" and ")} both have no rule. The first would win and the rest would never be used.`
    );
  }
  if (rates[rates.length - 1].ruleId !== null) {
    throw new Error(
      `"${fallbacks[0].name.trim()}" has no rule, so it matches everything and must be last. Rates below it would never be reached.`
    );
  }
}

/**
 * Replace a treatment's whole set of rates, in order, in one transaction.
 *
 * Rewritten wholesale rather than diffed: the position of a rate is what
 * decides whether it is ever reached, so a partial write could leave a
 * treatment priced by a rate the editor never showed.
 */
export async function setTreatmentCosts(
  organizationId: string,
  treatmentId: string,
  rates: CostRateInput[]
) {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    select: { id: true },
  });
  if (!treatment) throw new Error("That treatment no longer exists");

  validateCostRates(rates);

  // Checked against this organization's rules rather than trusted, so a
  // crafted request cannot price against another tenant's rule.
  const ruleIds = [...new Set(rates.map((r) => r.ruleId).filter((id): id is string => !!id))];
  if (ruleIds.length > 0) {
    const found = await prisma.rule.findMany({
      where: { id: { in: ruleIds }, organizationId },
      select: { id: true },
    });
    if (found.length !== ruleIds.length) throw new Error("One of those rules no longer exists");
  }

  await prisma.$transaction([
    prisma.treatmentCostRate.deleteMany({ where: { treatmentId } }),
    prisma.treatmentCostRate.createMany({
      data: rates.map((rate, index) => ({
        treatmentId,
        name: rate.name.trim(),
        sortOrder: index,
        ruleId: rate.ruleId,
        unitCost: rate.unitCost,
        costUnit: rate.costUnit,
        mobilizationCost: rate.mobilizationCost,
        annualMaintenanceCost: rate.annualMaintenanceCost,
      })),
    }),
  ]);
}

/** The single fallback rate a newly created treatment starts with, so it is
 * priceable from the moment it exists. */
export async function createStandardRate(
  treatmentId: string,
  cost: { unitCost: number; costUnit: string; mobilizationCost: number; annualMaintenanceCost: number }
) {
  await prisma.treatmentCostRate.create({
    data: {
      treatmentId,
      name: "Standard",
      sortOrder: 0,
      ruleId: null,
      unitCost: cost.unitCost,
      costUnit: cost.costUnit,
      mobilizationCost: cost.mobilizationCost,
      annualMaintenanceCost: cost.annualMaintenanceCost,
    },
  });
}
