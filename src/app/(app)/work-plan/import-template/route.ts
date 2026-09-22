import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { workPlanImportTemplate } from "@/server/workplan-import";
import { excelFileName, XLSX_CONTENT_TYPE } from "@/server/excel";

/**
 * The spreadsheet to fill in for a work plan import: the columns, how to fill
 * them, and every treatment and combination name the library accepts.
 */
export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const buffer = await workPlanImportTemplate(session.user.organizationId);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName("Work Plan Import Template")}"`,
      "Cache-Control": "no-store",
    },
  });
}
