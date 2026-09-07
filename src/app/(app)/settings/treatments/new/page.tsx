import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listRules } from "@/server/rules";
import { emptyRuleGroup } from "@/domain/waterline/decision-tree";
import { PageHeader } from "@/components/layout/page-header";
import { NewTreatmentForm } from "./new-treatment";

/**
 * Creating a treatment, with the same four sections as the page for an
 * existing one — definition, effects, prices, and when it can be used.
 *
 * Those sections used to be a blank form under the library table, which could
 * only ever offer the first two: prices and rules need a treatment to hang
 * from. Here they are held as a draft and written together, so a treatment is
 * complete the moment it exists rather than arriving priceless and ungated.
 */
export default async function NewTreatmentPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/treatments");
  if (!canEdit) redirect("/settings/treatments");

  const rules = await listRules(organizationId);

  return (
    <div>
      {/* No SetBreadcrumb: the trail only takes a supplied label for a record
          id, and "new" already reads as New on its own. */}
      <PageHeader
        title="New Treatment"
        description="Everything a treatment needs to be used: what it is, what it does, what it costs, and when it applies"
      />

      {/* Built here rather than inside the client component: the empty group
          carries a generated id, and generating it during a client render
          would give the server and the browser two different ids. */}
      <NewTreatmentForm allRules={rules} emptyTree={emptyRuleGroup("AND")} />
    </div>
  );
}
