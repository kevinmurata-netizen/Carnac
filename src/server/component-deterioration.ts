import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurveParams } from "@/domain/waterline/deterioration";
import { FORECAST_HORIZON_YEARS } from "@/domain/waterline/deterioration";
import {
  INTERVENTION_THRESHOLD,
  defaultComponentCurve,
  forecastComponent,
  type ComponentAnchor,
} from "@/domain/components/deterioration";
import { probabilityFromCondition } from "@/domain/components/inspection";
import { rollUp } from "@/domain/components/rollup";
import { COMPONENT_SCOPE, isComponentScoped } from "@/domain/components/scope";
import { rollUpAssets } from "@/server/rollup";

/**
 * Deterioration curves for components, and the forecasts they produce.
 *
 * Stored as DeteriorationModel rows like the waterline material curves, one
 * per component on each kind of asset, marked `{ scope: "component" }` in
 * their applicability so nothing that reads the waterline curves can mistake
 * one for a material. Forecasts are computed on read — a facility has a
 * handful of components, and the rolled-up forecast has to follow the
 * roll-up strategy as it stands, which stored rows would not.
 */

const CURVE_KEYS = ["initialCondition", "minCondition", "serviceLife", "shape"] as const;

type Applicability = { scope?: string; componentType?: string };

function componentTypeOf(applicability: Prisma.JsonValue): string | null {
  const a = applicability as Applicability | null;
  return isComponentScoped(a) && typeof a?.componentType === "string" ? a.componentType : null;
}

function curveFrom(rows: Array<{ key: string; value: Prisma.JsonValue }>, fallback: CurveParams): CurveParams {
  const byKey = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const pick = (key: (typeof CURVE_KEYS)[number]) => {
    const v = byKey.get(key);
    return v != null && Number.isFinite(v) ? v : fallback[key];
  };
  return {
    initialCondition: pick("initialCondition"),
    minCondition: pick("minCondition"),
    serviceLife: pick("serviceLife"),
    shape: pick("shape"),
  };
}

/**
 * A curve for every component on every kind of asset that lacks one, from
 * the typical service life of its type. Idempotent, and run wherever the
 * curves are read, so a component added under Settings has a curve the first
 * time anything asks.
 */
export async function ensureComponentDeteriorationModels(organizationId: string) {
  const [links, models] = await Promise.all([
    prisma.assetTypeComponentType.findMany({
      where: { assetType: { organizationId } },
      include: {
        assetType: { select: { id: true, name: true } },
        componentType: { select: { code: true, name: true } },
      },
    }),
    prisma.deteriorationModel.findMany({
      where: { assetType: { organizationId } },
      select: { assetTypeId: true, applicability: true },
    }),
  ]);
  const have = new Set(
    models.map((m) => `${m.assetTypeId}:${componentTypeOf(m.applicability)}`).filter((k) => !k.endsWith(":null"))
  );

  for (const link of links) {
    if (have.has(`${link.assetTypeId}:${link.componentType.code}`)) continue;
    const curve = defaultComponentCurve(link.componentType.code);
    await prisma.deteriorationModel.create({
      data: {
        assetTypeId: link.assetTypeId,
        name: `${link.componentType.name} — ${link.assetType.name}`,
        modelType: "POLYNOMIAL",
        applicability: { scope: COMPONENT_SCOPE, componentType: link.componentType.code },
        parameters: { create: CURVE_KEYS.map((key) => ({ key, value: curve[key] })) },
      },
    });
  }
}

export type ComponentCurveConfig = {
  id: string;
  name: string;
  modelType: string;
  isActive: boolean;
  curve: CurveParams;
  assetTypeId: string;
  assetTypeName: string;
  componentTypeCode: string;
  componentTypeName: string;
  /** How many components on assets of the type it forecasts. */
  componentCount: number;
};

/** Every component curve, grouped the way Settings shows them: by asset
 * type, in the order the type lists its components. */
export async function listComponentCurves(organizationId: string): Promise<ComponentCurveConfig[]> {
  await ensureComponentDeteriorationModels(organizationId);
  const [models, links, counts] = await Promise.all([
    prisma.deteriorationModel.findMany({
      where: { assetType: { organizationId } },
      include: { parameters: true, assetType: { select: { name: true } } },
    }),
    prisma.assetTypeComponentType.findMany({
      where: { assetType: { organizationId } },
      include: { componentType: { select: { code: true, name: true } } },
    }),
    prisma.$queryRaw<Array<{ assetTypeId: string; code: string; n: number }>>`
      SELECT a."assetTypeId", ct.code, count(*)::int AS n
      FROM asset_components c
      JOIN assets a ON a.id = c."assetId" AND a."deletedAt" IS NULL
      JOIN component_types ct ON ct.id = c."componentTypeId"
      WHERE a."organizationId" = ${organizationId}
      GROUP BY a."assetTypeId", ct.code`,
  ]);
  const linkOf = new Map(links.map((l) => [`${l.assetTypeId}:${l.componentType.code}`, l]));
  const countOf = new Map(counts.map((c) => [`${c.assetTypeId}:${c.code}`, c.n]));

  return models
    .map((m) => ({ m, code: componentTypeOf(m.applicability) }))
    .filter((x): x is { m: (typeof models)[number]; code: string } => x.code != null)
    .map(({ m, code }) => {
      const link = linkOf.get(`${m.assetTypeId}:${code}`);
      const config: ComponentCurveConfig = {
        id: m.id,
        name: m.name,
        modelType: m.modelType,
        isActive: m.isActive,
        curve: curveFrom(m.parameters, defaultComponentCurve(code)),
        assetTypeId: m.assetTypeId,
        assetTypeName: m.assetType.name,
        componentTypeCode: code,
        componentTypeName: link?.componentType.name ?? code,
        componentCount: countOf.get(`${m.assetTypeId}:${code}`) ?? 0,
      };
      return { config, sortOrder: link?.sortOrder ?? null };
    })
    // A curve whose component was since removed from the type forecasts
    // nothing; it stays stored, so re-adding the component brings it back.
    .filter((x) => x.sortOrder != null)
    .sort((a, b) => a.config.assetTypeName.localeCompare(b.config.assetTypeName) || a.sortOrder! - b.sortOrder!)
    .map((x) => x.config);
}

