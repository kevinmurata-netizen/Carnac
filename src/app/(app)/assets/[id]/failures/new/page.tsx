import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getAssetById } from "@/server/assets";
import { listFailureTypes } from "@/server/failures";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FAILURE_SEVERITIES } from "@/domain/waterline/failure";
import { createFailureAction } from "./actions";

export default async function NewFailurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  if (!canRecordFieldData(session)) {
    redirect(`/assets/${id}?tab=failures`);
  }

  const [asset, failureTypes] = await Promise.all([
    getAssetById(organizationId, id),
    listFailureTypes(organizationId),
  ]);
  if (!asset) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title="Record Failure" description={asset.assetCode} />

      <form action={createFailureAction} className="space-y-4">
        <input type="hidden" name="assetId" value={asset.id} />

        <Card>
          <CardHeader>
            <CardTitle>Failure Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="failureTypeId">Failure Type</Label>
              <select
                id="failureTypeId"
                name="failureTypeId"
                required
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>
                  Select a failure type…
                </option>
                {failureTypes.map((ft) => (
                  <option key={ft.id} value={ft.id}>
                    {ft.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="severity">Severity</Label>
              <select
                id="severity"
                name="severity"
                required
                defaultValue="Moderate"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {FAILURE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="failureDate">Failure Date</Label>
              <input
                id="failureDate"
                name="failureDate"
                type="date"
                required
                defaultValue={today}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cause">Cause</Label>
              <input
                id="cause"
                name="cause"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repairCost">Repair Cost ($)</Label>
              <input
                id="repairCost"
                name="repairCost"
                type="number"
                min={0}
                step="any"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="downtimeHours">Downtime (hours)</Label>
              <input
                id="downtimeHours"
                name="downtimeHours"
                type="number"
                min={0}
                step="any"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customersAffected">Customers Affected</Label>
              <input
                id="customersAffected"
                name="customersAffected"
                type="number"
                min={0}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="restorationTime">Restoration Time (hours)</Label>
              <input
                id="restorationTime"
                name="restorationTime"
                type="number"
                min={0}
                step="any"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consequence Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea name="consequenceNotes" rows={3} placeholder="Service disruption, emergency response, etc." />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="submit">Save Failure</Button>
        </div>
      </form>
    </div>
  );
}
