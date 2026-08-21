import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getWaterlineTemplate } from "@/server/inspections";
import { listAssetOptions } from "@/server/assets";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INSPECTION_TYPES } from "@/domain/waterline/inspection";
import { createInspectionAction } from "./actions";
import { ASSET_LABEL } from "@/config/labels";

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ assetId?: string }>;
}) {
  const { assetId } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  if (!canRecordFieldData(session)) {
    redirect("/inspections");
  }

  const [template, assets] = await Promise.all([
    getWaterlineTemplate(organizationId),
    listAssetOptions(organizationId),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title="New Inspection" description={template.name} />

      <form action={createInspectionAction} className="space-y-4">
        <input type="hidden" name="templateId" value={template.id} />

        <Card>
          <CardHeader>
            <CardTitle>Inspection Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assetId">{ASSET_LABEL.singular}</Label>
              <select
                id="assetId"
                name="assetId"
                required
                defaultValue={assetId ?? ""}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>
                  Select a waterline segment…
                </option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assetCode}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspectionType">Inspection Type</Label>
              <select
                id="inspectionType"
                name="inspectionType"
                required
                defaultValue="Routine"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {INSPECTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspectionDate">Inspection Date</Label>
              <input
                id="inspectionDate"
                name="inspectionDate"
                type="date"
                required
                defaultValue={today}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <input id="requiresFollowUp" name="requiresFollowUp" type="checkbox" className="h-4 w-4" />
              <Label htmlFor="requiresFollowUp" className="font-normal">
                Flag this {ASSET_LABEL.lower} for follow-up
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gpsLat">GPS Latitude (optional)</Label>
              <input
                id="gpsLat"
                name="gpsLat"
                type="number"
                step="any"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gpsLng">GPS Longitude (optional)</Label>
              <input
                id="gpsLng"
                name="gpsLng"
                type="number"
                step="any"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Condition Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Score each item 0 (severe deficiency) to 10 (no issue observed). These scores combine into the
              Waterline Condition Index using a transparent weighted average.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {template.fields
                .filter((f) => f.dataType === "NUMBER")
                .map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label htmlFor={`field_${field.id}`}>
                      {field.label}
                      {field.isRequired && <span className="text-destructive"> *</span>}
                    </Label>
                    <input
                      id={`field_${field.id}`}
                      name={`field_${field.id}`}
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      required={field.isRequired}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">
                      {(field.config as { helpText?: string } | null)?.helpText}
                    </p>
                  </div>
                ))}
            </div>
            {template.fields
              .filter((f) => f.dataType === "TEXT")
              .map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <Label htmlFor={`field_${field.id}`}>{field.label}</Label>
                  <Textarea id={`field_${field.id}`} name={`field_${field.id}`} rows={2} />
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea name="notes" rows={3} placeholder="Additional observations…" />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="submit">Save Inspection</Button>
        </div>
      </form>
    </div>
  );
}
