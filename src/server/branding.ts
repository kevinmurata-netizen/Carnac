import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { assetWords, parseBranding, BRAND_LOGOS, type AssetWords, type Branding } from "@/lib/branding";

const KEY = "branding";

/** This organization's branding, the defaults filling anything unset.
 * Cached per request: the layout and the page both ask. */
export const getBranding = cache(async (organizationId: string): Promise<Branding> => {
  const row = await prisma.organizationSetting.findUnique({
    where: { organizationId_key: { organizationId, key: KEY } },
    select: { value: true },
  });
  return parseBranding(row?.value);
});

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
  return orgs.length === 1 ? getBranding(orgs[0].id) : parseBranding(null);
}

export async function updateBranding(organizationId: string, input: Record<string, string>): Promise<void> {
  const value: Branding = {
    productName: input.productName?.trim() ?? "",
    tagline: input.tagline?.trim() ?? "",
    logo: input.logo as Branding["logo"],
    assetSingular: input.assetSingular?.trim() ?? "",
    assetPlural: input.assetPlural?.trim() ?? "",
  };
  if (!value.productName) throw new Error("The product needs a name");
  if (value.productName.length > 30) throw new Error("Keep the product name under 30 characters — it sits in the sidebar");
  if (value.tagline.length > 60) throw new Error("Keep the tagline under 60 characters");
  if (!value.assetSingular || !value.assetPlural) throw new Error("Say what one asset is called, and several");
  if (value.assetSingular.length > 24 || value.assetPlural.length > 24) {
    throw new Error("Keep the asset words under 24 characters — they head columns and pages");
  }
  if (!BRAND_LOGOS.some((l) => l.key === value.logo)) throw new Error("Choose a logo");

  await prisma.organizationSetting.upsert({
    where: { organizationId_key: { organizationId, key: KEY } },
    create: { organizationId, key: KEY, value },
    update: { value },
  });
}
