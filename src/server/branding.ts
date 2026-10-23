import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { assetWords, parseBranding, BRAND_LOGOS, type AssetWords, type BrandLogo, type Branding } from "@/lib/branding";

const KEY = "branding";

/**
 * The product's name and logo for this site — Hydrocore, Powercore — set
 * where the site is hosted, as PRODUCT_NAME and PRODUCT_LOGO, by whoever sets
 * the site up before it ships. They are not a setting in the app: a
 * customer's Administrator chooses the tagline and what the assets are
 * called, never what the product is called.
 *
 * Either left unset, the site keeps the one stored with its branding, which is
 * what it showed before these existed.
 */
export function siteProduct(): { productName: string | null; logo: BrandLogo | null } {
  const name = process.env.PRODUCT_NAME?.trim() || null;
  const logo = process.env.PRODUCT_LOGO?.trim() || null;
  if (logo && !BRAND_LOGOS.some((l) => l.key === logo)) {
    console.warn(`PRODUCT_LOGO "${logo}" is not one of ${BRAND_LOGOS.map((l) => l.key).join(", ")}; ignoring it`);
  }
  return {
    productName: name,
    logo: logo && BRAND_LOGOS.some((l) => l.key === logo) ? (logo as BrandLogo) : null,
  };
}

/** Stored branding with the site's product name and logo over it. */
function withSiteProduct(branding: Branding): Branding {
  const site = siteProduct();
  return { ...branding, productName: site.productName ?? branding.productName, logo: site.logo ?? branding.logo };
}

async function storedBranding(organizationId: string): Promise<Branding> {
  const row = await prisma.organizationSetting.findUnique({
    where: { organizationId_key: { organizationId, key: KEY } },
    select: { value: true },
  });
  return parseBranding(row?.value);
}

/** This organization's branding, the defaults filling anything unset.
 * Cached per request: the layout and the page both ask. */
export const getBranding = cache(async (organizationId: string): Promise<Branding> =>
  withSiteProduct(await storedBranding(organizationId))
);

export async function getAssetWords(organizationId: string): Promise<AssetWords> {
  return assetWords(await getBranding(organizationId));
}

/**
 * The branding to show before anyone has signed in — the login screen and
 * the browser tab there. A deployment with one organization is that
 * organization's; with several, nobody has said which yet, so the defaults.
 */
export async function getDeploymentBranding(): Promise<Branding> {
  const orgs = await prisma.organization.findMany({ select: { id: true }, take: 2 });
  return orgs.length === 1 ? getBranding(orgs[0].id) : withSiteProduct(parseBranding(null));
}

/**
 * What an Administrator may change: the tagline and the asset words. The
 * product's name and logo are the site's (see siteProduct), and whatever is
 * stored for them stays as it is.
 */
export async function updateBranding(organizationId: string, input: Record<string, string>): Promise<void> {
  const stored = await storedBranding(organizationId);
  const value: Branding = {
    productName: stored.productName,
    tagline: input.tagline?.trim() ?? "",
    logo: stored.logo,
    assetSingular: input.assetSingular?.trim() ?? "",
    assetPlural: input.assetPlural?.trim() ?? "",
    itemSingular: input.itemSingular?.trim().toLowerCase() ?? "",
    itemPlural: input.itemPlural?.trim().toLowerCase() ?? "",
  };
  if (value.tagline.length > 60) throw new Error("Keep the tagline under 60 characters");
  if (!value.assetSingular || !value.assetPlural) throw new Error("Say what one asset is called, and several");
  if (value.assetSingular.length > 24 || value.assetPlural.length > 24) {
    throw new Error("Keep the asset words under 24 characters — they head columns and pages");
  }
  if (!value.itemSingular || !value.itemPlural) throw new Error("Say what one asset is called in a sentence, and several");
  if (value.itemSingular.length > 24 || value.itemPlural.length > 24) {
    throw new Error("Keep the in-sentence words under 24 characters");
  }

  await prisma.organizationSetting.upsert({
    where: { organizationId_key: { organizationId, key: KEY } },
    create: { organizationId, key: KEY, value },
    update: { value },
  });
}
