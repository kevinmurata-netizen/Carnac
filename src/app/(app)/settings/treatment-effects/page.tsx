import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listEffects } from "@/server/effects";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EffectList } from "./effect-list";
import { EffectPageEditor } from "./effect-page-editor";
import { BLANK_EFFECT, type EffectDraft } from "./effect-editor";

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
  const selected = requested && requested !== "new" ? effects.find((e) => e.id === requested) : undefined;

  const draft: EffectDraft | null =
    requested === "new" && canEdit
      ? BLANK_EFFECT
      : selected
        ? {
            id: selected.id,
            name: selected.name,
            description: selected.description ?? "",
            conditionMode: selected.conditionMode,
            conditionValue: selected.conditionValue == null ? "" : String(selected.conditionValue),
            failureProbMultiplier: String(selected.failureProbMultiplier),
            expectedLifeExtension: String(selected.expectedLifeExtension),
          }
        : null;

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

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle>
              Effects <span className="text-muted-foreground">({effects.length})</span>
            </CardTitle>
            {canEdit && (
              <Link
                href="/settings/treatment-effects?effect=new"
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                New effect
              </Link>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {effects.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No effects yet. A treatment with none changes nothing about condition or risk.
              </p>
            ) : (
              <EffectList effects={effects} selectedId={selected?.id ?? null} canEdit={canEdit} />
            )}
          </CardContent>
        </Card>

        {draft && canEdit && (
          <Card>
            <CardHeader>
              <CardTitle>{draft.id ? `Edit ${draft.name}` : "New effect"}</CardTitle>
            </CardHeader>
            <CardContent>
              <EffectPageEditor key={draft.id ?? "new"} initial={draft} usedBy={selected?.usedBy ?? []} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
