import { prisma } from "@/lib/prisma";
import { NAV_GROUPS } from "@/config/nav";
import { SEGMENT_LABELS } from "@/config/breadcrumbs";

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
  }>;
};

/** Everything renameable, grouped the way the sidebar groups it, plus the
 * settings and administration sub-pages that are reachable but not in the
 * sidebar. */
export async function listRenameablePages(organizationId: string): Promise<RenameableSection[]> {
  const overrides = await getNavOverrides(organizationId);

  const resolve = (href: string, defaultLabel: string) => ({
    href,
    defaultLabel,
    label: overrides[href] ?? defaultLabel,
    renamed: overrides[href] != null && overrides[href] !== defaultLabel,
  });

  const sections: RenameableSection[] = NAV_GROUPS.map((g) => ({
    group: g.label,
    items: g.items.map((i) => resolve(i.href, i.label)),
  }));

  sections.push({
    group: "Settings Pages",
    items: [
      ["/settings/condition-index", "condition-index"],
      ["/settings/condition-models", "condition-models"],
      ["/settings/treatments", "treatments"],
      ["/settings/configuration", "configuration"],
      ["/settings/deterioration-models", "deterioration-models"],
      ["/settings/risk-models", "risk-models"],
      ["/settings/failure-types", "failure-types"],
      ["/settings/navigation", "navigation"],
    ].map(([href, segment]) => resolve(href, SEGMENT_LABELS[segment] ?? segment)),
  });

  sections.push({
    group: "Administration Pages",
    items: [
      ["/administration/users", "users"],
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
      await prisma.navigationLabel.deleteMany({ where: { organizationId, href } });
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
