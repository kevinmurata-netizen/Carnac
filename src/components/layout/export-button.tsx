import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Download a table as a real .xlsx workbook.
 *
 * A plain anchor rather than a button with an onClick, because the export
 * routes are GETs with nothing to post: a link works with the middle mouse
 * button, can be copied, and needs no JavaScript to have loaded. `download` is
 * deliberately absent — the server sets Content-Disposition, and letting it
 * name the file keeps the name in one place rather than two that can disagree.
 */
export function ExportButton({
  href,
  label = "Export to Excel",
  title,
}: {
  href: string;
  label?: string;
  /** What the file will contain, when that is not obvious from where the
   * button sits. */
  title?: string;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      nativeButton={false}
      render={
        <a href={href} title={title}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </a>
      }
    />
  );
}
