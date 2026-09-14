import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getAnnualBudget } from "@/server/scenarios";
import { listFormulaChoices } from "@/server/criticality";
import { listWeightSets } from "@/server/weight-sets";
import { listCategoryWeightSets, toCategoryChoice } from "@/server/category-weight-sets";
import { getScenarioOptionCatalogue } from "@/server/scenario-options";
import { listFundingPlans, describeFundingPlan } from "@/server/category-funding";
import { normalizeWeights } from "@/domain/waterline/optimization";
import { DEFAULT_ASSUMPTIONS } from "@/domain/waterline/scenario";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { toPercent } from "@/lib/format";
import { ScenarioCreateForm } from "../scenario-form";
import { createScenarioAction } from "../actions";
import { estimateNewRunMs } from "@/server/run-estimate";
import { getScenarioSet } from "@/server/scenario-sets";
import { STATUS_LABELS } from "@/lib/scenario-sets";

/**
 * Creating a scenario, always inside a scenario set.
 *
 * Sets come first: this page is reached from a set's Add Scenario button, and
 * without a set to create in it sends the reader back to choose or create one.
 * A scenario with nowhere to belong is what sets-first exists to prevent.
 *
 * This was once a form below the comparison grid, which read as part of the
 * grid. On its own page it can carry the weighting choices without crowding.
 */
export default async function NewScenarioPage({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const { set: requestedSet } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  if (!canRecordFieldData(session)) redirect("/scenario-planning");

  // Archived sets are kept for the record, not for new work.
  const set = requestedSet ? await getScenarioSet(organizationId, requestedSet) : null;
  if (!set || set.status === "ARCHIVED") redirect("/scenario-planning");

  const [annualBudget, criticalityChoices, weightSets, categoryWeightSets, fundingPlans, catalogue, estimate] =
    await Promise.all([
    getAnnualBudget(organizationId),
    listFormulaChoices(organizationId),
    listWeightSets(organizationId),
    listCategoryWeightSets(organizationId),
    listFundingPlans(organizationId),
    getScenarioOptionCatalogue(organizationId),
    // The set's period, since that is what the run will cover. The first run
    // then measures itself and every later estimate comes from that.
    estimateNewRunMs(organizationId, set.planningPeriodYears),
    ]);

  const scenarioSetChoices = [
    {
      id: set.id,
      name: set.name,
      baseYear: set.baseYear,
      planningPeriodYears: set.planningPeriodYears,
      statusLabel: STATUS_LABELS[set.status],
    },
  ];

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
  const fundingPlanChoices = fundingPlans.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    summary: describeFundingPlan(p),
  }));

  return (
    <div>
      <PageHeader
        title="New Scenario"
        description={`In ${set.name} — funding and strategy, then it runs over ${set.baseYear}–${
          set.baseYear + set.planningPeriodYears - 1
        } and lands beside the set's other scenarios`}
      />

      <Card>
        <CardContent className="pt-6">
          <ScenarioCreateForm
            action={createScenarioAction}
            estimate={estimate}
            criticalityChoices={criticalityChoices}
            weightSetChoices={weightSetChoices}
            categoryWeightSetChoices={categoryWeightSetChoices}
            fundingPlanChoices={fundingPlanChoices}
            scenarioSetChoices={scenarioSetChoices}
            treatmentChoices={catalogue.treatments}
            combinationChoices={catalogue.combinations}
            defaults={{
              name: "",
              description: "",
              criticalityModelId: null,
              weightSetId: weightSets.find((w) => w.isDefault)?.id ?? null,
              categoryWeightSetId: categoryWeightSets.find((c) => c.isDefault)?.id ?? null,
              categoryFundingPlanId: fundingPlans.find((p) => p.isDefault)?.id ?? null,
              scenarioSetId: set.id,
              annualBudget: annualBudget ?? DEFAULT_ASSUMPTIONS.annualBudget,
              fundingGrowthPct: toPercent(DEFAULT_ASSUMPTIONS.fundingGrowth),
              discountRatePct: toPercent(DEFAULT_ASSUMPTIONS.discountRate),
              // Stored as the scenario's own period too, so it matches the set
              // it was made for. The set governs while it is a member.
              analysisPeriodYears: set.planningPeriodYears,
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
