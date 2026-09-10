import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getAnnualBudget } from "@/server/scenarios";
import { listFormulaChoices } from "@/server/criticality";
import { listWeightSets } from "@/server/weight-sets";
import { listCategoryWeightSets, toCategoryChoice } from "@/server/category-weight-sets";
import { normalizeWeights } from "@/domain/waterline/optimization";
import { DEFAULT_ASSUMPTIONS } from "@/domain/waterline/scenario";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { toPercent } from "@/lib/format";
import { ScenarioCreateForm } from "../scenario-form";
import { createScenarioAction } from "../actions";
import { estimateNewRunMs } from "@/server/run-estimate";

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

  const [annualBudget, criticalityChoices, weightSets, categoryWeightSets, estimate] = await Promise.all([
    getAnnualBudget(organizationId),
    listFormulaChoices(organizationId),
    listWeightSets(organizationId),
    listCategoryWeightSets(organizationId),
    // The form's default period, since nothing has been entered yet. Whatever
    // the reader picks, the first run measures itself and every later estimate
    // for this scenario comes from that.
    estimateNewRunMs(organizationId, DEFAULT_ASSUMPTIONS.analysisPeriodYears),
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

  const categoryWeightSetChoices = categoryWeightSets.map(toCategoryChoice);

  return (
    <div>
      <PageHeader
        title="New Scenario"
        description="Funding, horizon and strategy — then it runs, and lands beside the others in the comparison"
      />

      <Card>
        <CardContent className="pt-6">
          <ScenarioCreateForm
            action={createScenarioAction}
            estimate={estimate}
            criticalityChoices={criticalityChoices}
            weightSetChoices={weightSetChoices}
            categoryWeightSetChoices={categoryWeightSetChoices}
            defaults={{
              name: "",
              description: "",
              criticalityModelId: null,
              weightSetId: weightSets.find((w) => w.isDefault)?.id ?? null,
              categoryWeightSetId: categoryWeightSets.find((c) => c.isDefault)?.id ?? null,
              annualBudget: annualBudget ?? DEFAULT_ASSUMPTIONS.annualBudget,
              fundingGrowthPct: toPercent(DEFAULT_ASSUMPTIONS.fundingGrowth),
              discountRatePct: toPercent(DEFAULT_ASSUMPTIONS.discountRate),
              analysisPeriodYears: DEFAULT_ASSUMPTIONS.analysisPeriodYears,
              conditionTarget: DEFAULT_ASSUMPTIONS.conditionTarget,
              riskThreshold: DEFAULT_ASSUMPTIONS.riskThreshold,
              strategy: "risk-based",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
