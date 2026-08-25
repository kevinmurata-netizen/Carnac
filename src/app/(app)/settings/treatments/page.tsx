import Link from "next/link";
import { auth } from "@/lib/auth";
import { listTreatmentsForAdmin } from "@/server/treatment-config";
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
  const isAdmin = session!.user.roleName === "Administrator";

  const treatments = await listTreatmentsForAdmin(organizationId);
  const withTrees = treatments.filter((t) => t.treeCount > 0).length;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="The library that drives recommendations, life-cycle cost, work plans and scenarios"
      />

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatments are read-only for your role.
        </div>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>
            Library <span className="text-muted-foreground">({treatments.length})</span>
            {withTrees > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · {withTrees} with a decision tree
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
                  <TableHead>Condition</TableHead>
                  <TableHead>Materials</TableHead>
                  <TableHead>Unit Cost</TableHead>
                  <TableHead>Effect</TableHead>
                  <TableHead>Decision Tree</TableHead>
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
                    <TableCell className="whitespace-nowrap">
                      {t.applicableConditionMin}–{t.applicableConditionMax}
                    </TableCell>
                    <TableCell className="text-xs">{t.applicableMaterials?.join(", ") ?? "All"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatCurrency(t.unitCost)} {t.costUnit}
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
                      {t.treeCount > 0 ? (
                        <Badge variant="default">
                          {t.treeCount} tree{t.treeCount === 1 ? "" : "s"} · {t.treeConditionCount} condition
                          {t.treeConditionCount === 1 ? "" : "s"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">none</span>
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

      {isAdmin && <TreatmentForm mode="create" />}

      <p className="mt-3 text-xs text-muted-foreground">
        Edits apply on the next recommendation, life-cycle comparison, work plan generation or scenario run — none of
        these are cached snapshots. Existing work plans keep whatever costs they were generated with until
        regenerated.
      </p>
    </div>
  );
}
