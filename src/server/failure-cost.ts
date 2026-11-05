import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMeasureCodes, readMeasures } from "@/server/measures";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { parseSizeCostScale, priceWithRate, sizeCostFactor, type TreatmentDef } from "@/domain/waterline/treatment";

/**
 * A starting figure for what one failure of an asset type costs, for a type
 * that has none — the utility's to accept or change under Settings › Asset
 * Types, never applied on its own.
 *
 * The repair is what the type's cheapest Repair treatment costs on a typical
 * asset of the type (the median size and length of its assets), or else its
 * replacement: a failure is mended the way the library says the type is
 * mended. It is given at the type's reference size, since a failure's repair
 * grows with size by the same scale as its prices. The interruption is a
 * typical value per customer, offered only where the type records the
 * customers an asset serves.
 */

/** A typical value of a service interruption, per customer affected. */
const TYPICAL_PER_CUSTOMER = 145;

export type FailureCostSuggestion = {
  repairCost: number;
  perCustomer: number;
  /** Where the figures came from, said plainly. */
  basis: string;
};

const median = (values: number[]): number | null => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** The rate a treatment falls back on — the one no rule narrows. */
const fallbackRate = (def: TreatmentDef) =>
  [...(def.costRates ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).find((r) => !r.rule) ?? def.costRates?.[0] ?? null;

export async function suggestFailureCost(
  organizationId: string,
  assetTypeId: string
): Promise<FailureCostSuggestion | null> {
  const type = await prisma.assetType.findFirst({
    where: { id: assetTypeId, organizationId },
    select: { id: true, name: true, sizeCostScale: true },
  });
  if (!type) return null;

  const [measuresOf, defs, assets] = await Promise.all([
    getMeasureCodes(organizationId),
    loadTreatmentDefs(organizationId),
    prisma.asset.findMany({
      where: { assetTypeId: type.id, deletedAt: null },
      select: { attributeValues: { include: { definition: { select: { code: true } } } } },
      take: 2000,
    }),
  ]);
  const codes = measuresOf(type.id);
  const measures = assets.map((a) => readMeasures(a.attributeValues, codes));
  const size = median(measures.map((m) => m.diameter ?? NaN));
  const length = median(measures.map((m) => m.length ?? NaN));
  const scale = parseSizeCostScale(type.sizeCostScale);

  const typical = { diameterInches: size, lengthFt: length, sizeCostScale: scale };
  const priced = defs
    .filter((d) => d.assetTypeId === type.id)
    .map((def) => {
      const rate = fallbackRate(def);
      return rate ? { def, price: priceWithRate(rate, typical) } : null;
    })
    .filter((p): p is { def: TreatmentDef; price: number } => !!p && p.price > 0);
  const repair =
    priced.filter((p) => p.def.category === "Repair").sort((a, b) => a.price - b.price)[0] ??
    priced.find((p) => p.def.role === "replacement");

  const perCustomer = codes.customersServed ? TYPICAL_PER_CUSTOMER : 0;
  if (!repair && !perCustomer) return null;

  // At the reference size: the failure's own size scaling adds the rest back.
  const atReference = repair ? repair.price / sizeCostFactor(size, scale) : 0;
  const repairCost = Math.round(atReference / 100) * 100;
  const typicalAsset = [size != null && codes.diameter ? `size ${size}` : null, length != null && codes.length ? `length ${Math.round(length)}` : null]
    .filter(Boolean)
    .join(", ");
  const basis = [
    repair
      ? `Repair: ${repair.def.name} on a typical ${type.name.toLowerCase()}${typicalAsset ? ` (${typicalAsset})` : ""}.`
      : "No Repair or replacement treatment is priced for it yet, so no repair figure.",
    perCustomer ? `Interruption: a typical $${TYPICAL_PER_CUSTOMER} per customer affected.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { repairCost, perCustomer, basis };
}

/** Suggestions for every type without a failure cost, by type id. */
export async function suggestMissingFailureCosts(
  organizationId: string
): Promise<Record<string, FailureCostSuggestion>> {
  const missing = await prisma.assetType.findMany({
    where: { organizationId, isModelled: true, failureCost: { equals: Prisma.DbNull } },
    select: { id: true },
  });
  const out: Record<string, FailureCostSuggestion> = {};
  for (const t of missing) {
    const s = await suggestFailureCost(organizationId, t.id);
    if (s) out[t.id] = s;
  }
  return out;
}
