import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getPageName } from "@/server/navigation";
import { listFundingPlans } from "@/server/category-funding";
import { PageHeader } from "@/components/layout/page-header";
import { FundingPlanList } from "./funding-plan-list";
import { saveFundingPlanAction, setDefaultFundingPlanAction, deleteFundingPlanAction } from "./actions";

/**
 * Category funding: the most of a year's budget each kind of work may take.
 *
 * Its own card rather than a third section on Scenario Weights, because the
 * two do genuinely different jobs and sharing a page had them read as one
 * setting with two halves. A category *weight* multiplies the Priority Score
 * and changes what scores highest. A funding share changes nothing about the
 * scores and limits what gets bought.
 */
export default async function CategoryFundingPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const [pageTitle, plans] = await Promise.all([
    getPageName(organizationId, "/settings/category-funding", "Category Funding"),
    listFundingPlans(organizationId),
  ]);
  const { canWrite: canEdit } = await requireCard("/settings/category-funding");

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="The most of each year's budget each kind of work may take"
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Category funding is read-only for your role.
        </div>
      )}

      <FundingPlanList
        plans={plans}
        canEdit={canEdit}
        onSave={saveFundingPlanAction}
        onSetDefault={setDefaultFundingPlanAction}
        onDelete={deleteFundingPlanAction}
      />

      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <p>
          Shares are of the whole year, not of each other, so they need not add up to 100%. A share is a limit, not a
          turn: the year&apos;s work is chosen across every category at once, by what each step up adds for its extra
          cost, and a category is simply not funded past its share. The order categories are listed in makes no
          difference.
        </p>
        <p>
          This is not the same thing as a{" "}
          <Link href="/settings/scenario-weights" className="text-primary hover:underline">
            category weighting
          </Link>
          . A weighting multiplies the Priority Score and so changes what scores highest; a funding plan changes
          nothing about the scores and limits what the money actually buys. A utility can weight renewals highly and
          still cap them at a fifth of the year.
        </p>
      </div>
    </div>
  );
}
