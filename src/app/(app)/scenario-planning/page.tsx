import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listScenarios, getAnnualBudget } from "@/server/scenarios";
import { listScenarioSets } from "@/server/scenario-sets";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ScenarioComparison } from "./scenario-comparison";
import { ScenarioSetCards } from "./sets/set-cards";
import { DollarSign, FolderKanban, GitCompare, TrendingUp, Wallet } from "lucide-react";
import { getConditionBands } from "@/server/settings";
import { getPageName } from "@/server/navigation";

/**
 * Scenario Planning, organised around scenario sets.
 *
 * Sets come first. A set names a decision and fixes the years it is compared
 * over; scenarios are created inside one, from its card or its page. So the
 * sets lead the page, the only create button in the header makes a set, and
 * the comparison of every scenario sits underneath as the wider view.
 */
export default async function ScenarioPlanningPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/scenario-planning", "Scenario Planning");
  const conditionBands = await getConditionBands(organizationId);

  const [scenarios, annualBudget, sets] = await Promise.all([
    listScenarios(organizationId),
    getAnnualBudget(organizationId),
    listScenarioSets(organizationId),
  ]);
  const canEdit = canRecordFieldData(session);

  const unassigned = scenarios.filter((s) => !s.scenarioSet);
  const withResults = scenarios.filter((s) => s.hasResults);
  const bestCondition = withResults.reduce<typeof withResults[number] | null>(
    (best, s) => (!best || (s.finalAvgCondition ?? 0) > (best.finalAvgCondition ?? 0) ? s : best),
    null
  );
  const fewestFailures = withResults.reduce<typeof withResults[number] | null>(
    (best, s) => (!best || (s.totalFailures ?? Infinity) < (best.totalFailures ?? Infinity) ? s : best),
    null
  );

  const newSetButton = (
    <Button
      size="sm"
      nativeButton={false}
      render={
        <Link href="/scenario-planning/sets/new">
          <FolderKanban className="mr-1 h-4 w-4" />
          New Scenario Set
        </Link>
      }
    />
  );

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Group scenarios into sets that share a planning window, then compare what each one does to the network"
        actions={canEdit && newSetButton}
      />

      <section aria-labelledby="scenario-sets-heading" className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="scenario-sets-heading" className="text-lg font-semibold tracking-tight">
            Scenario Sets <span className="font-normal text-muted-foreground">({sets.length})</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Create a set first, then add its scenarios. Every scenario in a set runs over the set&apos;s years.
          </p>
        </div>

        {sets.length === 0 ? (
          // The empty state is the instruction: with no sets there is nowhere
          // to create a scenario, so this is where every plan starts.
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <FolderKanban className="h-8 w-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">Start with a scenario set</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  A set names the decision — say, the 2027 capital program — and fixes the base year and planning
                  period. The scenarios you add to it are then compared over exactly those years.
                </p>
              </div>
              {canEdit && newSetButton}
            </CardContent>
          </Card>
        ) : (
          <ScenarioSetCards sets={sets} scenarios={scenarios} canEdit={canEdit} />
        )}
      </section>

      {/* Scenarios made before sets existed. Said plainly, with the way to fix
          it, rather than letting them sit in the comparison looking like any
          other. Gone once every scenario is in a set. */}
      {unassigned.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              Not in a set <span className="text-muted-foreground">({unassigned.length})</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {sets.length > 0
                ? "Created before scenario sets. Open a set and use Add an existing scenario to bring each one in — it then runs over the set's years."
                : "Created before scenario sets. Create a set, then add these to it from the set's page."}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="flex flex-wrap gap-2">
              {unassigned.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/scenario-planning/${s.id}`}
                    className="inline-flex items-center rounded-full border px-3 py-1 text-sm hover:border-primary/50 hover:text-primary"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Annual Budget"
          value={annualBudget != null ? formatCurrency(annualBudget, { compact: true }) : "—"}
          sublabel="Available / year"
          icon={Wallet}
        />
        <KpiCard
          label="Scenarios"
          value={formatNumber(scenarios.length)}
          sublabel={`Across ${formatNumber(sets.length)} set${sets.length === 1 ? "" : "s"}`}
          icon={GitCompare}
        />
        <KpiCard
          label="Best Final Condition"
          value={bestCondition?.finalAvgCondition != null ? String(bestCondition.finalAvgCondition) : "—"}
          sublabel={bestCondition?.name}
          icon={TrendingUp}
        />
        <KpiCard
          label="Fewest Failures"
          value={fewestFailures?.totalFailures != null ? formatNumber(fewestFailures.totalFailures) : "—"}
          sublabel={fewestFailures?.name}
          icon={DollarSign}
        />
      </div>

      <ScenarioComparison scenarios={scenarios} bands={conditionBands} />
    </div>
  );
}
