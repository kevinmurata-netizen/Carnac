import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listScenarios, getAnnualBudget } from "@/server/scenarios";
import { STRATEGIES, STRATEGY_DESCRIPTIONS, DEFAULT_ASSUMPTIONS } from "@/domain/waterline/scenario";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ScenarioComparison } from "./scenario-comparison";
import { ScenarioFields, toPercent } from "./scenario-fields";
import { createScenarioAction } from "./actions";
import { DollarSign, GitCompare, TrendingUp, Wallet } from "lucide-react";
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

      {canEdit && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Create a Scenario</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createScenarioAction} className="space-y-4">
              <ScenarioFields
                defaults={{
                  name: "",
                  description: "",
                  annualBudget: annualBudget ?? DEFAULT_ASSUMPTIONS.annualBudget,
                  fundingGrowthPct: toPercent(DEFAULT_ASSUMPTIONS.fundingGrowth),
                  discountRatePct: toPercent(DEFAULT_ASSUMPTIONS.discountRate),
                  analysisPeriodYears: DEFAULT_ASSUMPTIONS.analysisPeriodYears,
                  conditionTarget: DEFAULT_ASSUMPTIONS.conditionTarget,
                  riskThreshold: DEFAULT_ASSUMPTIONS.riskThreshold,
                  strategy: "risk-based",
                }}
              />

              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <div className="mb-1 font-medium text-foreground">Strategies</div>
                <ul className="space-y-0.5">
                  {STRATEGIES.map((s) => (
                    <li key={s}>
                      <span className="font-medium">{s}</span> — {STRATEGY_DESCRIPTIONS[s]}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end">
                <Button type="submit">Create &amp; Run Scenario</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
