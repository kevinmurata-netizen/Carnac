import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getPageName } from "@/server/navigation";
import { listFundingPlans } from "@/server/category-funding";
import { PageHeader } from "@/components/layout/page-header";
import { FundingPlanList } from "./funding-plan-list";
import { saveFundingPlanAction, setDefaultFundingPlanAction, deleteFundingPlanAction } from "./actions";

/**
 * Category funding: how a year's budget is divided, and what spends first.
 *
 * Its own card rather than a third section on Scenario Weights, because the
 * two do genuinely different jobs and sharing a page had them read as one
 * setting with two halves. A category *weight* multiplies the Priority Score
 * and changes the order of the ranked list. A funding share changes nothing
 * about the ranking and everything about what gets bought.
 *
 * The order is the part worth pausing on. Spending works through the
 * categories one at a time, so the plan is not only "how much repair" but
 * "repair before renewal" — and with a fixed budget those are different
 * questions with different answers.
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
        description="How a year's budget is divided between kinds of work, and which kind is funded first"
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
          Shares are of the whole year, not of each other, so they need not add up to 100%. Leaving the last category
          at 100% is the usual arrangement: it takes whatever the ones before it did not, rather than letting a
          shortfall go unspent.
        </p>
        <p>
          This is not the same thing as a{" "}
          <Link href="/settings/scenario-weights" className="text-primary hover:underline">
            category weighting
          </Link>
          . A weighting multiplies the Priority Score and so changes what ranks first; a funding plan changes nothing
          about the ranking and decides what the money actually buys. A utility can rank renewals highly and still cap
          them at a fifth of the year.
        </p>
      </div>
    </div>
  );
}
