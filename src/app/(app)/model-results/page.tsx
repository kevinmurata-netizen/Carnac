import Link from "next/link";
import { auth } from "@/lib/auth";
import { getWciFlow, listScenarioOptions } from "@/server/model-results";
import { getPageName } from "@/server/navigation";
import { ASSET_LABEL } from "@/config/labels";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WciSankey } from "@/components/charts/wci-sankey";
import { formatNumber } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, Gauge, Minus } from "lucide-react";

export default async function ModelResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const { scenario: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/model-results", "Model Results");

  const options = await listScenarioOptions(organizationId);
  const runnable = options.filter((o) => o.hasResults);
  const selectedId = runnable.find((o) => o.id === requested)?.id ?? runnable[0]?.id;
  const flow = selectedId ? await getWciFlow(organizationId, selectedId) : null;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`Where a scenario actually leaves the network — every ${ASSET_LABEL.lower} segment traced from its starting condition band to its ending one`}
      />

      {runnable.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No scenarios have been run yet.{" "}
          <Link href="/scenario-planning" className="text-primary hover:underline">
            Create one under Scenario Planning
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {runnable.map((o) => {
              const active = o.id === selectedId;
              return (
                <Link
                  key={o.id}
                  href={`/model-results?scenario=${o.id}`}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-transparent bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {o.name}
                </Link>
              );
            })}
          </div>

          {!flow ? (
            <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              This scenario produced no asset outcomes to trace.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Average WCI"
                  value={`${flow.startAvg} → ${flow.endAvg}`}
                  sublabel={`Across ${formatNumber(flow.assetCount)} segments over ${flow.years} years`}
                  icon={Gauge}
                />
                <KpiCard
                  label="Improved"
                  value={formatNumber(flow.improved)}
                  sublabel="Finished in a better band"
                  icon={ArrowUpRight}
                />
                <KpiCard
                  label="Held"
                  value={formatNumber(flow.unchanged)}
                  sublabel="Same band at both ends"
                  icon={Minus}
                />
                <KpiCard
                  label="Declined"
                  value={formatNumber(flow.declined)}
                  sublabel="Finished in a worse band"
                  icon={ArrowDownRight}
                  tone={flow.declined > 0 ? "warning" : "default"}
                />
              </div>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>
                    Condition Flow — {flow.scenarioName}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · {flow.strategy} · {flow.years} years
                    </span>
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Each band on the left is where segments started; each on the right is where they finished. Ribbon
                    thickness is the number of segments taking that path — green gained a band, red lost one, grey
                    stayed put.
                  </p>
                </CardHeader>
                <CardContent>
                  <WciSankey nodes={flow.nodes} links={flow.links} />
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>
                    Transitions{" "}
                    <span className="text-sm font-normal text-muted-foreground">({flow.links.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>From</TableHead>
                          <TableHead>To</TableHead>
                          <TableHead>Segments</TableHead>
                          <TableHead>Share</TableHead>
                          <TableHead>Direction</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flow.links.map((l) => (
                          <TableRow key={`${l.fromBand}-${l.toBand}`}>
                            <TableCell>{l.fromBand}</TableCell>
                            <TableCell>{l.toBand}</TableCell>
                            <TableCell className="font-medium">{formatNumber(l.value)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {Math.round((l.value / flow.assetCount) * 1000) / 10}%
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  l.direction === "improved"
                                    ? "default"
                                    : l.direction === "declined"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {l.direction}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <p className="mt-3 text-xs text-muted-foreground">
                {formatNumber(flow.treatedCount)} segments were treated at least once and{" "}
                {formatNumber(flow.untreatedCount)} were never funded. This is computed by re-running the simulation
                against the treatment library, deterioration curves and condition bands as they are configured right
                now — so it reflects current settings rather than whatever was stored when the scenario was last run.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
