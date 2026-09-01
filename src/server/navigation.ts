import { prisma } from "@/lib/prisma";
import { NAV_GROUPS } from "@/config/nav";
import { SEGMENT_LABELS } from "@/config/breadcrumbs";
import { groupKey } from "@/config/nav-groups";

export { groupKey };

/**
 * Page names are configuration. NAV_GROUPS and SEGMENT_LABELS remain the
 * defaults; this module layers per-organization overrides on top, and only
 * renamed entries get a row.
 *
 * The override map is keyed by href so one rename reaches all three places a
 * page is named — the sidebar, the breadcrumb trail and the page heading —
 * rather than leaving them disagreeing with each other.
 */

export type NavOverrides = Record<string, string>;

export async function getNavOverrides(organizationId: string): Promise<NavOverrides> {
  const rows = await prisma.navigationLabel.findMany({
    where: { organizationId },
    select: { href: true, label: true },
  });
  return Object.fromEntries(rows.map((r) => [r.href, r.label]));
}

/**
 * Hrefs hidden from the sidebar.
 *
 * Hiding is presentational only — the page keeps working and its URL keeps
 * resolving, so a bookmark or a link from elsewhere in the app still lands.
 * This is tidying a crowded sidebar, not access control; roles do that.
 */
export async function getHiddenHrefs(organizationId: string): Promise<Set<string>> {
  const rows = await prisma.navigationLabel.findMany({
    where: { organizationId, hidden: true },
    select: { href: true },
  });
  return new Set(rows.map((r) => r.href));
}

/** Settings is how you get back to this page, so it can never be hidden —
 * hiding it would leave no route to unhide anything. */
export const ALWAYS_VISIBLE = new Set<string>(["/settings"]);

/** Resolve one page's name, for a heading. `fallback` is the name in code. */
export async function getPageName(
  organizationId: string,
  href: string,
  fallback: string
): Promise<string> {
  const row = await prisma.navigationLabel.findUnique({
    where: { organizationId_href: { organizationId, href } },
    select: { label: true },
  });
  return row?.label ?? fallback;
}

export type RenameableSection = {
  group: string;
  items: Array<{
    href: string;
    defaultLabel: string;
    label: string;
    renamed: boolean;
    hidden: boolean;
    /** False for the few entries that must stay reachable. */
    canHide: boolean;
  }>;
};

/** Everything renameable, grouped the way the sidebar groups it, plus the
 * settings and administration sub-pages that are reachable but not in the
 * sidebar. */
export async function listRenameablePages(organizationId: string): Promise<RenameableSection[]> {
  const [overrides, hidden] = await Promise.all([
    getNavOverrides(organizationId),
    getHiddenHrefs(organizationId),
  ]);

  const resolve = (href: string, defaultLabel: string) => ({
    href,
    defaultLabel,
    label: overrides[href] ?? defaultLabel,
    renamed: overrides[href] != null && overrides[href] !== defaultLabel,
    hidden: hidden.has(href),
    canHide: !ALWAYS_VISIBLE.has(href),
  });

  const sections: RenameableSection[] = [
    {
      group: "Sidebar Sections",
      items: NAV_GROUPS.map((g) => resolve(groupKey(g.label), g.label)),
    },
    ...NAV_GROUPS.map((g) => ({
      group: overrides[groupKey(g.label)] ?? g.label,
      items: g.items.map((i) => resolve(i.href, i.label)),
    })),
  ];

  sections.push({
    group: "Settings Pages",
    items: [
      ["/settings/configuration", "configuration"],
      ["/settings/navigation", "navigation"],
      ["/settings/build-log", "build-log"],
      ["/settings/theme", "theme"],
      ["/settings/database", "database"],
      ["/settings/condition-index", "condition-index"],
      ["/settings/condition-models", "condition-models"],
      ["/settings/treatments", "treatments"],
      ["/settings/deterioration-models", "deterioration-models"],
      ["/settings/risk-models", "risk-models"],
      ["/settings/decision-trees", "decision-trees"],
      ["/settings/failure-types", "failure-types"],
      ["/filters", "filters"],
    ].map(([href, segment]) => resolve(href, SEGMENT_LABELS[segment] ?? segment)),
  });

  sections.push({
    group: "Administration Pages",
    items: [
      ["/administration/users", "users"],
      ["/administration/wishlist", "wishlist"],
      ["/administration/fields", "fields"],
      ["/administration/import", "import"],
      ["/administration/activity", "activity"],
    ].map(([href, segment]) => resolve(href, SEGMENT_LABELS[segment] ?? segment)),
  });
  return sections;
}

/** Every href this module is willing to rename, so a crafted form cannot write
 * labels for arbitrary paths. */
async function renameableHrefs(organizationId: string): Promise<Map<string, string>> {
  const sections = await listRenameablePages(organizationId);
  return new Map(sections.flatMap((s) => s.items.map((i) => [i.href, i.defaultLabel])));
}

/**
 * Sets which hrefs are hidden, as a whole set.
 *
 * A page keeps its row when hidden so a rename survives being hidden and shown
 * again — which means a row no longer implies "renamed", and the tidy-up below
 * only deletes rows that are neither renamed nor hidden.
 */
export async function updateNavVisibility(organizationId: string, hiddenHrefs: string[]) {
  const allowed = await renameableHrefs(organizationId);
  const wanted = new Set(hiddenHrefs.filter((h) => allowed.has(h) && !ALWAYS_VISIBLE.has(h)));

  for (const [href, defaultLabel] of allowed) {
    const shouldHide = wanted.has(href);
    const existing = await prisma.navigationLabel.findUnique({
      where: { organizationId_href: { organizationId, href } },
    });

    if (!existing) {
      if (shouldHide) {
        await prisma.navigationLabel.create({
          data: { organizationId, href, label: defaultLabel, hidden: true },
        });
      }
      continue;
    }

    if (existing.hidden === shouldHide) continue;

    // A row that is neither renamed nor hidden carries no information, so it
    // goes rather than lingering as a no-op override.
    if (!shouldHide && existing.label === defaultLabel) {
      await prisma.navigationLabel.delete({ where: { id: existing.id } });
      continue;
    }

    await prisma.navigationLabel.update({ where: { id: existing.id }, data: { hidden: shouldHide } });
  }
}

export async function updateNavLabels(organizationId: string, labels: Record<string, string>) {
  const allowed = await renameableHrefs(organizationId);

  for (const [href, raw] of Object.entries(labels)) {
    const defaultLabel = allowed.get(href);
    if (defaultLabel === undefined) continue;

    const label = raw.trim();
    if (!label) throw new Error(`"${defaultLabel}" cannot have an empty name`);
    if (label.length > 40) throw new Error(`"${label}" is too long — keep page names under 40 characters`);

    // A name matching the default is stored as no override at all, so the page
    // keeps following the code default if that ever changes.
    if (label === defaultLabel) {
      // Only drop the row if it is not also carrying a hidden flag, or
      // renaming back to the default would silently unhide the page.
      const existing = await prisma.navigationLabel.findUnique({
        where: { organizationId_href: { organizationId, href } },
      });
      if (existing && !existing.hidden) {
        await prisma.navigationLabel.delete({ where: { id: existing.id } });
      } else if (existing) {
        await prisma.navigationLabel.update({ where: { id: existing.id }, data: { label } });
      }
      continue;
    }

    await prisma.navigationLabel.upsert({
      where: { organizationId_href: { organizationId, href } },
      create: { organizationId, href, label },
      update: { label },
    });
  }
}

export async function resetNavLabels(organizationId: string) {
  await prisma.navigationLabel.deleteMany({ where: { organizationId } });
}
