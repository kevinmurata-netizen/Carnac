import { prisma } from "@/lib/prisma";
import { getMeasureCodes, readMeasures } from "@/server/measures";
import { listMaterials, listCriticalities, listServiceAreas, listPressureZones } from "@/server/assets";
import { ageInYears } from "@/lib/format";
import type { DecisionField, DecisionInput } from "@/domain/waterline/decision-tree";

/** A real segment to try a rule against. */
export type RuleSample = { id: string; label: string; input: DecisionInput };

/**
 * Real segments to test a rule against, spread across the condition range so a
 * rule can be checked at both ends rather than only against whichever asset
 * happened to be worst.
 *
 * Shared by the Treatment Rules page and the rule pop-up on a treatment, so a
 * rule is tried against the same segments wherever it is written.
 */
export async function loadRuleSamples(organizationId: string): Promise<RuleSample[]> {
  const measurements = await prisma.conditionMeasurement.findMany({
    where: { assetComponentId: null, asset: { organizationId, deletedAt: null, status: "ACTIVE" } },
    orderBy: { score: "asc" },
    distinct: ["assetId"],
    include: {
      asset: {
        include: {
          attributeValues: { include: { definition: true } },
          riskAssessments: { where: { assetComponentId: null }, orderBy: { assessmentDate: "desc" }, take: 1 },
          failureEvents: { select: { id: true } },
          location: { select: { serviceArea: true, pressureZone: true } },
        },
      },
    },
  });
  if (measurements.length === 0) return [];

  // Worst, best and three between — enough to see where a threshold bites.
  const picks = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => Math.min(measurements.length - 1, Math.round(f * (measurements.length - 1))))
    .filter((v, i, all) => all.indexOf(v) === i);

  const measuresOf = await getMeasureCodes(organizationId);
  return picks.map((index) => {
    const measurement = measurements[index];
    const asset = measurement.asset;
    const m = readMeasures(asset.attributeValues, measuresOf(asset.assetTypeId));
    const risk = asset.riskAssessments[0];
    const age = ageInYears(asset.installationDate);
    const life = asset.expectedUsefulLife ?? 75;

    const input: DecisionInput = {
      condition: Math.round(measurement.score * 10) / 10,
      ageYears: age,
      ageRatio: age != null ? Math.round((age / life) * 100) / 100 : null,
      diameterInches: m.diameter,
      lengthFt: m.length,
      customersServed: m.customersServed,
      riskScore: risk?.riskScore ?? null,
      pof: risk?.probabilityScore ?? null,
      cof: risk?.consequenceScore ?? null,
      failuresLast10Years: asset.failureEvents.length,
      material: m.material,
      criticality: m.criticality,
      serviceArea: asset.location?.serviceArea ?? null,
      pressureZone: asset.location?.pressureZone ?? null,
    };

    return {
      id: asset.id,
      label: `${asset.assetCode} — WCI ${input.condition}, ${input.material ?? "unknown material"}, ${
        input.customersServed ?? 0
      } customers${input.serviceArea ? `, ${input.serviceArea}` : ""}`,
      input,
    };
  });
}

/**
 * Known values for the text fields. Text fields offer what the inventory
 * actually holds, so a rule cannot be written against a material or district
 * no segment has.
 */
export async function loadRuleFieldOptions(
  organizationId: string
): Promise<Partial<Record<DecisionField, string[]>>> {
  const [material, criticality, serviceArea, pressureZone] = await Promise.all([
    listMaterials(organizationId),
    listCriticalities(organizationId),
    listServiceAreas(organizationId),
    listPressureZones(organizationId),
  ]);
  return { material, criticality, serviceArea, pressureZone };
}
