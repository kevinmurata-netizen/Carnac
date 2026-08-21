import { auth } from "@/lib/auth";
import { getConditionModelConfig } from "@/server/settings";
import { listMetrics, listMetricSources } from "@/server/metrics";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ConditionModelEditor } from "./editor";
import { MetricEditor, NewMetricForm } from "./metrics-editor";
import { formatNumber } from "@/lib/format";

export default async function MetricsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/condition-models", "Metrics");
  const isAdmin = session!.user.roleName === "Administrator";

  const [config, metrics, sources] = await Promise.all([
    getConditionModelConfig(organizationId),
    listMetrics(organizationId),
    isAdmin ? listMetricSources(organizationId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="The condition scale and its bands, plus any metric built on an inspection or inventory field"
      />

      {isAdmin ? (
        <>
          <ConditionModelEditor config={config} />

          <h2 className="mb-2 mt-6 text-sm font-medium text-foreground">
            Metrics <span className="text-muted-foreground">({metrics.length})</span>
          </h2>
          {metrics.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No metrics yet. A metric bands the values already recorded against a numeric field — add one below.
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.map((m) => (
                <MetricEditor key={m.id} metric={m} />
              ))}
            </div>
          )}

          <NewMetricForm sources={sources} />
        </>
      ) : (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="text-sm text-muted-foreground">
              You are signed in as {session!.user.roleName}. Metrics are read-only for your role.
            </div>
            <div className="text-sm">
              <div className="font-medium text-foreground">{config.name}</div>
              <div className="text-xs text-muted-foreground">
                Scale {config.scaleMin}–{config.scaleMax} · {formatNumber(config.measurementCount)} measurements
              </div>
            </div>
            <div className="space-y-1">
              {config.bands.map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: b.color }} />
                  <span className="font-medium text-foreground">{b.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.min}–{b.max}
                  </span>
                </div>
              ))}
            </div>

            {metrics.map((m) => (
              <div key={m.id} className="border-t pt-3 text-sm">
                <div className="font-medium text-foreground">{m.name}</div>
                <div className="text-xs text-muted-foreground">
                  Measures {m.source.label} · {formatNumber(m.assetsMeasured)} assets · {m.observedMin}–
                  {m.observedMax}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
