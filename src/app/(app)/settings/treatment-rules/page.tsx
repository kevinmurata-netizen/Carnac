import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listRules } from "@/server/rules";
import { PageHeader } from "@/components/layout/page-header";
import { getPageName } from "@/server/navigation";
import { RuleWorkspace } from "./rule-workspace";

/**
 * Named conditions that decide whether an asset qualifies for a treatment.
 * The editor opens over the list — see RuleWorkspace — and loads its sample
 * segments as it opens, so the list itself stays quick.
 */
export default async function TreatmentRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ rule?: string }>;
}) {
  const { rule: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/treatment-rules");
  const pageTitle = await getPageName(organizationId, "/settings/treatment-rules", "Treatment Rules");

  const rules = await listRules(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Named conditions that decide whether an asset qualifies for a treatment. A rule is written once here and attached to as many treatments as it applies to."
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatment rules are read-only for your role.
        </div>
      )}

      <RuleWorkspace rules={rules} canEdit={canEdit} initialOpen={requested ?? null} />
    </div>
  );
}
