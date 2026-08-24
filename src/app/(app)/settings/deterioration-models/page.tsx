import { auth } from "@/lib/auth";
import { listDeteriorationModels } from "@/server/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeteriorationModelList } from "./model-list";
import { formatNumber } from "@/lib/format";
import { getPageName } from "@/server/navigation";

export default async function DeteriorationModelSettingsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/deterioration-models", "Deterioration Models");
  const isAdmin = session!.user.roleName === "Administrator";

  const models = await listDeteriorationModels(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Service life and curve shape per material — what every condition forecast and scenario run projects against"
      />

      <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        An inactive model is skipped entirely, and its material falls back to the default 75-year curve rather than
        continuing to shape forecasts invisibly. Edits apply to the next forecast, work plan generation or scenario
        run; stored predictions keep the curve they were produced with.
      </div>

      {isAdmin ? (
        <DeteriorationModelList models={models} />
      ) : (
        <Card>
          <CardContent className="space-y-3 py-6 text-sm">
            <div className="text-muted-foreground">
              You are signed in as {session!.user.roleName}. Deterioration models are read-only for your role.
            </div>
            {models.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="font-medium text-foreground">{m.name}</span>
                <Badge variant={m.isActive ? "default" : "secondary"}>{m.isActive ? "Active" : "Inactive"}</Badge>
                <span className="text-xs text-muted-foreground">
                  {m.curve.serviceLife} yr life · shape {m.curve.shape} · {formatNumber(m.predictionCount)} predictions
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
