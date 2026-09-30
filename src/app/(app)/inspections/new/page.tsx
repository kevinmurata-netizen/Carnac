import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getInspectionSubject } from "@/server/inspections";
import { listAssetOptions } from "@/server/assets";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INSPECTION_TYPES } from "@/domain/waterline/inspection";
import { getVisitComponents } from "@/server/component-inspections";
import { createInspectionAction } from "./actions";
import { ComponentSection } from "./component-section";

const control =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Recording an inspection, in two steps: which asset, then its own form.
 *
 * The form has to follow the asset, because what is asked differs by kind — a
 * reservoir is asked about its roof and its sanitary vents, a pipe about its
 * joints and its bore. Choosing the asset first is what lets the right
 * questions be rendered on the server, with no guessing and no form that
 * changes under the person filling it in.
 */
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

  const subject = assetId ? await getInspectionSubject(organizationId, assetId) : null;

  if (!subject) {
    const assets = await listAssetOptions(organizationId);
    return <ChooseAsset assets={assets} />;
  }

  const { asset, template, conditionModel } = subject;
  const today = new Date().toISOString().slice(0, 10);
  // Only the parts this asset has — which is why a visit is recorded per
  // asset, not per type.
  const components = template ? await getVisitComponents(organizationId, asset.id) : [];

  if (!template) {
    return (
      <div>
        <PageHeader title="New Inspection" description={`${asset.assetCode} · ${asset.assetType.name}`} />
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {asset.assetType.name} has no active inspection form, so there is nothing to fill in yet.
            </p>
            <p className="text-sm text-muted-foreground">
              A form belongs to one kind of asset and is added from the type itself, under{" "}
              <Link href="/settings/asset-types" className="text-primary hover:underline">
                Settings → Asset Types
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="New Inspection" description={template.name} />

      <form action={createInspectionAction} className="space-y-4">
        <input type="hidden" name="templateId" value={template.id} />
        <input type="hidden" name="assetId" value={asset.id} />

        <Card>
          <CardHeader>
            <CardTitle>Inspection Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{asset.assetType.name}</Label>
              <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm">
                <span className="truncate">
                  <span className="font-medium">{asset.assetCode}</span>
                  {asset.name && <span className="text-muted-foreground"> · {asset.name}</span>}
                </span>
                <Link href="/inspections/new" className="shrink-0 text-xs text-primary hover:underline">
                  Change
                </Link>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspectionType">Inspection Type</Label>
              <select id="inspectionType" name="inspectionType" required defaultValue="Routine" className={control}>
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
                className={control}
              />
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <input id="requiresFollowUp" name="requiresFollowUp" type="checkbox" className="h-4 w-4" />
              <Label htmlFor="requiresFollowUp" className="font-normal">
                Flag this {asset.assetType.name.toLowerCase()} for follow-up
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gpsLat">GPS Latitude (optional)</Label>
              <input id="gpsLat" name="gpsLat" type="number" step="any" className={control} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gpsLng">GPS Longitude (optional)</Label>
              <input id="gpsLng" name="gpsLng" type="number" step="any" className={control} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Condition Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Score each item 0 (severe deficiency) to 10 (no issue observed).{" "}
              {conditionModel
                ? `These scores combine into the ${conditionModel.name} using a transparent weighted average.`
                : `${asset.assetType.name} has no condition model yet, so the answers are recorded but no condition score is derived from them.`}
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
                      className={control}
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

        {components.length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Components</h2>
              <p className="text-sm text-muted-foreground">
                Each part this {asset.assetType.name.toLowerCase()} has. Rate its condition and record what was
                measured; mark a part not inspected if this visit didn&apos;t reach it.
              </p>
            </div>
            {components.map((component) => (
              <ComponentSection key={component.id} component={component} />
            ))}
          </div>
        )}

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

/**
 * Step one. A GET form, so the choice lands in the URL and the page comes back
 * with the right questions — and so the "Record inspection" links that already
 * carry ?assetId skip this step entirely, as they always did.
 */
function ChooseAsset({
  assets,
}: {
  assets: Array<{ id: string; assetCode: string; name: string | null; typeCode: string; typeName: string }>;
}) {
  const byType = new Map<string, typeof assets>();
  for (const asset of assets) {
    const group = byType.get(asset.typeName) ?? [];
    group.push(asset);
    byType.set(asset.typeName, group);
  }

  return (
    <div>
      <PageHeader title="New Inspection" description="What is being inspected?" />
      <form method="get" action="/inspections/new">
        <Card>
          <CardHeader>
            <CardTitle>Choose an asset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-md space-y-1.5">
              <Label htmlFor="assetId">Asset</Label>
              <select id="assetId" name="assetId" required defaultValue="" className={control}>
                <option value="" disabled>
                  Select an asset…
                </option>
                {[...byType.entries()].map(([typeName, group]) => (
                  <optgroup key={typeName} label={typeName}>
                    {group.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.assetCode}
                        {a.name ? ` · ${a.name}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                The questions come from the asset&rsquo;s own kind, so this is chosen first.
              </p>
            </div>
            <Button type="submit">Continue</Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
