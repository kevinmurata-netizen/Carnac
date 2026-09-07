import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listAllCostRates } from "@/server/cost-rates";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { getPageName } from "@/server/navigation";

/**
 * Every price in the library on one screen.
 *
 * Rates are edited on the treatment they belong to, because a price is
 * meaningless without the work it pays for. This is the other view of the same
 * data: the one that makes an annual rate review a single pass rather than
 * thirteen visits.
 */
export default async function TreatmentCostsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/treatment-costs", "Treatment Costs");
  await requireCard("/settings/treatment-costs");

  const rates = await listAllCostRates(organizationId);

  // Grouped so the order a treatment tries its rates in is visible, which is
  // what decides which one an asset is charged.
  const byTreatment = new Map<string, typeof rates>();
  for (const rate of rates) {
    const list = byTreatment.get(rate.treatmentId) ?? [];
    list.push(rate);
    byTreatment.set(rate.treatmentId, list);
  }

  const ruleSelected = rates.filter((r) => r.ruleName).length;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="What each treatment costs, and the rule that picks each price. Edited on the treatment itself; gathered here so a rate review is one screen."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Rates <span className="text-muted-foreground">({rates.length})</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              across {byTreatment.size} treatment{byTreatment.size === 1 ? "" : "s"}
              {ruleSelected > 0 ? ` · ${ruleSelected} selected by a rule` : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rates.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No rates yet. A treatment with no rate cannot be priced, so it is never recommended.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treatment</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Applies when</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Mobilization</TableHead>
                    <TableHead className="text-right">Maintenance / yr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...byTreatment.values()].flatMap((group) =>
                    group.map((r, index) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {/* Only the first row of each treatment is labelled, so
                              the grouping reads at a glance. */}
                          {index === 0 ? (
                            <Link
                              href={`/settings/treatments/${r.treatmentId}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {r.treatmentName}
                            </Link>
                          ) : (
                            <span className="sr-only">{r.treatmentName}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="whitespace-normal break-words text-sm">
                          {r.ruleName ? (
                            r.ruleName
                          ) : (
                            <Badge variant="secondary">anything else</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {formatCurrency(r.unitCost)} {r.costUnit}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(r.mobilizationCost)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.annualMaintenanceCost)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Rates are tried top to bottom within a treatment and the first whose rule matches is charged, so the order
        shown here is the order the model uses. Change a price on its treatment.
      </p>
    </div>
  );
}
