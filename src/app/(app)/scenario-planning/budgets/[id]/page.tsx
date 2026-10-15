import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getBudgetPlan } from "@/server/budget-plans";
import { PageHeader } from "@/components/layout/page-header";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { BudgetEditor } from "../budget-editor";
import { deleteBudgetPlanAction, saveBudgetPlanAction } from "../actions";

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const canEdit = canRecordFieldData(session);
  const plan = await getBudgetPlan(organizationId, id);
  if (!plan) notFound();

  const following = plan.scenarioCount;

  return (
    <div>
      <SetBreadcrumb segment={plan.id} label={plan.name} />
      <PageHeader
        title={plan.name}
        description={
          following > 0
            ? `${following} scenario${following === 1 ? " follows" : "s follow"} this budget. Saving changes what they spend; re-run them to see it.`
            : "No scenario follows this budget yet. Choose it under Budget on a scenario."
        }
        actions={
          canEdit && (
            <form action={deleteBudgetPlanAction}>
              <input type="hidden" name="id" value={plan.id} />
              <ConfirmDelete
                title={`Delete ${plan.name}?`}
                description={
                  following > 0
                    ? "Scenarios still follow this budget, so it can't be deleted until they choose another."
                    : "The budget and every amount in it are removed. This cannot be undone."
                }
                disabled={following > 0}
                pendingLabel="Deleting…"
              >
                Delete
              </ConfirmDelete>
            </form>
          )
        }
      />
      <Card>
        <CardContent className="pt-6">
          {canEdit ? (
            <BudgetEditor
              action={saveBudgetPlanAction}
              initial={{ id: plan.id, name: plan.name, description: plan.description ?? "", lines: plan.lines }}
            />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>For</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular-nums">{l.year}</TableCell>
                      <TableCell>{l.category ?? "Total"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
