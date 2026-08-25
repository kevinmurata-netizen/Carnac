import Link from "next/link";
import { notFound } from "next/navigation";
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
import { saveInspectionAction } from "./actions";

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const conditionBands = await getConditionBands(organizationId);

  const inspection = await getInspectionById(organizationId, id);
  if (!inspection) notFound();

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
        label: "Segment",
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
