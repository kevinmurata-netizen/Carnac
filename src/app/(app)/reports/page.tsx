import Link from "next/link";
import { REPORTS, type ReportCategory } from "@/server/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText } from "lucide-react";
import { getPageName } from "@/server/navigation";
import { auth } from "@/lib/auth";

const CATEGORY_ORDER: ReportCategory[] = ["Inventory", "Condition & Risk", "Planning", "Financial"];

export default async function ReportsPage() {
  const session = await auth();
  const pageTitle = await getPageName(session!.user.organizationId, "/reports", "Reports");

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Every report exports to CSV; each is a declared column set over live data, so PDF and Excel can be added without rewriting the reports"
      />

      {CATEGORY_ORDER.map((category) => {
        const reports = REPORTS.filter((r) => r.category === category);
        if (reports.length === 0) return null;
        return (
          <Card key={category} className="mb-4">
            <CardHeader>
              <CardTitle>{category}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report</TableHead>
                    <TableHead>Columns</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.description}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.columns.length}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/reports/${r.id}`}
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Preview
                          </Link>
                          <a
                            href={`/reports/${r.id}/download`}
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            CSV
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
