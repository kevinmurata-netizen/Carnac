import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listWeightSets } from "@/server/weight-sets";
import { listCategoryWeightSets } from "@/server/category-weight-sets";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { WeightSetList } from "./weight-set-list";
import { CategoryWeightList } from "./category-weight-list";
import { saveWeightSetAction, setDefaultWeightSetAction, deleteWeightSetAction } from "./actions";
import {
  saveCategoryWeightSetAction,
  setDefaultCategoryWeightSetAction,
  deleteCategoryWeightSetAction,
} from "./category-actions";

/**
 * Named weightings — two kinds, one card.
 *
 * **Benefit Weight** says how much condition, risk reduction and life-cycle
 * saving each count toward a treatment's Expected Benefit. They are shares of
 * one score, normalized, so 3/4/2/1 ranks identically to 30/40/20/10.
 *
 * **Category Weight** says how much a scenario leans toward one kind of work.
 * They are multipliers on the Priority Score and are not normalized, because 1
 * has to keep meaning "leave this category alone".
 *
 * The two sit together because they are chosen together — a scenario picks one
 * of each — and because keeping them on one card makes the difference between
 * a share and a multiplier something you read side by side rather than
 * discover.
 */
export default async function ScenarioWeightsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/scenario-weights", "Scenario Weights");
  const { canWrite: canEdit } = await requireCard("/settings/scenario-weights");

  const [sets, categorySets] = await Promise.all([
    listWeightSets(organizationId),
    listCategoryWeightSets(organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="What a scenario treats as valuable — how much condition, risk and life-cycle each count, and which kinds of work it leans toward"
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Scenario weights are read-only for your role.
        </div>
      )}

      <div className="space-y-6">
        <WeightSetList
          sets={sets}
          canEdit={canEdit}
          onSave={saveWeightSetAction}
          onSetDefault={setDefaultWeightSetAction}
          onDelete={deleteWeightSetAction}
        />

        <CategoryWeightList
          sets={categorySets}
          canEdit={canEdit}
          onSave={saveCategoryWeightSetAction}
          onSetDefault={setDefaultCategoryWeightSetAction}
          onDelete={deleteCategoryWeightSetAction}
        />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        The two answer different questions. A benefit weighting says what makes one treatment better than another on
        the merits; a category weighting says which kinds of work you want to do anyway. Keeping them apart means you
        can set the categories back to even and see what the model would have chosen on its own. Criticality is only
        read by the older weighted-sum ranking — the Criticality × Benefit ÷ Cost method applies it once as a
        multiplier and ignores that field.
      </p>
    </div>
  );
}
