/**
 * User-facing vocabulary for the asset class this deployment presents.
 *
 * The platform underneath stays asset-type agnostic — the schema, the domain
 * modules and the server layer all still speak in terms of Asset / AssetType,
 * and a second asset class can be added by inserting an AssetType row without
 * touching any of it. These strings only control what the *screens say*.
 *
 * To present a different asset class, or to go back to generic platform
 * wording, change the values here; no other file needs editing.
 */
export const ASSET_LABEL = {
  /** Title case, singular — form labels, table headers. */
  singular: "Water",
  /** Title case, plural — navigation, page titles, KPI labels. */
  plural: "Water",
  /** Lowercase singular — mid-sentence prose. */
  lower: "water",
  /** Lowercase plural — mid-sentence prose. */
  lowerPlural: "water",
} as const;

/** Product tagline shown on the login screen and in page metadata. */
export const PRODUCT_TAGLINE = "Water Management Platform";
