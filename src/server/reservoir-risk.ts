import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ageInYears } from "@/lib/format";
import {
  RESERVOIR_COF_WEIGHTS,
  RESERVOIR_POF_WEIGHTS,
  SERVICE_LIFE_YEARS,
  scoreReservoir,
} from "@/domain/facility/reservoir";

/**
 * Scoring reservoirs, the way the waterline risk module scores pipes.
 *
 * Deliberately a second module rather than a generalisation of the first. The
 * shape is the same — a risk model per asset type, factors with weights, a
 * RiskAssessment row per asset per run — but the inputs are a tank's, not a
 * main's, and pretending one function could take both would mean a signature
 * full of nulls.
 *
 * What it writes is what the schema already has for exactly this: a
 * `RiskAssessment` with its `RiskFactor` rows, so a score can be read back as
 * the things that produced it. Condition is written as a
 * `DeteriorationPrediction` rather than a `ConditionMeasurement`, because no
 * tank here has been assessed: the figure is modelled from age, and a measured
 * condition is a different claim.
 */

const MODEL_NAME = "Reservoir age, inspection interval and storage";

/**
 * The two models a reservoir is scored through, created once and then left
 * alone — they are configuration, and an organization that retunes them should
 * keep its own version rather than have a seed overwrite it.
 */
export async function ensureReservoirModels(organizationId: string) {
  const assetType = await prisma.assetType.findFirst({ where: { code: "RESERVOIR", organizationId } });
  if (!assetType) throw new Error("RESERVOIR asset type not found — run the JVWCD seed first");

  const riskModel =
    (await prisma.riskModel.findFirst({ where: { assetTypeId: assetType.id, isActive: true } })) ??
    (await prisma.riskModel.create({
      data: {
        assetTypeId: assetType.id,
        name: MODEL_NAME,
        probabilityConfig: { weights: RESERVOIR_POF_WEIGHTS, scale: "1-5" },
        consequenceConfig: { weights: RESERVOIR_COF_WEIGHTS, scale: "1-5" },
      },
    }));

  const deteriorationModel =
    (await prisma.deteriorationModel.findFirst({ where: { assetTypeId: assetType.id, isActive: true } })) ??
    (await prisma.deteriorationModel.create({
      data: {
        assetTypeId: assetType.id,
        name: "Reservoir condition from age and material",
        modelType: "POLYNOMIAL",
        applicability: { assetType: "RESERVOIR" },
        parameters: {
          create: [
            { key: "serviceLifeYears", value: SERVICE_LIFE_YEARS },
            { key: "shape", value: { form: "100 - 70 * (age / life) ^ 1.4", floor: 0, ceiling: 100 } },
          ],
        },
      },
    }));

  return { riskModel, deteriorationModel };
}

export type ReservoirScoreRow = {
  assetCode: string;
  name: string | null;
  ageYears: number | null;
  material: string | null;
  yearsSinceInspection: number | null;
  capacityMg: number | null;
  condition: number | null;
  pof: number;
  cof: number;
  riskScore: number;
};

/**
 * Score every reservoir from what the District published, appending a new
 * assessment rather than overwriting the last — the same history rule the
 * waterline module follows.
 */
export async function recomputeReservoirRisk(organizationId: string): Promise<ReservoirScoreRow[]> {
  const { riskModel, deteriorationModel } = await ensureReservoirModels(organizationId);
  const thisYear = new Date().getUTCFullYear();

  const reservoirs = await prisma.asset.findMany({
    where: { organizationId, assetType: { code: "RESERVOIR" }, deletedAt: null },
    include: { attributeValues: { include: { definition: true } } },
    orderBy: { assetCode: "asc" },
  });

  const now = new Date();
  const rows: ReservoirScoreRow[] = [];

  for (const asset of reservoirs) {
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
    const inspectedAt = attr("LAST_INSPECTED")?.dateValue ?? null;
    const inputs = {
      ageYears: ageInYears(asset.installationDate),
      material: attr("MATERIAL")?.textValue ?? null,
      yearsSinceInspection: inspectedAt ? thisYear - inspectedAt.getUTCFullYear() : null,
      capacityMg: attr("CAPACITY_MG")?.numberValue ?? null,
    };

    const score = scoreReservoir(inputs);

    await prisma.riskAssessment.create({
      data: {
        assetId: asset.id,
        riskModelId: riskModel.id,
        assessmentDate: now,
        probabilityScore: score.pof,
        consequenceScore: score.cof,
        riskScore: score.riskScore,
        factors: {
          create: score.factors.map((f) => ({
            factorName: `${f.name} (${f.observed})`,
            factorValue: f.rating,
            weight: f.weight,
          })),
        },
      },
    });

    // The modelled condition, kept where modelled figures belong. Dated this
    // year, since that is the year the age it was derived from refers to.
    if (score.condition != null) {
      await prisma.deteriorationPrediction.create({
        data: {
          assetId: asset.id,
          modelId: deteriorationModel.id,
          forecastYear: thisYear,
          predictedCondition: score.condition,
          scenario: "current",
          modelVersion: `${score.serviceLife} year service life`,
        } satisfies Prisma.DeteriorationPredictionUncheckedCreateInput,
      });
    }

    rows.push({
      assetCode: asset.assetCode,
      name: asset.name,
      ...inputs,
      condition: score.condition,
      pof: score.pof,
      cof: score.cof,
      riskScore: score.riskScore,
    });
  }

  return rows;
}
