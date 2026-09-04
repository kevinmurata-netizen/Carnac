import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getPageName } from "@/server/navigation";
import { getFormulaFields, listCriticalityModels } from "@/server/criticality";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { FormulaEditor } from "./formula-editor";
import { RecomputeButton } from "../recompute-button";
import { recomputeRiskAction } from "../actions";
import { saveFormulaAction, activateFormulaAction, deleteFormulaAction, previewFormulaAction } from "./actions";

/**
 * Criticality formulas, one asset type at a time.
 *
 * Criticality is what decides which projects a work plan funds first, and
 * until this screen existed it was defined implicitly — a rescale of the risk
 * model's consequence-of-failure rating, with no way to say that a hospital
 * main matters more than a residential one except by reweighting risk itself.
 */
export default async function CriticalityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/criticality");

  const [groups, title] = await Promise.all([
    listCriticalityModels(organizationId),
    getPageName(organizationId, "/settings/criticality", "Criticality"),
  ]);

  const selected = groups.find((g) => g.assetTypeId === requested) ?? groups[0];
  const fields = selected ? await getFormulaFields(selected.assetTypeId) : [];

  return (
    <div>
      <PageHeader
        title={title}
        description="How much each asset matters, worked out from its own fields — the ranking behind which projects get funded first"
      />

      {!canEdit && (
        <Card className="mb-4 border-dashed bg-muted/40">
          <CardContent className="py-3 text-sm text-muted-foreground">
            You are signed in as {session!.user.roleName}. Criticality formulas are read-only for your role — you can
            still try one out to see what it would produce.
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <RecomputeButton
              action={recomputeRiskAction}
              hint="A formula only changes anything once the model runs. This scores every asset with the active formula, and recomputes risk at the same time."
            />
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
                    href={`/settings/criticality?type=${g.assetTypeId}`}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-transparent bg-primary font-medium text-primary-foreground"
                        : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {g.assetTypeName}
                    <span className="ml-1.5 opacity-70">{live ? live.name : "no formula"}</span>
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
              save={saveFormulaAction}
              activate={activateFormulaAction}
              remove={deleteFormulaAction}
              preview={previewFormulaAction}
            />
          )}
        </>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Scores are worked out when the model next runs, and land on a 0–100 scale so asset types with different
        formulas still rank against each other. An asset type with no active formula keeps the older behaviour, where
        criticality is a rescale of the{" "}
        <Link href="/settings/risk-models" className="text-primary hover:underline">
          risk model&apos;s
        </Link>{" "}
        consequence-of-failure rating.
      </p>
    </div>
  );
}
