import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listTreatmentsForAdmin } from "@/server/treatment-config";
import { listAllCostRates } from "@/server/cost-rates";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TreatmentForm } from "./treatment-form";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getPageName } from "@/server/navigation";

const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Assess: "secondary",
  Repair: "outline",
  Rehabilitate: "default",
  Renew: "destructive",
  Retire: "secondary",
};

export default async function TreatmentsAdminPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/treatments", "Treatments and Costs");
  const { canWrite: canEdit } = await requireCard("/settings/treatments");

  const [treatments, rates] = await Promise.all([
    listTreatmentsForAdmin(organizationId),
    listAllCostRates(organizationId),
  ]);
  const withRules = treatments.filter((t) => t.ruleCount > 0).length;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="The library that drives recommendations, life-cycle cost, work plans and scenarios"
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatments are read-only for your role.
        </div>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>
            Library <span className="text-muted-foreground">({treatments.length})</span>
            {withRules > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · {withRules} with a rule
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Effect</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead>In Plans</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {treatments.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link
                        href={`/settings/treatments/${t.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {t.name}
                      </Link>
                      {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={CATEGORY_VARIANT[t.category] ?? "default"}>{t.category}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.conditionResetTo != null
                        ? `resets to ${t.conditionResetTo}`
                        : t.conditionGain != null
                          ? `+${t.conditionGain}`
                          : "—"}
                      <span className="text-muted-foreground"> · ×{t.failureProbMultiplier}</span>
                    </TableCell>
                    <TableCell>
                      {t.ruleCount > 0 ? (
                        <Badge variant="default">
                          {t.ruleCount} rule{t.ruleCount === 1 ? "" : "s"}
                          {t.blockRuleCount > 0 ? `, ${t.blockRuleCount} blocking` : ""}
                        </Badge>
                      ) : (
                        // Not a neutral "none": with no rules the treatment is
                        // considered for every inspected asset, which is worth
                        // noticing from the list.
                        <span className="text-xs text-destructive">none — considered for everything</span>
                      )}
                    </TableCell>
                    <TableCell>{formatNumber(t.workPlanItemCount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>
            Cost rates <span className="text-muted-foreground">({rates.length})</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              · every price across the library, so a rate review is one screen
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Applies when</TableHead>
                  <TableHead>Unit Cost</TableHead>
                  <TableHead>Mobilization</TableHead>
                  <TableHead>Maintenance / yr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/settings/treatments/${r.treatmentId}`}
                        className="text-primary hover:underline"
                      >
                        {r.treatmentName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">
                      {r.ruleName ?? <span className="text-muted-foreground">anything else</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatCurrency(r.unitCost)} {r.costUnit}
                    </TableCell>
                    <TableCell>{formatCurrency(r.mobilizationCost)}</TableCell>
                    <TableCell>{formatCurrency(r.annualMaintenanceCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canEdit && <TreatmentForm mode="create" />}

      <p className="mt-3 text-xs text-muted-foreground">
        Edits apply on the next recommendation, life-cycle comparison, work plan generation or scenario run — none of
        these are cached snapshots. Existing work plans keep whatever costs they were generated with until
        regenerated.
      </p>
    </div>
  );
}
