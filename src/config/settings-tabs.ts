import { SETTINGS_CARDS, SETTINGS_TABS } from "@/config/settings-cards";

/**
 * Which Settings tab each configuration page belongs to.
 *
 * The breadcrumb reads this to insert the tab as a real crumb — "Settings ›
 * Modeling › Metrics" — so going back one level lands on the tab the page came
 * from rather than on Settings' default tab.
 *
 * Derived from the card registry rather than listed again: every one of these
 * pages is reached through a card that already records which tab it sits on,
 * and keeping a second copy by hand is how a page ends up breadcrumbed into
 * one tab while its card lives on another. It also covers pages that do not
 * live under /settings in the URL (Filters, and the Administration
 * sub-pages), because where a page sits in the information architecture is
 * not always where it sits in the path.
 */
export type SettingsTab = { key: string; label: string };

const TAB_BY_KEY = new Map(SETTINGS_TABS.map((t) => [t.key, { key: t.key, label: t.label }]));

export const GENERAL_TAB: SettingsTab = TAB_BY_KEY.get("general")!;

export const TAB_FOR_PATH: Record<string, SettingsTab> = Object.fromEntries(
  SETTINGS_CARDS.map((card) => [card.href, TAB_BY_KEY.get(card.tab)!])
);

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
