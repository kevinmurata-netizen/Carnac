import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getInspectionById, summarizeInspectionScore } from "@/server/inspections";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { getConditionBands } from "@/server/settings";

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const conditionBands = await getConditionBands(organizationId);

  const inspection = await getInspectionById(organizationId, id);
  if (!inspection) notFound();

  const condition = summarizeInspectionScore(inspection, conditionBands);
  const numericResults = inspection.results.filter((r) => r.field.dataType === "NUMBER");
  const textResults = inspection.results.filter((r) => r.field.dataType === "TEXT");

  return (
    <div>
      <SetBreadcrumb segment={id} label={`Inspection — ${inspection.asset.assetCode}`} />
      <PageHeader
        title={`Inspection — ${inspection.asset.assetCode}`}
        description={`${inspection.inspectionType} · ${formatDate(inspection.inspectionDate)}`}
        actions={
          <Link href={`/assets/${inspection.asset.id}`} className="text-sm text-primary hover:underline">
            View asset →
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryStat label="Inspector" value={inspection.inspector.name} />
        <SummaryStat
          label="Condition (WCI)"
          value={condition ? `${condition.score} · ${condition.band.label}` : "—"}
          color={condition?.band.color}
        />
        <SummaryStat label="Data Quality" value={inspection.qualityScore ? `${Math.round(inspection.qualityScore * 100)}%` : "—"} />
        <SummaryStat
          label="Follow-up"
          value={inspection.requiresFollowUp ? "Required" : "Not required"}
        />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Condition Assessment Results</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {numericResults.map((r) => (
              <div key={r.id}>
                <dt className="text-xs font-medium text-muted-foreground">{r.field.label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-foreground">{r.numberValue} / 10</dd>
              </div>
            ))}
          </dl>
          {textResults.length > 0 && (
            <div className="mt-4 space-y-3 border-t pt-4">
              {textResults.map((r) => (
                <div key={r.id}>
                  <dt className="text-xs font-medium text-muted-foreground">{r.field.label}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{r.textValue}</dd>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {inspection.notes && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{inspection.notes}</p>
            {inspection.requiresFollowUp && <Badge variant="destructive" className="mt-2">Follow-up required</Badge>}
          </CardContent>
        </Card>
      )}

      {(inspection.gpsLat != null || inspection.gpsLng != null) && (
        <Card>
          <CardHeader>
            <CardTitle>Recorded Location</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">
              {inspection.gpsLat}, {inspection.gpsLng}
            </p>
          </CardContent>
        </Card>
      )}
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
