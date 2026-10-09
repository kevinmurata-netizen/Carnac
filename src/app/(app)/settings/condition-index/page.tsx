import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { findIndexModel, getConditionIndex } from "@/server/condition-model";
import { ModelNotSetUp } from "@/components/settings/model-not-set-up";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { IndexEditor } from "./index-editor";
import { formatNumber } from "@/lib/format";
import { Gauge, Layers, ListChecks } from "lucide-react";
import { getPageName } from "@/server/navigation";
import { chooseModelledAssetType } from "@/server/modelled-asset-type";
import { AssetTypePills } from "@/components/layout/asset-type-pills";

export default async function ConditionIndexPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: requestedType } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/condition-index", "Condition Index");
  const { canWrite: canEdit } = await requireCard("/settings/condition-index");

  // Each modelled asset type is scored by its own index.
  const { types, selected } = await chooseModelledAssetType(organizationId, requestedType);
  const pills = (
    <AssetTypePills types={types} selectedId={selected?.id} href={(id) => `/settings/condition-index?type=${id}`} />
  );
  if (selected && !(await findIndexModel(organizationId, selected.id))) {
    return (
      <div>
        <PageHeader title={pageTitle} description="The components and weights that produce every condition score" />
        {pills}
        <ModelNotSetUp typeName={selected.name} model="condition index" />
      </div>
    );
  }
  const config = await getConditionIndex(organizationId, selected?.id);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`${config.name} — the components and weights that produce every condition score`}
      />

      {pills}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Components"
          value={formatNumber(config.components.length)}
          sublabel={`Scale ${config.scaleMin}–${config.scaleMax}`}
          icon={Layers}
        />
        <KpiCard
          label="Scores Derived"
          value={formatNumber(config.measurementCount)}
          sublabel="Condition measurements using this index"
          icon={Gauge}
        />
        <KpiCard
          label="Unused Inspection Fields"
          value={formatNumber(config.unusedFields.length)}
          sublabel="Collected but not scored"
          icon={ListChecks}
        />
      </div>

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Only an Administrator can change the index, because
          reweighting it moves every condition score in the system.
        </div>
      )}

      <IndexEditor config={config} canEdit={canEdit} />
    </div>
  );
}
