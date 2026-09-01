"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import type { WciFlowLink } from "@/server/model-results";

/**
 * Every band-to-band path, openable into the segments behind it.
 *
 * A row like "Good → Poor, 23 segments" is the point at which someone asks
 * *which* 23, and previously the answer was to go and rebuild the query
 * elsewhere. Clicking a row now answers it in place, with each segment linking
 * through to its own page.
 */
export function FlowTable({ links, total }: { links: WciFlowLink[]; total: number }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Segments</TableHead>
            <TableHead>Share</TableHead>
            <TableHead>Direction</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.map((l) => {
            const key = `${l.fromBand}-${l.toBand}`;
            const open = openKey === key;
            return (
              <FlowRows
                key={key}
                link={l}
                total={total}
                open={open}
                onToggle={() => setOpenKey(open ? null : key)}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function FlowRows({
  link,
  total,
  open,
  onToggle,
}: {
  link: WciFlowLink;
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  const label = `${link.fromBand} to ${link.toBand}, ${link.value} segments`;

  return (
    <>
      <TableRow
        onClick={onToggle}
        aria-expanded={open}
        className={`cursor-pointer ${open ? "bg-muted/60" : "hover:bg-muted/40"}`}
      >
        <TableCell className="pr-0">
          {/* A real button, so the row is reachable and toggleable by keyboard
              rather than only by mouse. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={open ? `Hide segments for ${label}` : `Show segments for ${label}`}
            className="rounded p-0.5 hover:bg-muted"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        </TableCell>
        <TableCell>{link.fromBand}</TableCell>
        <TableCell>{link.toBand}</TableCell>
        <TableCell className="font-medium">{formatNumber(link.value)}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {total > 0 ? `${Math.round((link.value / total) * 100)}%` : "—"}
        </TableCell>
        <TableCell>
          {link.direction === "improved" && (
            <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
              <ArrowUpRight className="mr-1 h-3 w-3" />
              Improved
            </Badge>
          )}
          {link.direction === "declined" && (
            <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">
              <ArrowDownRight className="mr-1 h-3 w-3" />
              Declined
            </Badge>
          )}
          {link.direction === "unchanged" && (
            <Badge variant="secondary">
              <Minus className="mr-1 h-3 w-3" />
              Held
            </Badge>
          )}
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-muted/30 p-0">
            <div className="px-4 py-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {formatNumber(link.assets.length)} segment{link.assets.length === 1 ? "" : "s"} went from{" "}
                <span className="font-medium text-foreground">{link.fromBand}</span> to{" "}
                <span className="font-medium text-foreground">{link.toBand}</span>, worst final condition first.
              </p>
              <div className="overflow-x-auto rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Segment</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Start WCI</TableHead>
                      <TableHead>End WCI</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Treatments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {link.assets.map((a) => {
                      const delta = Math.round((a.endCondition - a.startCondition) * 10) / 10;
                      return (
                        <TableRow key={a.assetId}>
                          <TableCell>
                            <Link
                              href={`/assets/${a.assetId}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {a.assetCode}
                            </Link>
                          </TableCell>
                          <TableCell>{a.material ?? "—"}</TableCell>
                          <TableCell>{a.startCondition}</TableCell>
                          <TableCell>{a.endCondition}</TableCell>
                          <TableCell
                            className={
                              delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground"
                            }
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </TableCell>
                          <TableCell>
                            {a.treatments === 0 ? (
                              <span className="text-xs text-muted-foreground">none</span>
                            ) : (
                              <Badge variant="secondary">
                                {a.treatments}×
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
