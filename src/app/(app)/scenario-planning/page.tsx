import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listScenarios, getAnnualBudget } from "@/server/scenarios";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ScenarioComparison } from "./scenario-comparison";
import { DollarSign, GitCompare, Plus, TrendingUp, Wallet } from "lucide-react";
import { getConditionBands } from "@/server/settings";
import { getPageName } from "@/server/navigation";

export default async function ScenarioPlanningPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/scenario-planning", "Scenario Planning");
  const conditionBands = await getConditionBands(organizationId);

  const [scenarios, annualBudget] = await Promise.all([
    listScenarios(organizationId),
    getAnnualBudget(organizationId),
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

      <ScenarioComparison scenarios={scenarios} bands={conditionBands} />
    </div>
  );
}
