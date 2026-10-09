import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listDeteriorationModels, getMarkovConfig } from "@/server/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DeteriorationModelList } from "./model-list";
import { formatNumber } from "@/lib/format";
import { getPageName } from "@/server/navigation";
import { ActiveToggle } from "@/components/settings/active-toggle";
import { toggleDeteriorationActiveAction } from "../actions";
import { listComponentCurves } from "@/server/component-deterioration";
import { ComponentCurveList } from "./component-curve-list";
import { chooseModelledAssetType } from "@/server/modelled-asset-type";
import { AssetTypePills } from "@/components/layout/asset-type-pills";

export default async function DeteriorationModelSettingsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: requestedType } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/deterioration-models", "Deterioration Models");
  const { canWrite: canEdit } = await requireCard("/settings/deterioration-models");

  // Material curves and the Markov matrix belong to one modelled asset type;
  // component curves, below, already say which kind of asset they are for.
  const { types, selected } = await chooseModelledAssetType(organizationId, requestedType);
  const [models, markov, componentCurves] = await Promise.all([
    listDeteriorationModels(organizationId, selected?.id),
    getMarkovConfig(organizationId, selected?.id),
    listComponentCurves(organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Service life and curve shape per material and per component — what every condition forecast projects against"
      />

      <AssetTypePills
        types={types}
        selectedId={selected?.id}
        href={(id) => `/settings/deterioration-models?type=${id}`}
      />

      <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        An inactive model is skipped entirely, and its material falls back to the default 75-year curve rather than
        continuing to shape forecasts invisibly. Edits apply to the next forecast, work plan generation or scenario
        run; stored predictions keep the curve they were produced with.
      </div>

      {canEdit ? (
        <DeteriorationModelList models={models} markov={markov} />
      ) : (
        <Card>
          <CardContent className="space-y-3 py-6 text-sm">
            <div className="text-muted-foreground">
              You are signed in as {session!.user.roleName}. Deterioration models are read-only for your role.
            </div>
            {models.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="font-medium text-foreground">{m.name}</span>
                <ActiveToggle id={m.id} isActive={m.isActive} action={toggleDeteriorationActiveAction} readOnly />
                <span className="text-xs text-muted-foreground">
                  {m.curve.serviceLife} yr life · shape {m.curve.shape} · {formatNumber(m.predictionCount)} predictions
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {componentCurves.length > 0 && (
        <div className="mt-8 space-y-3">
          <div>
            <h2 className="text-base font-semibold">Component curves</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              How each part of a reservoir, well or station wears out, one curve per component on each kind of asset.
              A component&apos;s forecast starts from its last inspection, aged by the years since, and the asset&apos;s
              own forecast is rolled up from its components&apos; under its roll-up strategy — see any facility&apos;s
              Deterioration tab. A switched-off curve falls back to the component&apos;s typical service life.
            </p>
          </div>
          {canEdit ? (
            <ComponentCurveList curves={componentCurves} />
          ) : (
            <Card>
              <CardContent className="space-y-3 py-6 text-sm">
                {componentCurves.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 border-t pt-3 first:border-t-0 first:pt-0">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <ActiveToggle id={c.id} isActive={c.isActive} action={toggleDeteriorationActiveAction} readOnly />
                    <span className="text-xs text-muted-foreground">
                      {c.curve.serviceLife} yr life · shape {c.curve.shape} · {formatNumber(c.componentCount)} components
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
