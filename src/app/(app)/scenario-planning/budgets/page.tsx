import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listBudgetPlans } from "@/server/budget-plans";
import { PageHeader } from "@/components/layout/page-header";
import { PendingLinkButton } from "@/components/ui/pending-button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { BUDGET_CATEGORIES } from "@/domain/waterline/budget-plan";

export default async function BudgetsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const canEdit = canRecordFieldData(session);
  const plans = await listBudgetPlans(organizationId);

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="The money you expect to have, year by year — for scenarios to follow instead of one annual figure and a growth rate"
        actions={
          canEdit && (
            <PendingLinkButton href="/scenario-planning/budgets/new" pendingLabel="Opening…">
              New budget
            </PendingLinkButton>
          )
        }
      />

      {plans.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-medium">No budgets yet</p>
            <p className="mx-auto max-w-prose text-sm text-muted-foreground">
              A scenario runs on an annual budget that grows by a fixed rate. Where the money is already set out year
              by year — a five-year capital plan, a grant that ends — enter it here, with amounts per category if you
              break it out that way ({BUDGET_CATEGORIES.join(", ")}), and choose it on the scenario.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Budget</TableHead>
                <TableHead>Years</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>By category</TableHead>
                <TableHead className="text-right">Scenarios following it</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/scenario-planning/budgets/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {p.years.length === 0
                      ? "—"
                      : p.years.length === 1
                        ? p.years[0]
                        : `${p.years[0]}–${p.years[p.years.length - 1]} (${p.years.length} years)`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(p.total, { compact: true })}</TableCell>
                  <TableCell>{p.lines.some((l) => l.category != null) ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.scenarioCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
