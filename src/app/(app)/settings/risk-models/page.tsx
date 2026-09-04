import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getRiskModelConfig } from "@/server/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RiskModelEditor } from "./editor";
import { formatNumber } from "@/lib/format";
import { getPageName } from "@/server/navigation";
import { RecomputeButton } from "../recompute-button";
import { recomputeRiskAction } from "../actions";

export default async function RiskModelsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/risk-models", "Risk Models");
  const { canWrite: canEdit } = await requireCard("/settings/risk-models");

  const config = await getRiskModelConfig(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="How much each factor counts toward probability and consequence of failure"
      />

      {canEdit && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <RecomputeButton
              action={recomputeRiskAction}
              hint="Saved weights only take effect when the model runs. Existing assessments keep the weights they were scored with."
            />
          </CardContent>
        </Card>
      )}

      {canEdit ? (
        <RiskModelEditor config={config} />
      ) : (
        <Card>
          <CardContent className="space-y-4 py-6 text-sm">
            <div className="text-muted-foreground">
              You are signed in as {session!.user.roleName}. Risk models are read-only for your role.
            </div>
            <div>
              <div className="font-medium text-foreground">{config.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatNumber(config.assessmentCount)} assessments scored
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {(["pof", "cof"] as const).map((group) => (
                <div key={group}>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    {group === "pof" ? "Probability" : "Consequence"}
                  </div>
                  {Object.entries(config[group]).map(([code, weight]) => (
                    <div key={code} className="flex justify-between text-xs">
                      <span>{code}</span>
                      <span className="tabular-nums text-muted-foreground">{weight}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
