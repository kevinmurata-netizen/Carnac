import Link from "next/link";
import { auth } from "@/lib/auth";
import { getConfigSummary } from "@/server/admin";
import { listUsers, listRoles } from "@/server/admin";
import { getConditionModelConfig, getRiskModelConfig, listDeteriorationModels } from "@/server/settings";
import { listRenameablePages, getPageName } from "@/server/navigation";
import { getSessionPermissions, resourceKey } from "@/server/permissions";
import { getWishlistSummary } from "@/server/wishlist";
import { listSavedFilters } from "@/server/saved-filters";
import { listTreatmentTrees } from "@/server/decision-trees";
import { ENTRIES, latestEntry } from "@/content/build-log";
import { ASSET_LABEL } from "@/config/labels";
import { SETTINGS_CARDS, SETTINGS_TABS, type SettingsTabKey } from "@/config/settings-cards";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { ChevronRight } from "lucide-react";

/**
 * Everything that configures the system, in four tabs.
 *
 * The tab lives in the URL rather than component state so a tab is linkable,
 * survives a refresh, and renders on the server — no flash of the wrong tab
 * while JavaScript loads.
 *
 * Cards come from config/settings-cards.ts rather than being written out here,
 * so the list the page renders and the list an Administrator can grant
 * permissions over are the same list and cannot drift apart.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const active: SettingsTabKey = SETTINGS_TABS.some((t) => t.key === tab)
    ? (tab as SettingsTabKey)
    : "general";

  const [
    config,
    conditionModel,
    riskModel,
    deterioration,
    navSections,
    title,
    users,
    roles,
    wishlist,
    filters,
    trees,
    permissions,
  ] = await Promise.all([
    getConfigSummary(organizationId),
    getConditionModelConfig(organizationId),
    getRiskModelConfig(organizationId),
    listDeteriorationModels(organizationId),
    listRenameablePages(organizationId),
    getPageName(organizationId, "/settings", "Settings"),
    listUsers(organizationId),
    listRoles(),
    getWishlistSummary(organizationId),
    listSavedFilters(organizationId),
    listTreatmentTrees(organizationId),
    getSessionPermissions(session!),
  ]);

  const navItems = navSections.flatMap((s) => s.items);
  const renamedCount = navItems.filter((i) => i.renamed).length;
  const name = (href: string, fallback: string) => navItems.find((i) => i.href === href)?.label ?? fallback;
  const activeCurves = deterioration.filter((d) => d.isActive).length;
  const treatmentsWithTrees = trees.filter((t) => t.trees.some((tree) => tree.enabled)).length;
  const latest = latestEntry();

  /** One line per card, keyed the same way the registry is. */
  const summaries: Record<string, string> = {
    configuration: `${config.assetTypes.length} ${ASSET_LABEL.lower} type(s) · ${formatNumber(
      config.attributeDefinitions.length
    )} attributes · ${config.inspectionTemplates.length} template(s)`,
    navigation:
      renamedCount === 0
        ? "All pages use their default names"
        : `${renamedCount} name${renamedCount === 1 ? "" : "s"} changed`,
    filters:
      filters.length === 0
        ? "No saved filters yet"
        : `${formatNumber(filters.length)} saved filter${filters.length === 1 ? "" : "s"}`,
    theme: "Light or dark, and accent colour",
    activity: "Recent changes across the system",
    users: `${formatNumber(users.length)} user${users.length === 1 ? "" : "s"} across ${
      new Set(users.map((u) => u.roleName)).size
    } roles`,
    roles: `${roles.length} roles — what each can open, change and see`,
    wishlist:
      wishlist.total === 0
        ? "Requests and ideas from the team"
        : `${formatNumber(wishlist.open)} open${
            wishlist.highOpen > 0 ? `, ${wishlist.highOpen} high priority` : ""
          }`,
    "build-log": latest
      ? `${formatNumber(ENTRIES.length)} entries · latest ${latest.title.toLowerCase()}`
      : "What has changed and when",
    database: "Host, version, size and migration state",
    fields: `${formatNumber(config.attributeDefinitions.length)} attributes · ${formatNumber(
      config.inspectionTemplates[0]?.fieldCount ?? 0
    )} inspection questions`,
    import: "Load inventory from CSV",
    "condition-index": `${config.conditionModels[0]?.name ?? "Condition index"} — components and weights`,
    "condition-models": `Scale ${conditionModel.scaleMin}–${conditionModel.scaleMax} · ${conditionModel.bands.length} bands`,
    treatments: `${formatNumber(config.treatments.length)} treatments in the library`,
    "decision-trees":
      treatmentsWithTrees === 0
        ? "No qualification rules configured"
        : `${treatmentsWithTrees} of ${formatNumber(config.treatments.length)} treatments gated`,
    "deterioration-models": `${activeCurves} of ${deterioration.length} active`,
    "risk-models": `${Object.keys(riskModel.pof).length} probability · ${
      Object.keys(riskModel.cof).length
    } consequence factors`,
    "failure-types": `${config.failureTypes.length} types · ${formatNumber(
      config.failureTypes.reduce((s, f) => s + f.eventCount, 0)
    )} recorded events`,
  };

  // A card the role cannot see is not rendered at all — a tile that only
  // errors when clicked would be worse than its absence.
  const visibleCards = SETTINGS_CARDS.filter((c) => permissions.isVisible(resourceKey("card", c.href)));
  const cardsOnTab = visibleCards.filter((c) => c.tab === active);

  // Tabs whose every card is hidden for this role would be dead ends.
  const tabsWithCards = SETTINGS_TABS.filter((t) => visibleCards.some((c) => c.tab === t.key));

  return (
    <div>
      <PageHeader
        title={title}
        description="Configuration, people, data and the models behind every number the system reports"
      />

      <nav className="mb-4 flex flex-wrap gap-1 border-b" aria-label="Settings sections">
        {tabsWithCards.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.key === "general" ? "/settings" : `/settings?tab=${t.key}`}
              aria-current={on ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
                on
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {!permissions.isAdministrator && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. What you can open and change here is set by your role — an
          Administrator can adjust it under Roles &amp; Permissions.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cardsOnTab.map((card) => (
          <SettingCard
            key={card.key}
            href={card.href}
            icon={<card.icon className="h-5 w-5" />}
            title={name(card.href, card.title)}
            summary={summaries[card.key] ?? ""}
            detail={card.detail}
            readOnly={!permissions.canWrite(resourceKey("card", card.href))}
            swatches={card.key === "condition-models" ? conditionModel.bands.map((b) => b.color) : undefined}
          />
        ))}
      </div>

      {cardsOnTab.length === 0 && (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Nothing on this tab is available to your role.
        </div>
      )}

      {active === "modeling" && cardsOnTab.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          These definitions are stored in the database, not compiled into the application, which is what lets a new{" "}
          {ASSET_LABEL.lower} class be added without schema changes. The seeded domain values act as a fallback for a
          fresh install; once a row exists, what is configured here is what the system runs.
        </p>
      )}
    </div>
  );
}

function SettingCard({
  href,
  icon,
  title,
  summary,
  detail,
  swatches,
  readOnly,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  detail: string;
  swatches?: string[];
  /** Marked on the tile so a role knows before opening whether it can change
   * anything, rather than finding every control disabled. */
  readOnly?: boolean;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardContent className="flex h-full items-start gap-3 py-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-foreground">{title}</span>
                {readOnly && (
                  <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    View only
                  </span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-0.5 text-xs font-medium text-muted-foreground">{summary}</div>
            <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
            {swatches && (
              <div className="mt-2 flex gap-1">
                {swatches.map((c, i) => (
                  <span key={i} className="h-2 w-6 rounded-sm" style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
