import Link from "next/link";
import { auth } from "@/lib/auth";
import { getConfigSummary } from "@/server/admin";
import { listUsers } from "@/server/admin";
import { getConditionModelConfig, getRiskModelConfig, listDeteriorationModels } from "@/server/settings";
import { listRenameablePages, getPageName } from "@/server/navigation";
import { getWishlistSummary } from "@/server/wishlist";
import { listSavedFilters } from "@/server/saved-filters";
import { listTreatmentTrees } from "@/server/decision-trees";
import { ENTRIES, latestEntry } from "@/content/build-log";
import { ASSET_LABEL } from "@/config/labels";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import {
  Activity,
  ChevronRight,
  Compass,
  Database,
  FileUp,
  Filter,
  GitBranch,
  Gauge,
  Layers,
  Palette,
  ListChecks,
  ListTodo,
  ShieldAlert,
  ScrollText,
  ShieldCheck,
  TrendingDown,
  Users,
  Wrench,
} from "lucide-react";

const TABS = [
  { key: "general", label: "General" },
  { key: "administration", label: "Administration" },
  { key: "database", label: "Database" },
  { key: "modeling", label: "Modeling" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Everything that configures the system, in four tabs.
 *
 * The tab lives in the URL rather than component state so a tab is linkable,
 * survives a refresh, and renders on the server — no flash of the wrong tab
 * while JavaScript loads.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const isAdmin = session!.user.roleName === "Administrator";

  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : "general";

  const [config, conditionModel, riskModel, deterioration, navSections, title, users, wishlist, filters, trees] =
    await Promise.all([
      getConfigSummary(organizationId),
      getConditionModelConfig(organizationId),
      getRiskModelConfig(organizationId),
      listDeteriorationModels(organizationId),
      listRenameablePages(organizationId),
      getPageName(organizationId, "/settings", "Settings"),
      listUsers(organizationId),
      getWishlistSummary(organizationId),
      listSavedFilters(organizationId),
      listTreatmentTrees(organizationId),
    ]);

  const navItems = navSections.flatMap((s) => s.items);
  const renamedCount = navItems.filter((i) => i.renamed).length;
  const name = (href: string, fallback: string) => navItems.find((i) => i.href === href)?.label ?? fallback;
  const activeCurves = deterioration.filter((d) => d.isActive).length;
  const treatmentsWithTrees = trees.filter((t) => t.trees.some((tree) => tree.enabled)).length;
  const buildEntries = ENTRIES.length;
  const latest = latestEntry();

  return (
    <div>
      <PageHeader
        title={title}
        description="Configuration, people, data and the models behind every number the system reports"
      />

      <nav className="mb-4 flex flex-wrap gap-1 border-b" aria-label="Settings sections">
        {TABS.map((t) => {
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

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Most settings are read-only for your role — you can open each
          card to see how things are configured.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {active === "general" && (
          <>
            <SettingCard
              href="/settings/configuration"
              icon={<Layers className="h-5 w-5" />}
              title={name("/settings/configuration", "Configuration")}
              summary={`${config.assetTypes.length} ${ASSET_LABEL.lower} type(s) · ${formatNumber(
                config.attributeDefinitions.length
              )} attributes · ${config.inspectionTemplates.length} template(s)`}
              detail={`${ASSET_LABEL.singular} classes, the inventory attributes recorded against them, and the inspection forms used in the field.`}
            />
            <SettingCard
              href="/settings/navigation"
              icon={<Compass className="h-5 w-5" />}
              title={name("/settings/navigation", "Navigation")}
              summary={
                renamedCount === 0
                  ? "All pages use their default names"
                  : `${renamedCount} name${renamedCount === 1 ? "" : "s"} changed`
              }
              detail="Rename any page or sidebar section. The sidebar, breadcrumb trail and page heading all follow; URLs stay as they are."
            />
            <SettingCard
              href="/filters"
              icon={<Filter className="h-5 w-5" />}
              title={name("/filters", "Filters")}
              summary={
                filters.length === 0
                  ? "No saved filters yet"
                  : `${formatNumber(filters.length)} saved filter${filters.length === 1 ? "" : "s"}`
              }
              detail="Pick columns from the schema, set criteria, and save the result as a named filter the team can reuse."
            />
            <SettingCard
              href="/settings/theme"
              icon={<Palette className="h-5 w-5" />}
              title={name("/settings/theme", "Theme")}
              summary="Light or dark, and accent colour"
              detail="Set how the app looks on this device. Follows your operating system unless you choose otherwise."
            />
            <SettingCard
              href="/administration/activity"
              icon={<ShieldCheck className="h-5 w-5" />}
              title={name("/administration/activity", "Activity & Audit")}
              summary="Recent changes across the system"
              detail="Derived from the created and updated timestamps carried on the records themselves."
            />
          </>
        )}

        {active === "administration" && (
          <>
            <SettingCard
              href="/administration/users"
              icon={<Users className="h-5 w-5" />}
              title={name("/administration/users", "Users & Roles")}
              summary={`${formatNumber(users.length)} users across ${new Set(users.map((u) => u.roleName)).size} roles`}
              detail="Add people, set roles, reset passwords and deactivate accounts."
            />
            <SettingCard
              href="/administration/wishlist"
              icon={<ListTodo className="h-5 w-5" />}
              title={name("/administration/wishlist", "Wishlist")}
              summary={
                wishlist.total === 0
                  ? "Requests and ideas from the team"
                  : `${formatNumber(wishlist.open)} open${wishlist.highOpen > 0 ? `, ${wishlist.highOpen} high priority` : ""}`
              }
              detail="A shared list anyone signed in can add to, tick off or edit."
            />
            <SettingCard
              href="/settings/build-log"
              icon={<ScrollText className="h-5 w-5" />}
              title={name("/settings/build-log", "Build Log")}
              summary={
                latest
                  ? `${formatNumber(buildEntries)} entries · latest ${latest.title.toLowerCase()}`
                  : "What has changed and when"
              }
              detail="Written alongside each change, so it never drifts from what is actually deployed."
            />
          </>
        )}

        {active === "database" && (
          <>
            <SettingCard
              href="/settings/database"
              icon={<Database className="h-5 w-5" />}
              title={name("/settings/database", "Database Connection")}
              summary="Host, version, size and migration state"
              detail="Read from the live connection, so a stale connection string shows as unreachable rather than silently reporting health."
            />
            <SettingCard
              href="/administration/fields"
              icon={<ListChecks className="h-5 w-5" />}
              title={name("/administration/fields", "Fields")}
              summary={`${formatNumber(config.attributeDefinitions.length)} attributes · ${formatNumber(
                config.inspectionTemplates[0]?.fieldCount ?? 0
              )} inspection questions`}
              detail="What inspectors are asked, and what the inventory records against each segment."
            />
            <SettingCard
              href="/administration/import"
              icon={<FileUp className="h-5 w-5" />}
              title={name("/administration/import", "Data Import")}
              summary="Load inventory from CSV"
              detail="Validated in full before anything is written, so a bad row cannot half-import a file."
            />
          </>
        )}

        {active === "modeling" && (
          <>
            <SettingCard
              href="/settings/condition-index"
              icon={<Gauge className="h-5 w-5" />}
              title={name("/settings/condition-index", "Condition Index")}
              summary={`${config.conditionModels[0]?.name ?? "Condition index"} — components and weights`}
              detail="Which inspection fields feed the score and how much each one counts."
            />
            <SettingCard
              href="/settings/condition-models"
              icon={<Gauge className="h-5 w-5" />}
              title={name("/settings/condition-models", "Metrics")}
              summary={`Scale ${conditionModel.scaleMin}–${conditionModel.scaleMax} · ${conditionModel.bands.length} bands`}
              detail="The bands that turn a score into a grade, plus metrics built on any numeric field."
              swatches={conditionModel.bands.map((b) => b.color)}
            />
            <SettingCard
              href="/settings/treatments"
              icon={<Wrench className="h-5 w-5" />}
              title={name("/settings/treatments", "Treatments and Costs")}
              summary={`${formatNumber(config.treatments.length)} treatments in the library`}
              detail="Unit costs, mobilization and maintenance, condition and risk effects, and applicability rules."
            />
            <SettingCard
              href="/settings/decision-trees"
              icon={<GitBranch className="h-5 w-5" />}
              title={name("/settings/decision-trees", "Decision Trees")}
              summary={
                treatmentsWithTrees === 0
                  ? "No qualification rules configured"
                  : `${treatmentsWithTrees} of ${formatNumber(config.treatments.length)} treatments gated`
              }
              detail="Grouped AND/OR rules deciding whether an asset qualifies for a treatment, on top of its technical window."
            />
            <SettingCard
              href="/settings/deterioration-models"
              icon={<TrendingDown className="h-5 w-5" />}
              title={name("/settings/deterioration-models", "Deterioration Models")}
              summary={`${activeCurves} of ${deterioration.length} active`}
              detail="Service life and curve shape per material, and the Markov transition matrix."
            />
            <SettingCard
              href="/settings/risk-models"
              icon={<ShieldAlert className="h-5 w-5" />}
              title={name("/settings/risk-models", "Risk Models")}
              summary={`${Object.keys(riskModel.pof).length} probability · ${
                Object.keys(riskModel.cof).length
              } consequence factors`}
              detail="How much each factor counts toward probability and consequence of failure."
            />
            <SettingCard
              href="/settings/failure-types"
              icon={<Activity className="h-5 w-5" />}
              title={name("/settings/failure-types", "Failure Types")}
              summary={`${config.failureTypes.length} types · ${formatNumber(
                config.failureTypes.reduce((s, f) => s + f.eventCount, 0)
              )} recorded events`}
              detail="Reference data for recording what went wrong when a segment fails."
            />
          </>
        )}
      </div>

      {active === "modeling" && (
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
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  detail: string;
  swatches?: string[];
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardContent className="flex h-full items-start gap-3 py-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-foreground">{title}</div>
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
