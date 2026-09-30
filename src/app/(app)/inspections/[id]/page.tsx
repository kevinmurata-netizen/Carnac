import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getInspectionById, summarizeInspectionScore } from "@/server/inspections";
import { INSPECTION_TYPES } from "@/domain/waterline/inspection";
import { PageHeader } from "@/components/layout/page-header";
import { RecordEditor, type EditableSection } from "@/components/records/record-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, toDateInputValue } from "@/lib/format";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { getConditionBands } from "@/server/settings";
import { getVisitParts, type VisitPart } from "@/server/component-inspections";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveInspectionAction } from "./actions";

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const conditionBands = await getConditionBands(organizationId);

  const inspection = await getInspectionById(organizationId, id);
  if (!inspection) notFound();
  // A component's findings are read as part of the visit they belong to.
  if (inspection.parentInspectionId) redirect(`/inspections/${inspection.parentInspectionId}`);
  const parts = await getVisitParts(organizationId, inspection.id);

  const condition = summarizeInspectionScore(inspection, conditionBands);
  const canEdit = canRecordFieldData(session);

  const numericResults = inspection.results.filter((r) => r.field.dataType === "NUMBER");
  const textResults = inspection.results.filter((r) => r.field.dataType !== "NUMBER");

  const details: EditableSection = {
    title: "Inspection Details",
    columns: 4,
    fields: [
      {
        name: "assetCode",
        label: inspection.asset.assetType.name,
        display: inspection.asset.assetCode,
        value: inspection.asset.assetCode,
        readOnly: true,
      },
      {
        name: "inspectionDate",
        label: "Date",
        display: formatDate(inspection.inspectionDate),
        value: toDateInputValue(inspection.inspectionDate),
        type: "date",
      },
      {
        name: "inspectionType",
        label: "Type",
        display: inspection.inspectionType,
        value: inspection.inspectionType,
        type: "select",
        options: INSPECTION_TYPES.map((t) => ({ value: t, label: t })),
      },
      {
        name: "requiresFollowUp",
        label: "Follow-up Required",
        display: inspection.requiresFollowUp ? "Yes" : "No",
        value: String(inspection.requiresFollowUp),
        type: "boolean",
      },
      // Who recorded it is part of the record's provenance, not a field to
      // correct after the fact.
      {
        name: "inspector",
        label: "Inspector",
        display: inspection.inspector.name ?? "—",
        value: inspection.inspector.name ?? "",
        readOnly: true,
      },
    ],
  };

  const ratings: EditableSection = {
    title: "Condition Assessment Results",
    fields: numericResults.map((r) => {
      const config = r.field.config as { min?: number; max?: number } | null;
      const max = config?.max ?? 10;
      return {
        name: `result:${r.id}`,
        label: r.field.label,
        display: r.numberValue != null ? `${r.numberValue} / ${max}` : "—",
        value: r.numberValue != null ? String(r.numberValue) : "",
        type: "number" as const,
        step: "any",
      };
    }),
  };

  const observations: EditableSection = {
    title: "Observations",
    fields: [
      ...textResults.map((r) => ({
        name: `result:${r.id}`,
        label: r.field.label,
        display: r.textValue ?? "—",
        value: r.textValue ?? "",
        type: "textarea" as const,
      })),
      {
        name: "notes",
        label: "Notes",
        display: inspection.notes ?? "—",
        value: inspection.notes ?? "",
        type: "textarea" as const,
      },
    ],
  };

  const sections = [details, ratings, observations].filter((s) => s.fields.length > 0);

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
        <SummaryStat label="Inspector" value={inspection.inspector.name ?? "—"} />
        <SummaryStat
          label="Condition (WCI)"
          value={condition ? `${condition.score} · ${condition.band.label}` : "—"}
          color={condition?.band.color}
        />
        <SummaryStat
          label="Data Quality"
          value={inspection.qualityScore ? `${Math.round(inspection.qualityScore * 100)}%` : "—"}
        />
        <SummaryStat label="Follow-up" value={inspection.requiresFollowUp ? "Required" : "Not required"} />
      </div>

      <RecordEditor
        sections={sections}
        action={saveInspectionAction}
        hiddenFields={{ inspectionId: inspection.id }}
        canEdit={canEdit}
        lockedNote="Executives have read-only access"
      />

      {parts.length > 0 && <PartsCard parts={parts} />}

      {(inspection.gpsLat != null || inspection.gpsLng != null) && (
        <Card className="mt-4">
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

/**
 * What was found on each component on this visit: the rating that became its
 * condition, the risk that followed, and the readings behind them.
 */
function PartsCard({ parts }: { parts: VisitPart[] }) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Components</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Condition</TableHead>
                <TableHead className="text-right">Risk</TableHead>
                <TableHead>Readings</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((p) => {
                const readings = p.readings.filter((r) => r.code !== "CONDITION");
                return (
                  <TableRow key={p.id} className="align-top">
                    <TableCell className="min-w-40">
                      <span className="font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.templateName}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.condition ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.risk ?? "—"}</TableCell>
                    <TableCell className="min-w-72 text-sm">
                      {readings.length === 0 ? (
                        <span className="text-muted-foreground">None recorded</span>
                      ) : (
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                          {readings.map((r) => (
                            <div key={r.code} className="contents">
                              <dt className="text-muted-foreground">{r.label}</dt>
                              <dd className="tabular-nums">{r.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64 text-sm text-muted-foreground">{p.notes ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
