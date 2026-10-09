import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveFormula, loadAssetValues } from "@/server/criticality";
import { evaluate, fieldsUsed, toCriticalityScore } from "@/domain/waterline/criticality-formula";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { getConditionBand } from "@/domain/waterline/condition";
import {
  RISK_MODEL_NAME,
  POF_WEIGHTS,
  COF_WEIGHTS,
  computePofFactors,
  computeCofFactors,
  combineFactors,
  computeCriticalityScore,
  getRiskBand,
  type FactorRating,
} from "@/domain/waterline/risk";
import { ageInYears } from "@/lib/format";
import { getRiskWeights, getConditionBands, getConditionBandsByModel } from "@/server/settings";
import { listModelledAssetTypes, modelledType } from "@/server/modelled-asset-type";
import { isComponentScoped } from "@/domain/components/scope";

/** A whole-asset risk model, not one that only holds component scores. */
function isWholeAsset(model: { probabilityConfig: unknown }): boolean {
  return !isComponentScoped(model.probabilityConfig);
}

/**
 * Every modelled asset type's active risk model. Risk is read across all of
 * them at once; each asset's assessments are filed under its own type's.
 */
async function getRiskModelIds(organizationId: string): Promise<string[]> {
  const models = await prisma.riskModel.findMany({
    where: { assetType: modelledType(organizationId), isActive: true },
    select: { id: true, probabilityConfig: true },
  });
  const ids = models.filter(isWholeAsset).map((m) => m.id);
  if (ids.length === 0) throw new Error("No risk model is configured for this organization");
  return ids;
}

/** One asset type's active risk model, created with the built-in weights
 * the first time the type is scored. */
export async function ensureRiskModel(assetTypeId: string) {
  const models = await prisma.riskModel.findMany({ where: { assetTypeId, isActive: true }, orderBy: { id: "asc" } });
  const existing = models.find(isWholeAsset);
  if (existing) return existing;
  return prisma.riskModel.create({
    data: {
      assetTypeId,
      name: RISK_MODEL_NAME,
      probabilityConfig: { weights: POF_WEIGHTS, scale: "1-5" },
      consequenceConfig: { weights: COF_WEIGHTS, scale: "1-5" },
    },
  });
}

/** Recompute POF/COF/risk + criticality for every modelled asset in the org
 * from current data (latest condition, failures, attributes). Each run appends
 * new RiskAssessment/CriticalityScore rows, preserving assessment history. */
export async function recomputeRiskForOrganization(organizationId: string): Promise<number> {
  // Each modelled asset type is scored by its own model, weights and
  // criticality formula.
  let count = 0;
  for (const type of await listModelledAssetTypes(organizationId)) {
    count += await recomputeRiskForAssetType(organizationId, type.id);
  }
  return count;
}

async function recomputeRiskForAssetType(organizationId: string, assetTypeId: string): Promise<number> {
  const model = await ensureRiskModel(assetTypeId);
  // Scoring runs with the weights configured in Settings, not the seeded
  // constants, so a reweight changes the next recompute.
  const { pof: pofWeights, cof: cofWeights } = await getRiskWeights(organizationId, assetTypeId);
  const tenYearsAgo = new Date(Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000);

  const assets = await prisma.asset.findMany({
    where: { organizationId, assetTypeId, deletedAt: null },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { where: { assetComponentId: null }, orderBy: { measurementDate: "desc" }, take: 1 },
      failureEvents: { where: { failureDate: { gte: tenYearsAgo } }, select: { id: true } },
    },
  });

  // A configured criticality formula defines criticality for its asset type.
  // Without one, criticality stays what it has always been here — a rescale of
  // the consequence-of-failure rating — so this changes nothing until used.
  const formula = assets.length > 0 ? await getActiveFormula(assetTypeId) : null;
  const formulaValues = formula
    ? new Map((await loadAssetValues(organizationId, assetTypeId, formula.valueMaps)).map((a) => [a.assetId, a]))
    : null;

  const now = new Date();
  const assessmentWrites: Prisma.PrismaPromise<unknown>[] = [];
  const criticalityRows: Prisma.CriticalityScoreCreateManyInput[] = [];

  for (const asset of assets) {
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);

    const pofFactors = computePofFactors({
      conditionScore: asset.conditionMeasurements[0]?.score ?? null,
      ageYears: ageInYears(asset.installationDate),
      expectedUsefulLife: asset.expectedUsefulLife ?? 75,
      failuresLast10Years: asset.failureEvents.length,
      material: attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null,
    }, pofWeights);
    const cofInputs = {
      customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null,
      criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
      diameterInches: attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null,
      customerType: attr(WATERLINE_ATTRIBUTES.CUSTOMER_TYPE)?.textValue ?? null,
    };
    const cofFactors = computeCofFactors(cofInputs, cofWeights);

    const pof = combineFactors(pofFactors);
    const cof = combineFactors(cofFactors);
    const riskScore = Math.round(pof * cof * 10) / 10;

    const factorRows = [
      ...pofFactors.map((f) => ({ factorName: `POF: ${f.name} (${f.observed})`, factorValue: f.rating, weight: f.weight })),
      ...cofFactors.map((f) => ({ factorName: `COF: ${f.name} (${f.observed})`, factorValue: f.rating, weight: f.weight })),
    ];

    const derived = computeCriticalityScore(cofInputs, cofWeights);
    const viaFormula = formula && formulaValues ? formulaValues.get(asset.id) : null;

    // Recorded either way so a stored score can always be explained by what
    // produced it, rather than leaving two possible derivations and no way to
    // tell which one a number came from.
    const criticality = viaFormula
      ? (() => {
          const result = evaluate(formula!.tree, viaFormula.values);
          return {
            score: toCriticalityScore(result.ok ? result.value : 0),
            factors: {
              formula: formula!.name,
              inputs: Object.fromEntries(
                fieldsUsed(formula!.tree).map((f) => [f, viaFormula.values[f] ?? null])
              ),
            } as Prisma.InputJsonObject,
          };
        })()
      : {
          score: derived.score,
          factors: Object.fromEntries(
            derived.factors.map((f) => [f.name, { observed: f.observed, rating: f.rating, weight: f.weight }])
          ) as Prisma.InputJsonObject,
        };

    assessmentWrites.push(
      prisma.riskAssessment.create({
        data: {
          assetId: asset.id,
          riskModelId: model.id,
          probabilityScore: pof,
          consequenceScore: cof,
          riskScore,
          assessmentDate: now,
          factors: { create: factorRows },
        },
      })
    );
    criticalityRows.push({
      assetId: asset.id,
      score: criticality.score,
      factors: criticality.factors,
      calculatedAt: now,
    });
  }

  // Batched rather than awaited one at a time. The work is the same either way
  // locally, but every await is a network round trip to a hosted database —
  // 520 of them is the difference between a second and a request that runs out
  // of time before it finishes.
  await prisma.criticalityScore.createMany({ data: criticalityRows });

  // Assessments carry nested factor rows, so they cannot use createMany.
  // Chunked instead: one transaction per chunk keeps the number of round trips
  // small without building a single statement large enough to be a problem on
  // a much bigger asset type.
  const CHUNK = 50;
  for (let i = 0; i < assessmentWrites.length; i += CHUNK) {
    await prisma.$transaction(assessmentWrites.slice(i, i + CHUNK));
  }

  return assets.length;
}

