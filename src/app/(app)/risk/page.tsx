import Link from "next/link";
import { auth } from "@/lib/auth";
import { getRiskSummary, getTopRiskAssets, getLatestRiskByAsset } from "@/server/risk";
import { getNetworkGeoJSON } from "@/server/geo";
import { RISK_BANDS } from "@/domain/waterline/risk";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NetworkMap } from "@/components/map/network-map";
import { MapLegend } from "@/components/map/map-legend";
import { RiskMatrix } from "@/components/risk/risk-matrix";
import { formatNumber } from "@/lib/format";
import { AlertTriangle, Crosshair, Gauge, ShieldAlert } from "lucide-react";
import { ASSET_LABEL } from "@/config/labels";
import { getPageName } from "@/server/navigation";

export default async function RiskPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/risk", "Risk");

  const [summary, top, riskByAsset, geojson] = await Promise.all([
    getRiskSummary(organizationId),
    getTopRiskAssets(organizationId, 10),
    getLatestRiskByAsset(organizationId),
    getNetworkGeoJSON(organizationId),
  ]);

  // Color the network by risk band; hover shows "Risk 14.2 · High".
  for (const feature of geojson.features) {
    const props = feature.properties as Record<string, unknown>;
    const risk = riskByAsset.get(props.id as string);
    if (risk) {
      props.riskColor = risk.band.color;
      props.label = `Risk ${risk.riskScore} · ${risk.band.label}`;
    }
  }

  const highPlus = summary.byBand
    .filter((b) => b.label === "High" || b.label === "Very High")
    .reduce((sum, b) => sum + b.count, 0);
  const veryHigh = summary.byBand.find((b) => b.label === "Very High")?.count ?? 0;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Probability of failure × consequence of failure — every score traceable to its input factors"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Average Risk Score"
          value={summary.averageRisk != null ? String(summary.averageRisk) : "—"}
          sublabel={`Across ${formatNumber(summary.assessedAssets)} assessed segments (scale 1–25)`}
          icon={Gauge}
        />
        <KpiCard
          label="High / Very High Risk"
          value={formatNumber(highPlus)}
          sublabel={`${summary.assessedAssets ? Math.round((highPlus / summary.assessedAssets) * 100) : 0}% of network`}
          icon={AlertTriangle}
          tone={highPlus > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Very High Risk"
          value={formatNumber(veryHigh)}
          sublabel="Immediate attention candidates"
          icon={ShieldAlert}
          tone={veryHigh > 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Assessed Segments"
          value={formatNumber(summary.assessedAssets)}
          sublabel="Latest assessment run"
          icon={Crosshair}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Risk Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-[380px] overflow-hidden rounded-md border">
              <NetworkMap geojson={geojson} colorProperty="riskColor" className="h-full w-full" />
              <MapLegend
                title="Risk"
                entries={RISK_BANDS.map((b) => ({ label: b.label, color: b.color }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <RiskMatrix matrix={summary.matrix} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Highest-Risk Segments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ASSET_LABEL.singular}</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Probability (1–5)</TableHead>
                <TableHead>Consequence (1–5)</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead>Band</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No risk assessments yet.
                  </TableCell>
                </TableRow>
              )}
              {top.map((row) => (
                <TableRow key={row.asset.id}>
                  <TableCell>
                    <Link
                      href={`/assets/${row.asset.id}?tab=risk`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.asset.assetCode}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.conditionScore != null && row.conditionBand ? (
                      <span style={{ color: row.conditionBand.color }}>
                        {row.conditionScore} · {row.conditionBand.label}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{row.pof}</TableCell>
                  <TableCell>{row.cof}</TableCell>
                  <TableCell className="font-medium" style={{ color: row.band.color }}>
                    {row.riskScore}
                  </TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: row.band.color, color: "white" }}>{row.band.label}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
