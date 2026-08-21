import { auth } from "@/lib/auth";
import { getConditionModelConfig } from "@/server/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ConditionModelEditor } from "./editor";
import { formatNumber } from "@/lib/format";
import { getPageName } from "@/server/navigation";

export default async function ConditionModelsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/condition-models", "Condition Models");
  const isAdmin = session!.user.roleName === "Administrator";

  const config = await getConditionModelConfig(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="The scoring scale and the bands that turn a numeric score into a condition grade"
      />

      {isAdmin ? (
        <ConditionModelEditor config={config} />
      ) : (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="text-sm text-muted-foreground">
              You are signed in as {session!.user.roleName}. Condition models are read-only for your role.
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