/** Grades a condition score by the bands of the index it was filed under —
 * its asset type's — falling back to the main network's. */
async function conditionBandsFor(organizationId: string) {
  const [byModel, fallback] = await Promise.all([
    getConditionBandsByModel(organizationId),
    getConditionBands(organizationId),
  ]);
  return (m: { score: number; conditionModelId: string }) =>
    getConditionBand(m.score, byModel.get(m.conditionModelId) ?? fallback);
}

export type AssetRisk = {
  assetId: string;
  pof: number;
  cof: number;
  riskScore: number;
  band: ReturnType<typeof getRiskBand>;
  assessmentDate: Date;
};

export async function getLatestRiskByAsset(organizationId: string): Promise<Map<string, AssetRisk>> {
  const modelIds = await getRiskModelIds(organizationId);
  const rows = await prisma.riskAssessment.findMany({
    where: { riskModelId: { in: modelIds }, assetComponentId: null, asset: { organizationId, deletedAt: null } },
    orderBy: [{ assetId: "asc" }, { assessmentDate: "desc" }],
    distinct: ["assetId"],
    select: { assetId: true, probabilityScore: true, consequenceScore: true, riskScore: true, assessmentDate: true },
  });
  return new Map(
    rows.map((r) => [
      r.assetId,
      {
        assetId: r.assetId,
        pof: r.probabilityScore,
        cof: r.consequenceScore,
        riskScore: r.riskScore,
        band: getRiskBand(r.riskScore),
        assessmentDate: r.assessmentDate,
      },
    ])
  );
}

export async function getRiskForAsset(organizationId: string, assetId: string) {
  const modelIds = await getRiskModelIds(organizationId);
  const assessment = await prisma.riskAssessment.findFirst({
    where: { riskModelId: { in: modelIds }, assetId, assetComponentId: null, asset: { organizationId } },
    orderBy: { assessmentDate: "desc" },
    include: { factors: true },
  });
  if (!assessment) return null;

  const criticality = await prisma.criticalityScore.findFirst({
    where: { assetId },
    orderBy: { calculatedAt: "desc" },
  });

  // Non-greedy name group: observed values may themselves contain parentheses
  // ("69 yr (86% of expected life)"), so split at the FIRST " (" not the last.
  const parseFactors = (prefix: string): FactorRating[] =>
    assessment.factors
      .filter((f) => f.factorName.startsWith(prefix))
      .map((f) => {
        const m = f.factorName.match(/^[A-Z]+: (.+?) \((.+)\)$/);
        return { name: m?.[1] ?? f.factorName, observed: m?.[2] ?? "", rating: f.factorValue, weight: f.weight };
      });

  return {
    pof: assessment.probabilityScore,
    cof: assessment.consequenceScore,
    riskScore: assessment.riskScore,
    band: getRiskBand(assessment.riskScore),
    assessmentDate: assessment.assessmentDate,
    pofFactors: parseFactors("POF:"),
    cofFactors: parseFactors("COF:"),
    criticalityScore: criticality?.score ?? null,
  };
}

