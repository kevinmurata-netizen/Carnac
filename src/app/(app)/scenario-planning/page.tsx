import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listScenarios, getAnnualBudget } from "@/server/scenarios";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ScenarioComparison } from "./scenario-comparison";
import { DollarSign, FolderKanban, GitCompare, Plus, TrendingUp, Wallet } from "lucide-react";
import { getConditionBands } from "@/server/settings";
import { getPageName } from "@/server/navigation";
import { listScenarioSets } from "@/server/scenario-sets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScenarioSetList } from "./sets/scenario-set-list";

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

  const withResults = scenarios.filter((s) => s.hasResults);
  const bestCondition = withResults.reduce<typeof withResults[number] | null>(
    (best, s) => (!best || (s.finalAvgCondition ?? 0) > (best.finalAvgCondition ?? 0) ? s : best),
    null
  );
  const fewestFailures = withResults.reduce<typeof withResults[number] | null>(
    (best, s) => (!best || (s.totalFailures ?? Infinity) < (best.totalFailures ?? Infinity) ? s : best),
    null
  );

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Run the network forward under different funding levels and strategies, and compare what actually happens"
        actions={
          canEdit && (
            // A page of its own rather than a form below the grid: a scenario
            // has a dozen inputs, and an empty one sitting under the
            // comparison read as part of it.
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <Link href="/scenario-planning/sets/new">
                    <FolderKanban className="mr-1 h-4 w-4" />
                    New Scenario Set
                  </Link>
                }
              />
              <Button
                size="sm"
                nativeButton={false}
                render={
                  <Link href="/scenario-planning/new">
                    <Plus className="mr-1 h-4 w-4" />
                    Add New Scenario
                  </Link>
                }
              />
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Annual Budget"
          value={annualBudget != null ? formatCurrency(annualBudget, { compact: true }) : "—"}
          sublabel="Available / year"
          icon={Wallet}
        />
        <KpiCard label="Scenarios" value={formatNumber(scenarios.length)} sublabel="Configured and run" icon={GitCompare} />
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

      {/* Above the comparison, because a set is how the comparison below is
          meant to be read: scenarios in one set share their years, and those
          outside any set do not. Hidden until the first set exists, so nobody
          meets an empty card for a feature they have not used. */}
      {sets.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>
              Scenario Sets <span className="text-muted-foreground">({sets.length})</span>
            </CardTitle>
            <Link href="/scenario-planning/sets" className="text-sm text-primary hover:underline">
              All sets
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <ScenarioSetList sets={sets} emptyText="No scenario sets yet." />
          </CardContent>
        </Card>
      )}

      <ScenarioComparison scenarios={scenarios} bands={conditionBands} />
    </div>
  );
}
