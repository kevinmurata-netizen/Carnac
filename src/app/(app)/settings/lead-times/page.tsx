import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getPageName } from "@/server/navigation";
import { listLeadTimeSets } from "@/server/lead-times";
import { listTreatments } from "@/server/treatments";
import { CATEGORY_KEYS } from "@/domain/waterline/category-weight";
import type { TreatmentCategory } from "@/domain/waterline/treatment";
import { PageHeader } from "@/components/layout/page-header";
import { LeadTimeList } from "./lead-time-list";
import {
  saveLeadTimeSetAction,
  setDefaultLeadTimeSetAction,
  copyLeadTimeSetAction,
  deleteLeadTimeSetAction,
} from "./actions";

/**
 * Delivery lead times: how long work takes to be paid for and built.
 *
 * A leak repair is decided, paid for and done in one year. A replacement is
 * programmed years before the money moves and years more before anyone digs.
 *
 * A scenario runs by the set chosen on it; one with none chosen behaves as
 * every scenario did before these existed. See domain/waterline/lead-time.ts
 * for what the offsets mean and delivery-scenario.ts for what spends by them.
 */
export default async function LeadTimesPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const [pageTitle, sets, treatments] = await Promise.all([
    getPageName(organizationId, "/settings/lead-times", "Delivery Lead Times"),
    listLeadTimeSets(organizationId),
    listTreatments(organizationId),
  ]);
  const { canWrite: canEdit } = await requireCard("/settings/lead-times");

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="How long after work is decided its money leaves the budget, and how long before it is built"
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Delivery lead times are read-only for your role.
        </div>
      )}

      <LeadTimeList
        sets={sets}
        treatments={treatments.map((t) => ({
          id: t.id,
          name: t.name,
          category: (CATEGORY_KEYS as readonly string[]).includes(t.category)
            ? (t.category as TreatmentCategory)
            : "Repair",
        }))}
        thisYear={new Date().getFullYear()}
        canEdit={canEdit}
        onSave={saveLeadTimeSetAction}
        onSetDefault={setDefaultLeadTimeSetAction}
        onCopy={copyLeadTimeSetAction}
        onDelete={deleteLeadTimeSetAction}
      />

      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <p>
          A scenario runs by the set chosen on it: it programs work in one year, draws the money in another and
          improves the network in a third, judging each option against the segment it will meet in the year it would
          be built. A scenario with none chosen decides, pays for and builds in the same year, as every scenario did
          before these existed.
        </p>
        <p>
          Both figures count from the year a scenario decides to do the work. Repair 0 and 0 means a repair is decided,
          paid for and built in the same year. Renew funded +2 and built +6 means a renewal decided in{" "}
          {new Date().getFullYear()} draws its money in {new Date().getFullYear() + 2} and improves the network in{" "}
          {new Date().getFullYear() + 6}.
        </p>
        <p>
          A set is a policy, not a fact about the network — which is why they are named and chosen, like a{" "}
          <Link href="/settings/scenario-weights" className="text-primary hover:underline">
            weighting
          </Link>
          . &quot;Renewals take six years&quot; and &quot;renewals take three&quot; are two runs over the same data
          rather than an edit.
        </p>
      </div>
    </div>
  );
}