export type RiskSummary = {
  assessedAssets: number;
  averageRisk: number | null;
  byBand: Array<{ label: string; count: number; color: string }>;
  /** matrix[pofRounded-1][cofRounded-1] = asset count */
  matrix: number[][];
};

/**
 * Bucket a POF/COF pair into 0-indexed matrix coordinates.
 *
 * Exported so the cell counts and the per-cell asset lists are produced by the
 * same rule — if they were computed separately, a cell could show a count that
 * its own list disagrees with.
 */
export function riskMatrixCell(pof: number, cof: number): [number, number] {
  return [
    Math.min(4, Math.max(0, Math.round(pof) - 1)),
    Math.min(4, Math.max(0, Math.round(cof) - 1)),
  ];
}

export async function getRiskSummary(organizationId: string): Promise<RiskSummary> {
  const latest = await getLatestRiskByAsset(organizationId);

  const byBandMap = new Map<string, { count: number; color: string }>();
  const matrix: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
  let sum = 0;
  for (const risk of latest.values()) {
    sum += risk.riskScore;
    const entry = byBandMap.get(risk.band.label) ?? { count: 0, color: risk.band.color };
    entry.count += 1;
    byBandMap.set(risk.band.label, entry);
    const [p, c] = riskMatrixCell(risk.pof, risk.cof);
    matrix[p][c] += 1;
  }

  return {
    assessedAssets: latest.size,
    averageRisk: latest.size ? Math.round((sum / latest.size) * 10) / 10 : null,
    byBand: [...byBandMap.entries()].map(([label, v]) => ({ label, ...v })),
    matrix,
  };
}

export async function getTopRiskAssets(organizationId: string, limit = 10) {
  const [modelIds, bandsOf] = await Promise.all([getRiskModelIds(organizationId), conditionBandsFor(organizationId)]);
  const rows = await prisma.riskAssessment.findMany({
    where: { riskModelId: { in: modelIds }, assetComponentId: null, asset: { organizationId, deletedAt: null } },
    orderBy: [{ assetId: "asc" }, { assessmentDate: "desc" }],
    distinct: ["assetId"],
    include: {
      asset: {
        select: {
          id: true,
          assetCode: true,
          conditionMeasurements: {
            where: { assetComponentId: null },
            orderBy: { measurementDate: "desc" },
            take: 1,
            select: { score: true, conditionModelId: true },
          },
        },
      },
    },
  });

  return rows
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit)
    .map((r) => ({
      asset: { id: r.asset.id, assetCode: r.asset.assetCode },
      conditionScore: r.asset.conditionMeasurements[0]?.score ?? null,
      conditionBand: r.asset.conditionMeasurements[0] ? bandsOf(r.asset.conditionMeasurements[0]) : null,
      pof: r.probabilityScore,
      cof: r.consequenceScore,
      riskScore: r.riskScore,
      band: getRiskBand(r.riskScore),
    }));
}

export type RiskMatrixAsset = {
  assetId: string;
  assetCode: string;
  serviceArea: string | null;
  conditionScore: number | null;
  conditionBand: { label: string; color: string } | null;
  pof: number;
  cof: number;
  riskScore: number;
  band: { label: string; color: string };
  /** 0-indexed matrix coordinates, assigned by riskMatrixCell. */
  cellP: number;
  cellC: number;
};

/**
 * Every assessed asset with the matrix cell it falls in, so clicking a cell can
 * list exactly the assets counted there. Each row carries its own cell rather
 * than the client re-deriving it, which keeps the bucketing rule in one place.
 */
export async function getRiskMatrixAssets(organizationId: string): Promise<RiskMatrixAsset[]> {
  const [latest, bandsOf] = await Promise.all([getLatestRiskByAsset(organizationId), conditionBandsFor(organizationId)]);

  const assets = await prisma.asset.findMany({
    where: { id: { in: [...latest.keys()] }, deletedAt: null },
    select: {
      id: true,
      assetCode: true,
      location: { select: { serviceArea: true } },
      conditionMeasurements: {
        where: { assetComponentId: null },
        orderBy: { measurementDate: "desc" },
        take: 1,
        select: { score: true, conditionModelId: true },
      },
    },
  });

  return assets
    .map((a) => {
      const risk = latest.get(a.id)!;
      const [cellP, cellC] = riskMatrixCell(risk.pof, risk.cof);
      const latestCondition = a.conditionMeasurements[0];
      const score = latestCondition?.score ?? null;
      return {
        assetId: a.id,
        assetCode: a.assetCode,
        serviceArea: a.location?.serviceArea ?? null,
        conditionScore: score != null ? Math.round(score * 10) / 10 : null,
        conditionBand: latestCondition ? bandsOf(latestCondition) : null,
        pof: risk.pof,
        cof: risk.cof,
        riskScore: risk.riskScore,
        band: risk.band,
        cellP,
        cellC,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}
