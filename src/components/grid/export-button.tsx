"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";

/**
 * Downloads the grid as a spreadsheet.
 *
 * Carries the page's current query string to the export route, so the file
 * contains what is on screen — same filters, same sort — rather than the whole
 * table. A plain link rather than a fetch: the browser handles the download,
 * and the file never has to pass through JavaScript memory.
 */
export function ExportButton({
  href,
  count,
  label = "Export to Excel",
}: {
  /** Route that builds the workbook, e.g. "/assets/export". */
  href: string;
  /** Rows that will be exported, so the button says what it will produce. */
  count: number;
  label?: string;
}) {
  const params = useSearchParams();
  const query = params.toString();

  return (
    <Button
      nativeButton={false}
      size="sm"
      variant="outline"
      disabled={count === 0}
      title={
        count === 0
          ? "Nothing to export with the current filters"
          : `Download these ${count.toLocaleString()} rows as an .xlsx file`
      }
      render={
        <a href={query ? `${href}?${query}` : href} download>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </a>
      }
    />
  );
}
