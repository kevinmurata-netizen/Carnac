import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listInspections, listInspectors, summarizeInspectionScore } from "@/server/inspections";
import { listSavedFilters } from "@/server/saved-filters";
import { inspectionFiltersFromParams } from "@/server/grid-params";
import { INSPECTION_TYPES } from "@/domain/waterline/inspection";
import { PageHeader } from "@/components/layout/page-header";
import { InspectionFilterBar } from "@/components/filters/inspection-filter-bar";
import { SavedFilterSelect } from "@/components/filters/saved-filter-select";
import { ColumnHeader } from "@/components/grid/column-header";
import { ExportButton } from "@/components/grid/export-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { ASSET_LABEL } from "@/config/labels";
import { getConditionBands } from "@/server/settings";
import { getPageName } from "@/server/navigation";

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/inspections", "Inspections");
  const conditionBands = await getConditionBands(organizationId);

  // Parsed by the same code the export route uses, so the spreadsheet can
  // never disagree with the screen.
  const filters = await inspectionFiltersFromParams(organizationId, params);

  const [inspections, inspectors, savedFilters] = await Promise.all([
    listInspections(organizationId, filters),
    listInspectors(organizationId),
    listSavedFilters(organizationId),
  ]);

  // WCI is derived from measurements and the organization's condition bands,
  // so the query cannot order by it. Sorting it here keeps that knowledge on
  // the page that already computes the score. Unscored rows sort last in both
  // directions — a column of dashes on top is never what was wanted.
  const rows =
    params.sort === "wci"
      ? [...inspections].sort((a, b) => {
          const av = summarizeInspectionScore(a, conditionBands)?.score ?? null;
          const bv = summarizeInspectionScore(b, conditionBands)?.score ?? null;
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return params.dir === "desc" ? bv - av : av - bv;
        })
      : inspections;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`${formatNumber(rows.length)} inspection${rows.length === 1 ? "" : "s"} matching current filters`}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton href="/inspections/export" count={rows.length} />
            {canRecordFieldData(session) && (
              <Button render={<Link href="/inspections/new">New Inspection</Link>} nativeButton={false} />
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <SavedFilterSelect
          filters={savedFilters.map((f) => ({ id: f.id, name: f.name, criteriaCount: f.criteria.length }))}
        />
      </div>

      <InspectionFilterBar
        inspectionTypes={INSPECTION_TYPES}
        inspectors={inspectors}
        values={params}
        action="/inspections"
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ColumnHeader label={ASSET_LABEL.singular} sortKey="assetCode" />
                <ColumnHeader label="Date" sortKey="inspectionDate" />
                <ColumnHeader
                  label="Type"
                  sortKey="inspectionType"
                  filterParam="inspectionType"
                  options={[...INSPECTION_TYPES]}
                />
                <ColumnHeader label="Inspector" sortKey="inspector" filterParam="inspector" options={inspectors} />
                <ColumnHeader label="WCI Score" sortKey="wci" />
                <ColumnHeader label="Quality" sortKey="qualityScore" />
                <ColumnHeader label="Follow-up" sortKey="requiresFollowUp" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No inspections match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((inspection) => {
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
