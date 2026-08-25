/**
 * Which Settings tab each configuration page belongs to.
 *
 * The breadcrumb reads this to insert the tab as a real crumb — "Settings ›
 * Modeling › Metrics" — so going back one level lands on the tab the page came
 * from rather than on Settings' default tab.
 *
 * It also covers pages that do not live under /settings in the URL (Filters,
 * and the Administration sub-pages), because where a page sits in the
 * information architecture is not always where it sits in the path.
 */
export type SettingsTab = { key: string; label: string };

export const GENERAL_TAB: SettingsTab = { key: "general", label: "General" };

const ADMINISTRATION: SettingsTab = { key: "administration", label: "Administration" };
const DATABASE: SettingsTab = { key: "database", label: "Database" };
const MODELING: SettingsTab = { key: "modeling", label: "Modeling" };

export const TAB_FOR_PATH: Record<string, SettingsTab> = {
  "/settings/configuration": GENERAL_TAB,
  "/settings/navigation": GENERAL_TAB,
  "/settings/theme": GENERAL_TAB,
  "/filters": GENERAL_TAB,
  "/administration/activity": GENERAL_TAB,

  "/administration/users": ADMINISTRATION,
  "/administration/wishlist": ADMINISTRATION,
  "/settings/build-log": ADMINISTRATION,

  "/settings/database": DATABASE,
  "/administration/fields": DATABASE,
  "/administration/import": DATABASE,

  "/settings/condition-index": MODELING,
  "/settings/condition-models": MODELING,
  "/settings/treatments": MODELING,
  "/settings/deterioration-models": MODELING,
  "/settings/risk-models": MODELING,
  "/settings/decision-trees": MODELING,
  "/settings/failure-types": MODELING,
};

/** The tab a path belongs to, walking up so /settings/treatments/[id] inherits
 * from /settings/treatments. */
export function tabForPath(pathname: string): SettingsTab | null {
  if (TAB_FOR_PATH[pathname]) return TAB_FOR_PATH[pathname];

  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i > 0; i--) {
    const parent = "/" + segments.slice(0, i).join("/");
    if (TAB_FOR_PATH[parent]) return TAB_FOR_PATH[parent];
  }
  return null;
}

export function tabHref(tab: SettingsTab) {
  return tab.key === GENERAL_TAB.key ? "/settings" : `/settings?tab=${tab.key}`;
}
