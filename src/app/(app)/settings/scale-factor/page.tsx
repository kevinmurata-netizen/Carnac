import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getPageName } from "@/server/navigation";
import { getFormulaFields } from "@/server/criticality";
import { listScaleFactors } from "@/server/scale-factors";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { FormulaEditor, type FormulaVocabulary } from "@/components/formula/formula-editor";
import { ScaleFactorPreviewPanel } from "./scale-factor-preview";
import {
  saveScaleFactorAction,
  activateScaleFactorAction,
  deleteScaleFactorAction,
  previewScaleFactorAction,
} from "./actions";

const SCALE_FACTOR_WORDS: FormulaVocabulary = {
  noun: "scale factor",
  plural: "Scale factors",
  resultLabel: "Multiplier — not clamped, so length in feet is a perfectly good answer",
  namePlaceholder: "Segment length",
  expressionPlaceholder: "max(LENGTH, 500)",
  emptyState: (
    <>
      No scale factor yet. Until one is active every asset scales at 1, which means the Priority Score divides by
      total cost alone and a short segment beats a long one for the same work.
    </>
  ),
};

/**
 * The scale factor: how big a piece of work each asset represents.
 *
 * It is the term that stops the Priority Score preferring small jobs simply
 * because they are cheap. Dividing by total cost without it would rank a
 * twenty-foot stub above a half-mile main every time; multiplying by length
 * puts them back on the same footing, and an organization that measures size
 * some other way — customers served, diameter, a blend — can say so here
 * rather than living with an assumption baked into the code.
 */
export default async function ScaleFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/scale-factor");

  const [groups, title] = await Promise.all([
    listScaleFactors(organizationId),
    getPageName(organizationId, "/settings/scale-factor", "Scale Factor"),
  ]);

  const selected = groups.find((g) => g.assetTypeId === requested) ?? groups[0];
  const fields = selected ? await getFormulaFields(selected.assetTypeId) : [];

  return (
    <div>
      <PageHeader
        title={title}
        description="How big a piece of work each asset is — the term that keeps the ranking from preferring whatever is cheapest"
      />

      {!canEdit && (
        <Card className="mb-4 border-dashed bg-muted/40">
          <CardContent className="py-3 text-sm text-muted-foreground">
            You are signed in as {session!.user.roleName}. Scale factors are read-only for your role — you can still
            try one out to see what it would produce.
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No asset types are configured yet.
        </div>
      ) : (
        <>
          {groups.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const active = g.assetTypeId === selected?.assetTypeId;
                const live = g.models.find((m) => m.isActive);
                return (
                  <Link
                    key={g.assetTypeId}
                    href={`/settings/scale-factor?type=${g.assetTypeId}`}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-transparent bg-primary font-medium text-primary-foreground"
                        : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {g.assetTypeName}
                    <span className="ml-1.5 opacity-70">{live ? live.name : "none active"}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {selected && (
            <FormulaEditor
              key={selected.assetTypeId}
              assetTypeId={selected.assetTypeId}
              assetTypeName={selected.assetTypeName}
              assetCount={selected.assetCount}
              fields={fields}
              models={selected.models}
              canEdit={canEdit}
              save={saveScaleFactorAction}
              activate={activateScaleFactorAction}
              remove={deleteScaleFactorAction}
              preview={previewScaleFactorAction}
              vocabulary={SCALE_FACTOR_WORDS}
              renderPreview={ScaleFactorPreviewPanel}
            />
          )}
        </>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        The scale factor multiplies the Priority Score, so unlike a{" "}
        <Link href="/settings/criticality" className="text-primary hover:underline">
          criticality formula
        </Link>{" "}
        it is not squeezed onto a 0–100 scale — a segment 1,959 ft long scores 1,959 when the formula is{" "}
        <code className="font-mono">LENGTH</code>. An asset whose formula cannot be worked out falls back to 1 rather
        than 0, so a missing field never removes it from consideration entirely.
      </p>
    </div>
  );
}
