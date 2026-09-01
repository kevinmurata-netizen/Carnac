import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAssetById, flattenAttributes } from "@/server/assets";
import { getNetworkGeoJSON } from "@/server/geo";
import { getConditionHistoryForAsset } from "@/server/condition";
import { listInspections, summarizeInspectionScore } from "@/server/inspections";
import { listFailuresForAsset } from "@/server/failures";
import { getRiskForAsset } from "@/server/risk";
import { getForecastForAsset } from "@/server/deterioration";
import { getRecommendationForAsset } from "@/server/treatments";
import { getAssetLcca } from "@/server/lcca";
import { LccaPanel } from "@/components/costs/lcca-panel";
import { RecommendationPanel } from "@/components/treatments/recommendation-panel";
import type { FactorRating } from "@/domain/waterline/risk";
import { SimpleLineChart } from "@/components/charts/simple-line-chart";
import { canRecordFieldData } from "@/lib/permissions";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssetStatus } from "@prisma/client";
import { RecordEditor, type EditableSection } from "@/components/records/record-editor";
import { saveAssetAction } from "./actions";
import { NetworkMap } from "@/components/map/network-map";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { PhaseComingSoon } from "@/components/phase-coming-soon";
import { ageInYears, formatDate, formatInches, formatNumber, formatStatus, toDateInputValue } from "@/lib/format";
import { ASSET_LABEL } from "@/config/labels";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { getConditionBands } from "@/server/settings";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ABANDONED: "destructive",
  PLANNED: "outline",
  REMOVED: "outline",
};

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const conditionBands = await getConditionBands(organizationId);

  const asset = await getAssetById(organizationId, id);
  if (!asset) notFound();

  const attrs = flattenAttributes(asset);
  const material = attrs[WATERLINE_ATTRIBUTES.MATERIAL] as string | undefined;
  const diameter = attrs[WATERLINE_ATTRIBUTES.DIAMETER] as number | undefined;
  const age = ageInYears(asset.installationDate);

  const [geojson, conditionHistory, inspections, failures, risk, forecast, recommendation, lcca] = await Promise.all([
    getNetworkGeoJSON(organizationId, [asset.id]),
    getConditionHistoryForAsset(organizationId, asset.id),
    listInspections(organizationId, { assetId: asset.id }),
    listFailuresForAsset(organizationId, asset.id),
    getRiskForAsset(organizationId, asset.id),
    getForecastForAsset(organizationId, asset.id),
    getRecommendationForAsset(organizationId, asset.id),
    getAssetLcca(organizationId, asset.id),
  ]);

  // Observed history and predicted trajectory on one shared year axis. The
  // forecast is annual, so observations collapse to one point per year —
  // conditionHistory is date-ascending, so the latest reading in a year wins.
  const deteriorationChart = (() => {
    if (!forecast) return [];
    const byYear = new Map<number, { year: number; observed: number | null; predicted: number | null }>();
    for (const c of conditionHistory) {
      const year = c.measurementDate.getFullYear();
      byYear.set(year, { year, observed: c.score, predicted: null });
    }
    for (const p of forecast.points) {
      const existing = byYear.get(p.year);
      if (existing) existing.predicted = p.predictedCondition;
      else byYear.set(p.year, { year: p.year, observed: null, predicted: p.predictedCondition });
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  })();

  const currentCondition = conditionHistory[conditionHistory.length - 1];
  const canEdit = canRecordFieldData(session);

  // The overview is built from the same values it saves, so what you see
  // locked is exactly what the inputs hold once unlocked.
  const identification: EditableSection = {
    title: "Identification",
    fields: [
      { name: "assetCode", label: `${ASSET_LABEL.singular} ID`, display: asset.assetCode, value: asset.assetCode, readOnly: true },
      { name: "ownerDepartment", label: "Responsible Department", display: asset.ownerDepartment ?? "—", value: asset.ownerDepartment ?? "" },
      {
        name: "status",
        label: "Status",
        display: formatStatus(asset.status),
        value: asset.status,
        type: "select" as const,
        options: Object.values(AssetStatus).map((v) => ({ value: v, label: formatStatus(v) })),
      },
      { name: "installationDate", label: "Installed", display: formatDate(asset.installationDate), value: toDateInputValue(asset.installationDate), type: "date" as const },
      {
        name: "expectedUsefulLife",
        label: "Expected Useful Life",
        display: asset.expectedUsefulLife ? `${asset.expectedUsefulLife} yr` : "—",
        value: asset.expectedUsefulLife != null ? String(asset.expectedUsefulLife) : "",
        type: "number" as const,
      },
    ],
  };

  const characteristics: EditableSection = {
    title: "Physical Characteristics",
    fields: [...asset.attributeValues]
      .sort((a, b) => a.definition.sortOrder - b.definition.sortOrder)
      .map((av) => {
        const raw = av.textValue ?? av.numberValue ?? av.dateValue ?? av.booleanValue ?? null;
        const options = (av.definition.config as { options?: string[] } | null)?.options ?? [];
        const type =
          av.definition.dataType === "NUMBER"
            ? ("number" as const)
            : av.definition.dataType === "DATE"
              ? ("date" as const)
              : av.definition.dataType === "BOOLEAN"
                ? ("boolean" as const)
                : av.definition.dataType === "ENUM" && options.length > 0
                  ? ("select" as const)
                  : ("text" as const);

        const display =
          raw == null
            ? "—"
            : raw instanceof Date
              ? formatDate(raw)
              : typeof raw === "boolean"
                ? raw
                  ? "Yes"
                  : "No"
                : `${raw}${av.definition.unit ? ` ${av.definition.unit}` : ""}`;

        const value =
          raw == null ? "" : raw instanceof Date ? toDateInputValue(raw) : typeof raw === "boolean" ? String(raw) : String(raw);

        return {
          name: `attr:${av.definition.code}`,
          label: av.definition.unit ? `${av.definition.label} (${av.definition.unit})` : av.definition.label,
          display,
          value,
          type,
          options: options.map((o) => ({ value: o, label: o })),
          step: av.definition.dataType === "NUMBER" ? "any" : undefined,
        };
      }),
  };

  const endpoints = asset.location
    ? `${asset.location.startLat?.toFixed(4)}, ${asset.location.startLng?.toFixed(4)} → ${asset.location.endLat?.toFixed(4)}, ${asset.location.endLng?.toFixed(4)}`
    : "—";

  const locationSection: EditableSection = {
    title: "Location",
    columns: 4,
    fields: [
      { name: "serviceArea", label: "Service Area", display: asset.location?.serviceArea ?? "—", value: asset.location?.serviceArea ?? "" },
      { name: "pressureZone", label: "Pressure Zone", display: asset.location?.pressureZone ?? "—", value: asset.location?.pressureZone ?? "" },
      {
        name: "depth",
        label: "Depth (ft)",
        display: asset.location?.depth ? `${asset.location.depth} ft` : "—",
        value: asset.location?.depth != null ? String(asset.location.depth) : "",
        type: "number" as const,
        step: "any",
      },
      // Geometry comes from the imported network, so the endpoints are shown
      // but not editable here — moving a segment is a map operation.
      { name: "endpoints", label: "Endpoints", display: endpoints, value: endpoints, readOnly: true },
    ],
  };

  return (
    <div>
      <SetBreadcrumb segment={id} label={asset.assetCode} />
      <PageHeader
        title={asset.assetCode}
        description={[diameter ? `${diameter}"` : null, material, "Waterline", asset.location?.serviceArea]
          .filter(Boolean)
          .join(" · ")}
        actions={<Badge variant={STATUS_VARIANT[asset.status]}>{formatStatus(asset.status)}</Badge>}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <SummaryStat label="Age" value={age != null ? `${age} yr` : "—"} />
        <SummaryStat
          label="Length"
          value={
            attrs[WATERLINE_ATTRIBUTES.LENGTH] ? `${formatNumber(Math.round(attrs[WATERLINE_ATTRIBUTES.LENGTH] as number))} ft` : "—"
          }
        />
        <SummaryStat label="Diameter" value={formatInches(diameter)} />
        <SummaryStat label="Material" value={material ?? "—"} />
        <SummaryStat label="Installed" value={formatDate(asset.installationDate)} />
        <SummaryStat label="Criticality" value={(attrs[WATERLINE_ATTRIBUTES.CRITICALITY] as string) ?? "—"} />
        <SummaryStat
          label="Condition (WCI)"
          value={currentCondition ? `${currentCondition.score} · ${currentCondition.band.label}` : "Not inspected"}
          color={currentCondition?.band.color}
        />
      </div>

      <Tabs defaultValue={tab ?? "overview"}>
        {/* h-auto because the list wraps: the component's fixed height would
            clip the second row and overlap the card beneath it on narrow
            screens, where ten tabs never fit on one line. */}
        <TabsList className="group-data-horizontal/tabs:h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="inspections">Inspection History</TabsTrigger>
          <TabsTrigger value="condition">Condition</TabsTrigger>
          <TabsTrigger value="failures">Failures</TabsTrigger>
          <TabsTrigger value="deterioration">Deterioration</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="treatments">Treatments</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <RecordEditor
            sections={[identification, characteristics, locationSection]}
            action={saveAssetAction}
            hiddenFields={{ assetId: asset.id }}
            canEdit={canEdit}
            lockedNote="Executives have read-only access"
          />
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="h-[420px] overflow-hidden rounded-lg">
                <NetworkMap geojson={geojson} className="h-full w-full" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inspections" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Inspection History</CardTitle>
              {canEdit && (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/inspections/new?assetId=${asset.id}`}>New Inspection</Link>}
                />
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Inspector</TableHead>
                    <TableHead>WCI Score</TableHead>
                    <TableHead>Follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        No inspections recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {inspections.map((inspection) => {
                    const condition = summarizeInspectionScore(inspection, conditionBands);
                    return (
                      <TableRow key={inspection.id}>
                        <TableCell>
                          <Link href={`/inspections/${inspection.id}`} className="text-primary hover:underline">
                            {formatDate(inspection.inspectionDate)}
                          </Link>
                        </TableCell>
                        <TableCell>{inspection.inspectionType}</TableCell>
                        <TableCell>{inspection.inspector.name}</TableCell>
                        <TableCell>
                          {condition ? (
                            <span style={{ color: condition.band.color }}>
                              {condition.score} · {condition.band.label}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {inspection.requiresFollowUp ? <Badge variant="destructive">Follow-up</Badge> : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="condition" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex items-center gap-6 py-6">
              <div>
                <div className="text-xs text-muted-foreground">Current Waterline Condition Index</div>
                <div className="mt-1 text-4xl font-semibold" style={{ color: currentCondition?.band.color }}>
                  {currentCondition ? currentCondition.score : "—"}
                </div>
                <div className="mt-1 text-sm font-medium" style={{ color: currentCondition?.band.color }}>
                  {currentCondition ? currentCondition.band.label : "Not yet inspected"}
                </div>
              </div>
              {currentCondition && (
                <div className="text-sm text-muted-foreground">
                  Last measured {formatDate(currentCondition.measurementDate)}
                </div>
              )}
            </CardContent>
          </Card>

          {conditionHistory.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Condition History</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleBarChart
                  data={conditionHistory.map((c) => ({ date: formatDate(c.measurementDate), score: c.score }))}
                  xKey="date"
                  yKey="score"
                  color="var(--color-chart-1)"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="failures" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Failure History</CardTitle>
              {canEdit && (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/assets/${asset.id}/failures/new`}>Record Failure</Link>}
                />
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Repair Cost</TableHead>
                    <TableHead>Customers Affected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failures.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        No failures recorded.
                      </TableCell>
                    </TableRow>
                  )}
                  {failures.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{formatDate(f.failureDate)}</TableCell>
                      <TableCell>{f.failureType.label}</TableCell>
                      <TableCell>{f.severity}</TableCell>
                      <TableCell>{f.repairCost != null ? `$${formatNumber(Math.round(f.repairCost))}` : "—"}</TableCell>
                      <TableCell>{f.customersAffected != null ? formatNumber(f.customersAffected) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deterioration" className="mt-4 space-y-4">
          {!forecast ? (
            <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              No deterioration forecast for this {ASSET_LABEL.lower} — forecasts are generated for active segments with a
              matching material curve model.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <SummaryStat
                  label="Forecast Model"
                  value={forecast.modelName.replace("Curve — ", "")}
                />
                <SummaryStat
                  label="Predicted in 10 yr"
                  value={String(forecast.points[forecast.points.length - 1]?.predictedCondition ?? "—")}
                />
                <SummaryStat
                  label="Remaining Life"
                  value={
                    forecast.remainingLifeYears != null
                      ? forecast.remainingLifeYears === 0
                        ? "At threshold"
                        : `~${forecast.remainingLifeYears} yr`
                      : "—"
                  }
                  color={forecast.remainingLifeYears === 0 ? "#dc2626" : undefined}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Condition History &amp; Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  <SimpleLineChart
                    data={deteriorationChart}
                    xKey="year"
                    yDomain={[0, 100]}
                    referenceY={25}
                    referenceLabel="Intervention threshold"
                    series={[
                      { key: "observed", label: "Observed (inspections)", color: "var(--color-chart-2)", showDots: true },
                      { key: "predicted", label: "Predicted (do nothing)", color: "var(--color-chart-1)", dashed: true },
                    ]}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Forecast anchored to the latest observed WCI, then following the {forecast.modelName} curve.
                    Remaining life is the projected time until WCI crosses 25 (Poor / Very Poor boundary).
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
        <TabsContent value="risk" className="mt-4 space-y-4">
          {!risk ? (
            <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              No risk assessment has been run for this {ASSET_LABEL.lower} yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <SummaryStat label="Probability of Failure" value={`${risk.pof} / 5`} />
                <SummaryStat label="Consequence of Failure" value={`${risk.cof} / 5`} />
                <SummaryStat label="Risk Score" value={`${risk.riskScore} · ${risk.band.label}`} color={risk.band.color} />
                <SummaryStat
                  label="Criticality"
                  value={risk.criticalityScore != null ? `${risk.criticalityScore} / 100` : "—"}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <FactorCard title="Why this probability?" factors={risk.pofFactors} />
                <FactorCard title="Why this consequence?" factors={risk.cofFactors} />
              </div>

              <p className="text-xs text-muted-foreground">
                Risk = Probability × Consequence, each a weighted average of the factors above (rated 1–5).
                Assessed {formatDate(risk.assessmentDate)}.
              </p>
            </>
          )}
        </TabsContent>
        <TabsContent value="treatments" className="mt-4">
          {recommendation ? (
            <RecommendationPanel recommendation={recommendation} />
          ) : (
            <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              No treatment evaluation available for this {ASSET_LABEL.lower}.
            </div>
          )}
        </TabsContent>
        <TabsContent value="costs" className="mt-4">
          {lcca ? <LccaPanel lcca={lcca} /> : (
            <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
              No life-cycle cost analysis available.
            </div>
          )}
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <PhaseComingSoon feature="Document management" phase={8} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function FactorCard({ title, factors }: { title: string; factors: FactorRating[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factor</TableHead>
              <TableHead>Observed</TableHead>
              <TableHead>Rating (1–5)</TableHead>
              <TableHead>Weight</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {factors.map((f) => (
              <TableRow key={f.name}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell className="text-muted-foreground">{f.observed}</TableCell>
                <TableCell>{f.rating}</TableCell>
                <TableCell>{Math.round(f.weight * 100)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
