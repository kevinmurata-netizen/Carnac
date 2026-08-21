import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listInspections, summarizeInspectionScore } from "@/server/inspections";
import { INSPECTION_TYPES } from "@/domain/waterline/inspection";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { ASSET_LABEL } from "@/config/labels";
import { getConditionBands } from "@/server/settings";
import { getPageName } from "@/server/navigation";

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; inspectionType?: string; requiresFollowUp?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/inspections", "Inspections");
  const conditionBands = await getConditionBands(organizationId);

  const inspections = await listInspections(organizationId, {
    search: params.search || undefined,
    inspectionType: params.inspectionType || undefined,
    requiresFollowUp: params.requiresFollowUp === "on",
  });

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`${formatNumber(inspections.length)} inspection${inspections.length === 1 ? "" : "s"} matching current filters`}
        actions={
          canRecordFieldData(session) ? (
            <Button render={<Link href="/inspections/new">New Inspection</Link>} nativeButton={false} />
          ) : undefined
        }
      />

      <form method="get" action="/inspections" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="search">
            {ASSET_LABEL.singular} ID
          </label>
          <input
            id="search"
            name="search"
            defaultValue={params.search}
            placeholder="WL-0001"
            className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="inspectionType">
            Type
          </label>
          <select
            id="inspectionType"
            name="inspectionType"
            defaultValue={params.inspectionType ?? ""}
            className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All types</option>
            {INSPECTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 pb-1.5">
          <input
            id="requiresFollowUp"
            name="requiresFollowUp"
            type="checkbox"
            defaultChecked={params.requiresFollowUp === "on"}
            className="h-4 w-4"
          />
          <label htmlFor="requiresFollowUp" className="text-sm text-muted-foreground">
            Follow-up required only
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Apply
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/inspections">Reset</Link>} />
        </div>
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ASSET_LABEL.singular}</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Inspector</TableHead>
                <TableHead>WCI Score</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Follow-up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inspections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No inspections match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {inspections.map((inspection) => {
                const condition = summarizeInspectionScore(inspection, conditionBands);
                return (
                  <TableRow key={inspection.id}>
                    <TableCell>
                      <Link href={`/inspections/${inspection.id}`} className="font-medium text-primary hover:underline">
                        {inspection.asset.assetCode}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(inspection.inspectionDate)}</TableCell>
                    <TableCell>{inspection.inspectionType}</TableCell>
                    <TableCell>{inspection.inspector.name}</TableCell>
                    <TableCell>
                      {condition ? (
                        <span className="font-medium" style={{ color: condition.band.color }}>
                          {condition.score} · {condition.band.label}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{inspection.qualityScore ? `${Math.round(inspection.qualityScore * 100)}%` : "—"}</TableCell>
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
    </div>
  );
}
