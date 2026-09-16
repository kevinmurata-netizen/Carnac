import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireCard, canWriteCard } from "@/server/guard";
import { getTreatmentForAdmin } from "@/server/treatment-config";
import { listRules, getTreatmentRules } from "@/server/rules";
import { getTreatmentCosts } from "@/server/cost-rates";
import { listEffects, getTreatmentEffects } from "@/server/effects";
import { PageHeader } from "@/components/layout/page-header";
import { SectionGroup, CollapsibleSection } from "@/components/layout/collapsible-section";
import { TreatmentForm, TreatmentDangerZone } from "../treatment-form";
import { RuleTreeEditor } from "./rule-tree-editor";
import { CostEditor } from "./cost-editor";
import { EffectListEditor } from "./effect-list-editor";
import { setTreatmentRuleTreeAction, setTreatmentCostsAction, setTreatmentEffectsAction } from "./actions";
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

  const [treatment, allRules, selection, costs, allEffects, effects, canEditRules, canEditEffects] = await Promise.all([
    getTreatmentForAdmin(organizationId, id),
    listRules(organizationId),
    getTreatmentRules(organizationId, id),
    getTreatmentCosts(organizationId, id),
    listEffects(organizationId),
    getTreatmentEffects(organizationId, id),
    // Rules and effects are their own cards, so writing them is their own
    // permission — separate from arranging them on this treatment.
    canWriteCard("/settings/treatment-rules"),
    canWriteCard("/settings/treatment-effects"),
  ]);
  if (!treatment || !selection || !costs || !effects) notFound();

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
        {/* Renders the Definition section. */}
        {canEdit ? (
          <TreatmentForm treatment={treatment} />
        ) : (
          <CollapsibleSection id="definition" title="Treatment Definition">
            <p className="text-sm text-muted-foreground">
              {treatment.category} · {treatment.usefulLife} year useful life
            </p>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          id="does"
          title="What it does"
          description="Its effects on condition, failure probability and remaining life — the numbers every recommendation and life-cycle comparison is built from. Click an effect to edit it."
        >
          <EffectListEditor
            allEffects={allEffects}
            initialIds={effects.effects.map((e) => e.id)}
            treatmentName={treatment.name}
            canEdit={canEdit}
            canEditEffects={canEditEffects}
            onSave={setTreatmentEffectsAction.bind(null, treatment.id)}
          />
        </CollapsibleSection>

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
            canEditRules={canEditRules}
            onSave={setTreatmentCostsAction.bind(null, treatment.id)}
          />
        </CollapsibleSection>

        <CollapsibleSection
          id="rules"
          title="When it can be used"
          description="How the rules combine to decide whether this treatment is considered. Click a rule to edit it."
        >
          <RuleTreeEditor
            allRules={allRules}
            initialTree={selection.tree}
            initialBlockIds={selection.blocks.map((r) => r.id)}
            canEdit={canEdit}
            canEditRules={canEditRules}
            onSave={setTreatmentRuleTreeAction.bind(null, treatment.id)}
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
