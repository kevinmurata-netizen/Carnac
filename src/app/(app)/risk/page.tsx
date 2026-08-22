import { auth } from "@/lib/auth";
import { getRiskSummary, getRiskMatrixAssets, getLatestRiskByAsset } from "@/server/risk";
import { getRiskBand } from "@/domain/waterline/risk";
import { getNetworkGeoJSON } from "@/server/geo";
import { RISK_BANDS } from "@/domain/waterline/risk";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NetworkMap } from "@/components/map/network-map";
import { MapLegend } from "@/components/map/map-legend";
import { RiskMatrixExplorer } from "@/components/risk/risk-matrix-explorer";
import { formatNumber } from "@/lib/format";
import { AlertTriangle, Crosshair, Gauge, ShieldAlert } from "lucide-react";
import { ASSET_LABEL } from "@/config/labels";
import { getPageName } from "@/server/navigation";

export default async function RiskPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/risk", "Risk");

  const [summary, matrixAssets, riskByAsset, geojson] = await Promise.all([
    getRiskSummary(organizationId),
    getRiskMatrixAssets(organizationId),
    getLatestRiskByAsset(organizationId),
    getNetworkGeoJSON(organizationId),
  ]);

  // Band per cell resolved here so the client component never imports the
  // domain module. Rows are POF 1..5, columns COF 1..5, matching summary.matrix.
  const bandFor = Array.from({ length: 5 }, (_, p) =>
    Array.from({ length: 5 }, (_, c) => {
      const band = getRiskBand((p + 1) * (c + 1));
      return { label: band.label, color: band.color };
    })
  );

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

        <RiskMatrixExplorer
          matrix={summary.matrix}
          assets={matrixAssets}
          bandFor={bandFor}
          assetLabel={ASSET_LABEL.singular}
        />
      </div>
    </div>
  );
}
