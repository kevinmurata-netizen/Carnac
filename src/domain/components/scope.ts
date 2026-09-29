/**
 * The condition and risk models that hold component scores.
 *
 * Condition and risk rows need a model to belong to, and a model found by
 * asset type alone would also be taken for the whole asset's — the inspection
 * screen would score a reservoir walk-through with it. So a model that exists
 * only to hold component scores says so in its JSON, and whole-asset lookups
 * skip it.
 *
 * Kept free of the database so the SQL generator creates them exactly as the
 * server does.
 */
export const COMPONENT_SCOPE = "component";

export function isComponentScoped(json: unknown): boolean {
  return (json as { scope?: unknown } | null)?.scope === COMPONENT_SCOPE;
}

export function componentConditionModelSpec(assetTypeName: string) {
  return {
    name: `${assetTypeName} Component Condition`,
    scaleMin: 0,
    scaleMax: 100,
    bands: [] as unknown[],
    formula: { scope: COMPONENT_SCOPE, note: "Holds component condition scores; the asset's own is rolled up from them." },
  };
}

export function componentRiskModelSpec(assetTypeName: string) {
  return {
    name: `${assetTypeName} Component Risk`,
    probabilityConfig: { scope: COMPONENT_SCOPE },
    consequenceConfig: { scope: COMPONENT_SCOPE },
  };
}
