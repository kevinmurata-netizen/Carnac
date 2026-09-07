import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getTreatmentForAdmin } from "@/server/treatment-config";
import { listRules, getTreatmentRules } from "@/server/rules";
import { getTreatmentCosts } from "@/server/cost-rates";
import { PageHeader } from "@/components/layout/page-header";
import { SectionGroup, CollapsibleSection } from "@/components/layout/collapsible-section";
import { TreatmentForm, TreatmentDangerZone } from "../treatment-form";
import { RulePicker } from "./rule-picker";
import { CostEditor } from "./cost-editor";
import { setTreatmentRulesAction, setTreatmentCostsAction } from "./actions";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";

/**
 * Ordered outwards from the treatment itself: what it is, what it does, what
 * it costs, and last when it may be used — which is the part most likely to be
 * long, and the part you change least often.
 */
const SECTION_IDS = ["definition", "does", "costs", "rules"];

export default async function TreatmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/treatments");

  const [treatment, allRules, selection, costs] = await Promise.all([
    getTreatmentForAdmin(organizationId, id),
    listRules(organizationId),
    getTreatmentRules(organizationId, id),
    getTreatmentCosts(organizationId, id),
  ]);
  if (!treatment || !selection || !costs) notFound();

  return (
    <div>
      <SetBreadcrumb segment={id} label={treatment.name} />
      <PageHeader
        title={treatment.name}
        description={treatment.description || "Treatment definition, effects, costs and rules"}
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatments are read-only for your role.
        </div>
      )}

      <SectionGroup ids={SECTION_IDS}>
        {/* Renders the Definition and What it does sections; they are one form
            and save together. */}
        {canEdit ? (
          <TreatmentForm mode="edit" treatment={treatment} />
        ) : (
          <CollapsibleSection id="definition" title="Treatment Definition">
            <p className="text-sm text-muted-foreground">
              {treatment.category} · {treatment.usefulLife} year useful life ·{" "}
              {treatment.conditionResetTo != null
                ? `resets condition to ${treatment.conditionResetTo}`
                : treatment.conditionGain != null
                  ? `adds ${treatment.conditionGain} condition points`
                  : "no condition effect"}{" "}
              · failure probability ×{treatment.failureProbMultiplier}
            </p>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          id="costs"
          title="What it costs"
          description="Prices tried top to bottom — the first whose rule matches is charged."
        >
          <CostEditor
            treatmentName={treatment.name}
            initial={costs.rates}
            rules={allRules}
            canEdit={canEdit}
            onSave={setTreatmentCostsAction.bind(null, treatment.id)}
          />
        </CollapsibleSection>

        <CollapsibleSection
          id="rules"
          title="When it can be used"
          description="The rules an asset has to satisfy before this treatment is considered for it."
        >
          <RulePicker
            treatmentName={treatment.name}
            allRules={allRules}
            attachedIds={selection.attached.map((r) => r.id)}
            qualifyMode={selection.qualifyMode}
            canEdit={canEdit}
            onSave={setTreatmentRulesAction.bind(null, treatment.id)}
          />
        </CollapsibleSection>
      </SectionGroup>

      {canEdit && (
        <div className="mt-4">
          <TreatmentDangerZone treatment={treatment} />
        </div>
      )}
    </div>
  );
}
