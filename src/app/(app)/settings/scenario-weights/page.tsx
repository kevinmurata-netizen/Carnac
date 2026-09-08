import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listWeightSets } from "@/server/weight-sets";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { WeightSetList } from "./weight-set-list";
import { saveWeightSetAction, setDefaultWeightSetAction, deleteWeightSetAction } from "./actions";

/**
 * Named weightings.
 *
 * The weights decide what the model calls "best". They were four numbers typed
 * into the Generate Work Plan form and stored nowhere, so no two runs could be
 * compared on the policy behind them. Here they are rows with names.
 */
export default async function ScenarioWeightsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/scenario-weights", "Scenario Weights");
  const { canWrite: canEdit } = await requireCard("/settings/scenario-weights");

  const sets = await listWeightSets(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="How much condition, risk and life-cycle cost each count when work is ranked"
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Scenario weights are read-only for your role.
        </div>
      )}

      <WeightSetList
        sets={sets}
        canEdit={canEdit}
        onSave={saveWeightSetAction}
        onSetDefault={setDefaultWeightSetAction}
        onDelete={deleteWeightSetAction}
      />

      <p className="mt-3 text-xs text-muted-foreground">
        Weights are normalized, so 30/40/20/10 and 3/4/2/1 rank identically. Criticality is only read by the existing
        weighted-sum ranking; the Criticality × Benefit ÷ Cost method applies criticality once as a multiplier and
        ignores it.
      </p>
    </div>
  );
}
