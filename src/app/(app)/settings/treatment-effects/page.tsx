import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listEffects } from "@/server/effects";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EffectWorkspace } from "./effect-workspace";

/**
 * Treatment effects: what a treatment does to condition, failure probability
 * and remaining life, written once and shared — the same arrangement as
 * Treatment Rules. A treatment can carry several; see
 * domain/waterline/effect.ts for how they combine.
 */
export default async function TreatmentEffectsPage({
  searchParams,
}: {
  searchParams: Promise<{ effect?: string }>;
}) {
  const { effect: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/treatment-effects");
  const pageTitle = await getPageName(organizationId, "/settings/treatment-effects", "Treatment Effects");

  const effects = await listEffects(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="What a treatment does to condition, failure probability and remaining life. Written once here and added to as many treatments as it applies to; a treatment with several combines them."
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatment effects are read-only for your role.
        </div>
      )}

      <EffectWorkspace effects={effects} canEdit={canEdit} initialOpen={requested ?? null} />
    </div>
  );
}
