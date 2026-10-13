/**
 * What the screens call the product and the things it manages.
 *
 * Set per organization under Settings › Branding, so the same platform can
 * present itself as a water system, a power system or neither — the schema,
 * the engine and the server layer speak only of assets and asset types
 * whatever these say. The defaults are what the app has always shown.
 *
 * Kept free of the database so client components can use it.
 */

export const BRAND_LOGOS = [
  { key: "droplets", label: "Water" },
  { key: "zap", label: "Power" },
  { key: "flame", label: "Gas" },
  { key: "network", label: "Generic" },
] as const;

export type BrandLogo = (typeof BRAND_LOGOS)[number]["key"];

export type Branding = {
  /** The name in the sidebar and the browser tab. */
  productName: string;
  /** The line under the name on the login screen and in the sidebar. */
  tagline: string;
  logo: BrandLogo;
  /** What one of the network's assets is called, title case: "Water", "Asset". */
  assetSingular: string;
  /** And several: "Water", "Assets". */
  assetPlural: string;
  /** What one of them is called mid-sentence, lowercase: "segment", "pole". */
  itemSingular: string;
  /** And several: "segments", "poles". */
  itemPlural: string;
};

export const DEFAULT_BRANDING: Branding = {
  productName: "CARNAC",
  tagline: "Water Management Platform",
  logo: "droplets",
  assetSingular: "Water",
  assetPlural: "Water",
  itemSingular: "segment",
  itemPlural: "segments",
};

/** The asset words in the four forms the screens use. */
export type AssetWords = {
  /** Title case, singular — form labels, table headers. */
  singular: string;
  /** Title case, plural — navigation, page titles, KPI labels. */
  plural: string;
  /** Lowercase singular — mid-sentence prose. */
  lower: string;
  /** Lowercase plural — mid-sentence prose. */
  lowerPlural: string;
  /** One asset, mid-sentence: "this segment", "every segment". */
  item: string;
  items: string;
  /** The same, title case, for headings and columns: "Segment". */
  itemTitle: string;
  itemsTitle: string;
};

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function assetWords(branding: Branding): AssetWords {
  return {
    singular: branding.assetSingular,
    plural: branding.assetPlural,
    lower: branding.assetSingular.toLowerCase(),
    lowerPlural: branding.assetPlural.toLowerCase(),
    item: branding.itemSingular,
    items: branding.itemPlural,
    itemTitle: titleCase(branding.itemSingular),
    itemsTitle: titleCase(branding.itemPlural),
  };
}

/** "1 segment", "3 segments". */
export function countItems(count: number, words: AssetWords, formatted: string = count.toLocaleString()): string {
  return `${formatted} ${count === 1 ? words.item : words.items}`;
}

/**
 * A label written with the asset words as placeholders — "{Assets}",
 * "{Asset} Management", "every {item}" — in the configured words. Lets the
 * navigation and breadcrumb defaults, and descriptions kept as constants,
 * follow the branding.
 */
export function withAssetWords(label: string, words: AssetWords): string {
  return label
    .replaceAll("{Assets}", words.plural)
    .replaceAll("{Asset}", words.singular)
    .replaceAll("{assets}", words.lowerPlural)
    .replaceAll("{asset}", words.lower)
    .replaceAll("{Items}", words.itemsTitle)
    .replaceAll("{Item}", words.itemTitle)
    .replaceAll("{items}", words.items)
    .replaceAll("{item}", words.item);
}

const LOGO_KEYS = new Set<string>(BRAND_LOGOS.map((l) => l.key));

export function parseBranding(value: unknown): Branding {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const text = (key: keyof Branding) =>
    typeof v[key] === "string" && (v[key] as string).trim() ? (v[key] as string).trim() : (DEFAULT_BRANDING[key] as string);
  return {
    productName: text("productName"),
    tagline: text("tagline"),
    logo: typeof v.logo === "string" && LOGO_KEYS.has(v.logo) ? (v.logo as BrandLogo) : DEFAULT_BRANDING.logo,
    assetSingular: text("assetSingular"),
    assetPlural: text("assetPlural"),
    itemSingular: text("itemSingular").toLowerCase(),
    itemPlural: text("itemPlural").toLowerCase(),
  };
}
