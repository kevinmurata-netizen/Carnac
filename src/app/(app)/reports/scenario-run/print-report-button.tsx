"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReportButton() {
  return (
    <div className="report-controls flex flex-col items-end gap-1">
      <Button type="button" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Print / Save as PDF
      </Button>
      <p className="text-xs text-muted-foreground">Choose a printer or Save as PDF in the print dialog.</p>
    </div>
  );
}
