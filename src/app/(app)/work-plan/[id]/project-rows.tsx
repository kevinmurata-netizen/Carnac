"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";

/**
 * A combined project as one row that twirls open to its treatments.
 *
 * The cells are rendered on the server and handed in whole; all this adds is
 * the open/closed state, so the treatment rows stay out of the way until
 * someone asks what the project is made of.
 */
export function ProjectRows({
  projectId,
  cells,
  children,
}: {
  /** "WL-0058 - Leak Repair, Spot Repair" */
  projectId: string;
  /** Every cell after the first. */
  cells: ReactNode;
  /** One row per treatment, shown when open. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow className={open ? "border-b-0 bg-muted/30" : undefined}>
        <TableCell>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={open ? "Hide the treatments in this project" : "Show the treatments in this project"}
            className="flex items-start gap-1 text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <ChevronRight
              className={`mt-0.5 h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
              aria-hidden
            />
            <span>{projectId}</span>
          </button>
        </TableCell>
        {cells}
      </TableRow>
      {open && children}
    </>
  );
}
