import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getConditionIndex } from "@/server/condition-model";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { IndexEditor } from "./index-editor";
import { formatNumber } from "@/lib/format";
import { Gauge, Layers, ListChecks } from "lucide-react";
import { getPageName } from "@/server/navigation";

export default async function ConditionIndexPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/condition-index", "Condition Index");
  const { canWrite: canEdit } = await requireCard("/settings/condition-index");

  const config = await getConditionIndex(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`${config.name} — the components and weights that produce every condition score`}
      />

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
