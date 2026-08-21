import Link from "next/link";
import { auth } from "@/lib/auth";
import { getConfigSummary } from "@/server/admin";
import { getConditionModelConfig, getRiskModelConfig, listDeteriorationModels } from "@/server/settings";
import { listRenameablePages, getPageName } from "@/server/navigation";
import { ASSET_LABEL } from "@/config/labels";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { Activity, ChevronRight, Compass, Gauge, Layers, ShieldAlert, TrendingDown, Wrench } from "lucide-react";

/**
 * Modelling and business configuration. Every card opens its own editor —
 * these values sit underneath every condition, risk and forecast number the
 * system reports, so they are configuration rather than code.
 */
export default async function SettingsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const isAdmin = session!.user.roleName === "Administrator";

  const [config, conditionModel, riskModel, deterioration, navSections, title] = await Promise.all([
    getConfigSummary(organizationId),
    getConditionModelConfig(organizationId),
    getRiskModelConfig(organizationId),
    listDeteriorationModels(organizationId),
    listRenameablePages(organizationId),
    getPageName(organizationId, "/settings", "Settings"),
  ]);

  const navItems = navSections.flatMap((s) => s.items);
  const renamedCount = navItems.filter((i) => i.renamed).length;
  /** Cards show the page's current name, so a rename is visible from here too. */
  const name = (href: string, fallback: string) => navItems.find((i) => i.href === href)?.label ?? fallback;

  const activeCurves = deterioration.filter((d) => d.isActive).length;

  return (
    <div>
      <PageHeader
        title={title}
        description={`Scoring, deterioration, risk and treatment configuration for ${ASSET_LABEL.lower} assets`}
      />

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Settings are read-only for your role — you can open each
          card to see how the models are configured.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingCard
          href="/settings/condition-index"
          icon={<Gauge className="h-5 w-5" />}
          title={name("/settings/condition-index", "Condition Index")}
          summary={`${config.conditionModels[0]?.name ?? "Condition index"} — components and weights`}
          detail="Which inspection fields feed the score and how much each one counts. Add, remove or re-weight components."
        />
        <SettingCard
          href="/settings/condition-models"
          icon={<Gauge className="h-5 w-5" />}
          title={name("/settings/condition-models", "Metrics")}
          summary={`Scale ${conditionModel.scaleMin}–${conditionModel.scaleMax} · ${conditionModel.bands.length} bands`}
          detail="The condition scale and its bands, plus metrics banding any numeric inspection or inventory field."
          swatches={conditionModel.bands.map((b) => b.color)}
        />
        <SettingCard
          href="/settings/treatments"
          icon={<Wrench className="h-5 w-5" />}
          title={name("/settings/treatments", "Treatments")}
          summary={`${formatNumber(config.treatments.length)} treatments in the library`}
          detail="Unit costs, mobilization and maintenance, condition and risk effects, applicability rules and decision trees."
        />
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
          href="/settings/deterioration-models"
          icon={<TrendingDown className="h-5 w-5" />}
          title={name("/settings/deterioration-models", "Deterioration Models")}
          summary={`${activeCurves} of ${deterioration.length} active`}
          detail="Service life and curve shape per material — what every condition forecast and scenario run projects against."
        />
        <SettingCard
          href="/settings/risk-models"
          icon={<ShieldAlert className="h-5 w-5" />}
          title={name("/settings/risk-models", "Risk Models")}
          summary={`${Object.keys(riskModel.pof).length} probability · ${
            Object.keys(riskModel.cof).length
          } consequence factors`}
          detail="How much each factor counts toward probability and consequence of failure on the 1–25 matrix."
        />
        <SettingCard
          href="/settings/navigation"
          icon={<Compass className="h-5 w-5" />}
          title={name("/settings/navigation", "Navigation")}
          summary={
            renamedCount === 0
              ? "All pages use their default names"
              : `${renamedCount} page${renamedCount === 1 ? "" : "s"} renamed`
          }
          detail="Rename any page. The sidebar, breadcrumb trail and page heading all follow; URLs stay as they are."
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
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        These definitions are stored in the database, not compiled into the application, which is what lets a new{" "}
        {ASSET_LABEL.lower} class be added without schema changes. The seeded domain values act as a fallback for a
        fresh install; once a row exists, what is configured here is what the system runs.
      </p>
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
