import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getAnnualBudget } from "@/server/scenarios";
import { listFormulaChoices } from "@/server/criticality";
import { listWeightSets } from "@/server/weight-sets";
import { normalizeWeights } from "@/domain/waterline/optimization";
import { STRATEGIES, STRATEGY_DESCRIPTIONS, DEFAULT_ASSUMPTIONS } from "@/domain/waterline/scenario";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScenarioFields, toPercent } from "../scenario-fields";
import { createScenarioAction } from "../actions";

/**
 * Creating a scenario.
 *
 * This was a form below the comparison grid, which read as part of the grid
 * and put a dozen empty inputs under a table people came to read. On its own
 * page it can also carry the weighting choice without crowding anything.
 */
export default async function NewScenarioPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  if (!canRecordFieldData(session)) redirect("/scenario-planning");

  const [annualBudget, criticalityChoices, weightSets] = await Promise.all([
    getAnnualBudget(organizationId),
    listFormulaChoices(organizationId),
    listWeightSets(organizationId),
  ]);

  const weightSetChoices = weightSets.map((w) => {
    const n = normalizeWeights(w.weights);
    const pct = (v: number) => Math.round(v * 100);
    return {
      id: w.id,
      name: w.name,
      isDefault: w.isDefault,
      summary: `condition ${pct(n.conditionImprovement)}%, risk ${pct(n.riskReduction)}%, life-cycle ${pct(
        n.lifeCycleCost
      )}%`,
    };
  });

  return (
    <div>
      <PageHeader
        title="New Scenario"
        description="Funding, horizon and strategy — then it runs, and lands beside the others in the comparison"
      />

      <Card>
        <CardContent className="pt-6">
          <form action={createScenarioAction} className="space-y-4">
            <ScenarioFields
              criticalityChoices={criticalityChoices}
              weightSetChoices={weightSetChoices}
              defaults={{
                name: "",
                description: "",
                criticalityModelId: null,
                weightSetId: weightSets.find((w) => w.isDefault)?.id ?? null,
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

            {/* Creating runs the scenario immediately, so there is nothing
                half-made to come back to — Cancel is simply "not this". */}
            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/scenario-planning">Cancel</Link>}
              />
              <Button type="submit">Create &amp; Run Scenario</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
