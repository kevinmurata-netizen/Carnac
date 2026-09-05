import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getTreatmentForAdmin } from "@/server/treatment-config";
import { listRules, getTreatmentRules } from "@/server/rules";
import { PageHeader } from "@/components/layout/page-header";
import { TreatmentForm } from "../treatment-form";
import { RulePicker } from "./rule-picker";
import { setTreatmentRulesAction } from "./actions";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";

export default async function TreatmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/treatments");

  const [treatment, allRules, selection] = await Promise.all([
    getTreatmentForAdmin(organizationId, id),
    listRules(organizationId),
    getTreatmentRules(organizationId, id),
  ]);
  if (!treatment || !selection) notFound();

  return (
    <div>
      <SetBreadcrumb segment={id} label={treatment.name} />
      <PageHeader
        title={treatment.name}
        description={treatment.description || "Treatment definition, applicability and costs"}
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatments are read-only for your role.
        </div>
      )}

      <div className="space-y-4">
        <RulePicker
          treatmentName={treatment.name}
          allRules={allRules}
          attachedIds={selection.attached.map((r) => r.id)}
          qualifyMode={selection.qualifyMode}
          canEdit={canEdit}
          onSave={setTreatmentRulesAction.bind(null, treatment.id)}
        />

        {canEdit ? (
          <TreatmentForm mode="edit" treatment={treatment} />
        ) : (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            ${treatment.unitCost} {treatment.costUnit} · {treatment.expectedLifeExtension} years of added life ·{" "}
            {treatment.ruleCount} rule{treatment.ruleCount === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}
