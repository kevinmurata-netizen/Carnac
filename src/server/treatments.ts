import { prisma } from "@/lib/prisma";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import {
  WATERLINE_TREATMENTS,
  recommendTreatment,
  type AssetTreatmentContext,
  type Recommendation,
} from "@/domain/waterline/treatment";
import { ageInYears } from "@/lib/format";
import { loadTreatmentDefs } from "@/server/treatment-config";

/** Idempotently write the treatment library (plus a machine-readable rule row
 * per treatment) so admins can retune applicability without code changes. */
export async function ensureTreatments(organizationId: string) {
  const assetType = await prisma.assetType.findFirst({ where: { code: "WATERLINE", organizationId } });
  if (!assetType) throw new Error("WATERLINE asset type not found");

  for (const def of WATERLINE_TREATMENTS) {
    const existing = await prisma.treatment.findFirst({ where: { assetTypeId: assetType.id, name: def.name } });
    if (existing) continue;

    await prisma.treatment.create({
      data: {
        assetTypeId: assetType.id,
        name: def.name,
        description: def.description,
        applicableConditionMin: def.applicableConditionMin,
        applicableConditionMax: def.applicableConditionMax,
        applicability: {
          category: def.category,
          materials: def.applicableMaterials ?? null,
          diameterMin: def.applicableDiameterMin ?? null,
          diameterMax: def.applicableDiameterMax ?? null,
          constraints: def.implementationConstraints ?? null,
          // Record which kind of condition effect this is; effectOnCondition
          // below is a single number and cannot express the difference.
          conditionResetTo: def.conditionResetTo ?? null,
          conditionGain: def.conditionGain ?? null,
        },
        expectedLifeExtension: def.expectedLifeExtension,
        effectOnCondition: def.conditionResetTo ?? def.conditionGain ?? 0,
        effectOnFailureProb: def.failureProbMultiplier,
        unitCost: def.unitCost,
        costUnit: def.costUnit,
        mobilizationCost: def.mobilizationCost,
        annualMaintenanceCost: def.annualMaintenanceCost,
        usefulLife: def.usefulLife,
        rules: {
          create: [
            {
              ruleType: "condition-triggered",
              condition: {
                conditionMin: def.applicableConditionMin,
                conditionMax: def.applicableConditionMax,
                materials: def.applicableMaterials ?? "*",
                diameterMin: def.applicableDiameterMin ?? null,
                diameterMax: def.applicableDiameterMax ?? null,
              },
            },
          ],
        },
        costs: {
          create: [
            { costType: "Initial", amount: def.unitCost },
            { costType: "Maintenance", amount: def.annualMaintenanceCost },
          ],
        },
      },
    });
  }
}

export async function listTreatments(organizationId: string) {
  const treatments = await prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { rules: true, costs: true },
    orderBy: { applicableConditionMin: "asc" },
  });
  return treatments.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: String((t.applicability as { category?: string } | null)?.category ?? "—"),
    conditionRange: `${t.applicableConditionMin ?? 0}–${t.applicableConditionMax ?? 100}`,
    materials: ((t.applicability as { materials?: string[] | null } | null)?.materials ?? null)?.join(", ") ?? "All",
    unitCost: t.unitCost ?? 0,
    costUnit: t.costUnit ?? "",
    mobilizationCost: t.mobilizationCost ?? 0,
    expectedLifeExtension: t.expectedLifeExtension ?? 0,
    failureProbMultiplier: t.effectOnFailureProb ?? 1,
    constraints: (t.applicability as { constraints?: string | null } | null)?.constraints ?? null,
  }));
}

const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

/** Assemble the live inputs a recommendation needs: condition, risk,
 * attributes and failure history — all read fresh so a new inspection or
 * failure immediately changes what the system recommends. */
async function buildContexts(organizationId: string, assetId?: string) {
  const since = new Date(Date.now() - TEN_YEARS_MS);
  const assets = await prisma.asset.findMany({
    where: {
      organizationId,
      assetType: { code: "WATERLINE" },
      deletedAt: null,
      ...(assetId ? { id: assetId } : { status: "ACTIVE" }),
    },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1 },
      riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
      failureEvents: { where: { failureDate: { gte: since } }, select: { id: true } },
    },
  });

  return assets.map((asset) => {
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
    const risk = asset.riskAssessments[0];
    const ctx: AssetTreatmentContext = {
      conditionScore: asset.conditionMeasurements[0]?.score ?? null,
      material: attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null,
      diameterInches: attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null,
      lengthFt: attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null,
      customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null,
      pof: risk?.probabilityScore ?? null,
      cof: risk?.consequenceScore ?? null,
      riskScore: risk?.riskScore ?? null,
      failuresLast10Years: asset.failureEvents.length,
      ageYears: ageInYears(asset.installationDate),
      expectedUsefulLife: asset.expectedUsefulLife ?? 75,
      criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
    };
    return { asset: { id: asset.id, assetCode: asset.assetCode }, ctx };
  });
}

export async function getRecommendationForAsset(
  organizationId: string,
  assetId: string
): Promise<Recommendation | null> {
  const contexts = await buildContexts(organizationId, assetId);
  if (contexts.length === 0) return null;
  return recommendTreatment(contexts[0].ctx, await loadTreatmentDefs(organizationId));
}

export type NetworkRecommendationRow = {
  assetId: string;
  assetCode: string;
  conditionScore: number | null;
  riskScore: number | null;
  treatment: string;
  category: string;
  estimatedCost: number;
  riskReductionPct: number | null;
};

export type NetworkRecommendations = {
  rows: NetworkRecommendationRow[];
  totalEstimatedCost: number;
  byTreatment: Array<{ treatment: string; count: number; cost: number }>;
  noActionCount: number;
};

export async function getNetworkRecommendations(organizationId: string): Promise<NetworkRecommendations> {
  const contexts = await buildContexts(organizationId);
  const library = await loadTreatmentDefs(organizationId);
  const rows: NetworkRecommendationRow[] = [];
  let noActionCount = 0;

  for (const { asset, ctx } of contexts) {
    const rec = recommendTreatment(ctx, library);
    if (!rec.recommended) {
      noActionCount++;
      continue;
    }
    rows.push({
      assetId: asset.id,
      assetCode: asset.assetCode,
      conditionScore: ctx.conditionScore,
      riskScore: ctx.riskScore,
      treatment: rec.recommended.name,
      category: rec.recommended.category,
      estimatedCost: rec.recommended.estimatedCost,
      riskReductionPct: rec.recommended.riskReductionPct,
    });
  }

  const byTreatmentMap = new Map<string, { count: number; cost: number }>();
  let totalEstimatedCost = 0;
  for (const row of rows) {
    totalEstimatedCost += row.estimatedCost;
    const entry = byTreatmentMap.get(row.treatment) ?? { count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += row.estimatedCost;
    byTreatmentMap.set(row.treatment, entry);
  }

  return {
    rows: rows.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)),
    totalEstimatedCost,
    byTreatment: [...byTreatmentMap.entries()]
      .map(([treatment, v]) => ({ treatment, ...v }))
      .sort((a, b) => b.cost - a.cost),
    noActionCount,
  };
}
