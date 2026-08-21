import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getReport, type ReportColumn, type ReportRow } from "@/server/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";

const PREVIEW_LIMIT = 100;

function renderCell(value: string | number | null, column: ReportColumn) {
  if (value == null || value === "") return "—";
  switch (column.format) {
    case "currency":
      return formatCurrency(Number(value));
    case "number":
      return typeof value === "number" ? formatNumber(Math.round(value * 10) / 10) : String(value);
    case "percent":
      return `${value}%`;
    default:
      return String(value);
  }
}

export default async function ReportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) notFound();

  const session = await auth();
  const rows: ReportRow[] = await report.run(session!.user.organizationId);
  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <div>
      <SetBreadcrumb segment={id} label={report.name} />
      <PageHeader
        title={report.name}
        description={report.description}
        actions={
          <div className="flex items-center gap-3">
            <Button
              nativeButton={false}
              size="sm"
              render={<a href={`/reports/${report.id}/download`}>Download CSV</a>}
            />
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {report.columns.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={report.columns.length} className="py-10 text-center text-sm text-muted-foreground">
                      This report has no rows yet.
                    </TableCell>
                  </TableRow>
                )}
                {preview.map((row, i) => (
                  <TableRow key={i}>
                    {report.columns.map((c) => (
                      <TableCell key={c.key} className="max-w-md truncate">
                        {renderCell(row[c.key] ?? null, c)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            {rows.length > PREVIEW_LIMIT
              ? `Previewing the first ${PREVIEW_LIMIT} of ${formatNumber(rows.length)} rows — the CSV download contains all of them.`
              : `${formatNumber(rows.length)} row${rows.length === 1 ? "" : "s"}.`}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