export type ComponentForecastRow = {
  id: string;
  label: string;
  componentTypeName: string;
  curveName: string;
  curve: CurveParams;
  /** True when its curve is switched off and the typical one stands in. */
  defaultCurve: boolean;
  /** How the forecast was anchored, for the reader. */
  basis: string;
  points: Array<{ year: number; condition: number }>;
  remainingLife: number | null;
};

export type AssetComponentForecast = {
  startYear: number;
  horizon: number;
  threshold: number;
  components: ComponentForecastRow[];
  /** Components with neither an inspection nor an install date to start from. */
  unforecast: string[];
  /** The asset's own condition each year, rolled up from the forecasts above
   * under the strategy that governs it now. */
  asset: Array<{ year: number; condition: number | null; risk: number | null }>;
  strategyName: string | null;
  /** The asset's score as its components were last inspected — what the
   * forecast's first year ages forward from. */
  inspectedScore: number | null;
  /** Years until the rolled-up condition first reaches the threshold; null
   * if it doesn't within the horizon. */
  assetRemainingLife: number | null;
};

/** The "do nothing" forecast for an asset's components, and for the asset. */
export async function forecastAssetComponents(
  organizationId: string,
  assetId: string
): Promise<AssetComponentForecast | null> {
  const [rollup] = await rollUpAssets(organizationId, [assetId]);
  if (!rollup || rollup.components.length === 0) return null;

  await ensureComponentDeteriorationModels(organizationId);
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId },
    select: {
      assetTypeId: true,
      installationDate: true,
      assetType: { select: { componentTypes: { select: { consequence: true, componentType: { select: { code: true } } } } } },
    },
  });
  if (!asset) return null;
  const consequenceOf = new Map(asset.assetType.componentTypes.map((l) => [l.componentType.code, l.consequence]));

  const models = await prisma.deteriorationModel.findMany({
    where: { assetTypeId: asset.assetTypeId },
    include: { parameters: true },
  });
  const modelOf = new Map(
    models
      .map((m) => ({ m, code: componentTypeOf(m.applicability) }))
      .filter((x) => x.code != null)
      .map(({ m, code }) => [code!, m])
  );

  const startYear = new Date().getUTCFullYear();
  const horizon = FORECAST_HORIZON_YEARS;
  const components: ComponentForecastRow[] = [];
  const unforecast: string[] = [];
  const forecastOf = new Map<string, ComponentForecastRow>();

  for (const c of rollup.components) {
    const model = modelOf.get(c.componentTypeCode);
    const typical = defaultComponentCurve(c.componentTypeCode);
    const active = model?.isActive ?? false;
    const curve = model && active ? curveFrom(model.parameters, typical) : typical;

    const installed = c.installationDate ?? asset.installationDate;
    let anchor: ComponentAnchor | null = null;
    let basis: string;
    if (c.conditionScore != null && c.scoresAsOf) {
      anchor = { condition: c.conditionScore, asOfYear: c.scoresAsOf.getUTCFullYear() };
      basis = `${c.conditionScore} when inspected in ${c.scoresAsOf.getUTCFullYear()}`;
    } else if (installed) {
      anchor = { ageYears: Math.max(0, startYear - installed.getUTCFullYear()) };
      basis = `never inspected — by age, installed ${installed.getUTCFullYear()}${c.installationDate ? "" : " with the asset"}`;
    } else {
      basis = "";
    }
    if (!anchor) {
      unforecast.push(c.label);
      continue;
    }

    const forecast = forecastComponent(curve, anchor, startYear, horizon);
    const row: ComponentForecastRow = {
      id: c.id,
      label: c.label,
      componentTypeName: c.componentTypeName,
      curveName: model?.name ?? `${c.componentTypeName} (typical)`,
      curve,
      defaultCurve: !active,
      basis,
      points: forecast.points,
      remainingLife: forecast.remainingLife,
    };
    components.push(row);
    forecastOf.set(c.id, row);
  }

  const strategy = rollup.strategy;
  const assetPoints = Array.from({ length: horizon + 1 }, (_, i) => {
    if (!strategy) return { year: startYear + i, condition: null, risk: null };
    const scores = rollup.components.map((c) => {
      const condition = forecastOf.get(c.id)?.points[i].condition ?? null;
      const consequence = consequenceOf.get(c.componentTypeCode) ?? null;
      return {
        ...c,
        conditionScore: condition,
        riskScore: condition != null && consequence != null ? probabilityFromCondition(condition) * consequence : null,
      };
    });
    const result = rollUp(scores, { type: strategy.type, config: strategy.config });
    return { year: startYear + i, condition: result.condition.value, risk: result.risk.value };
  });
  const crossing = assetPoints.findIndex((p) => p.condition != null && p.condition <= INTERVENTION_THRESHOLD);

  return {
    startYear,
    horizon,
    threshold: INTERVENTION_THRESHOLD,
    components,
    unforecast,
    asset: assetPoints,
    strategyName: strategy?.name ?? null,
    inspectedScore: rollup.result?.condition.value ?? null,
    assetRemainingLife: crossing === -1 ? null : crossing,
  };
}
