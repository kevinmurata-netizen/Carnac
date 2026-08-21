import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReport, toCsv, reportFileName } from "@/server/reports";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const report = getReport(id);
  if (!report) return new NextResponse("Report not found", { status: 404 });

  const rows = await report.run(session.user.organizationId);
  const csv = toCsv(report, rows);

  return new NextResponse(csv, {
    headers: {
      // UTF-8 BOM so Excel opens accented characters correctly.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFileName(report)}"`,
      "Cache-Control": "no-store",
    },
  });
}
