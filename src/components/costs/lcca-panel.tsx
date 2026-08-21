import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { AssetLcca } from "@/server/lcca";

export function LccaPanel({ lcca }: { lcca: AssetLcca }) {
  const { assumptions: a, options, bestLabel, doNothingNpv } = lcca;
  const best = options.find((o) => o.label === bestLabel);
  const savingsVsDoNothing =
    best && doNothingNpv != null && best.label !== "Do nothing" ? doNothingNpv - best.totalNpv : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Lowest Life-Cycle Cost: {bestLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total Life-Cycle Cost (NPV)" value={best ? formatCurrency(best.totalNpv) : "—"} />
            <Stat label="Initial Cost" value={best ? formatCurrency(best.initialCost) : "—"} />
            <Stat label="Annualized Cost" value={best ? `${formatCurrency(best.annualizedCost)}/yr` : "—"} />
            <Stat
              label="vs Do Nothing"
              value={
                savingsVsDoNothing == null
                  ? "—"
                  : savingsVsDoNothing >= 0
                    ? `${formatCurrency(savingsVsDoNothing)} saved`
                    : `${formatCurrency(-savingsVsDoNothing)} more`
              }
              tone={savingsVsDoNothing != null && savingsVsDoNothing > 0 ? "good" : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {a.analysisPeriodYears}-year analysis at a {(a.discountRate * 100).toFixed(2)}% real discount rate. Costs
            are in present-value terms and include expected failure and service-interruption cost, so a cheap option
            that leaves a high failure probability is not automatically the cheapest overall.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost Components by Option</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Option</TableHead>
                  <TableHead>Initial</TableHead>
                  <TableHead>Maintenance</TableHead>
                  <TableHead>Inspection</TableHead>
                  <TableHead>Expected Failure</TableHead>
                  <TableHead>Renewal</TableHead>
                  <TableHead>Forced Replacement</TableHead>
                  <TableHead>Residual</TableHead>
                  <TableHead>Total NPV</TableHead>
                  <TableHead>Annualized</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {options.map((o) => (
                  <TableRow key={o.label}>
                    <TableCell className="font-medium">
                      {o.label}
                      {o.label === bestLabel && (
                        <Badge className="ml-2" variant="default">
                          Lowest
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(o.initialCost)}</TableCell>
                    <TableCell>{formatCurrency(o.maintenancePv)}</TableCell>
                    <TableCell>{formatCurrency(o.inspectionPv)}</TableCell>
                    <TableCell>
                      {formatCurrency(o.failurePv)}
                      <span className="ml-1 text-xs text-muted-foreground">({o.expectedFailures})</span>
                    </TableCell>
                    <TableCell>{formatCurrency(o.renewalPv)}</TableCell>
                    <TableCell>{formatCurrency(o.forcedReplacementPv)}</TableCell>
                    <TableCell>{formatCurrency(o.residualValuePv)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(o.totalNpv)}</TableCell>
                    <TableCell>{formatCurrency(o.annualizedCost)}/yr</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone === "good" ? "text-emerald-600" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
