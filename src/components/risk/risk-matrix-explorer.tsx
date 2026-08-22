"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RiskMatrixAsset } from "@/server/risk";
import { formatNumber } from "@/lib/format";
import { X } from "lucide-react";

const POF_LABELS = ["Very Low", "Low", "Moderate", "High", "Very High"];
const COF_LABELS = ["Very Low (1)", "Low (2)", "Moderate (3)", "High (4)", "Very High (5)"];

type Band = { label: string; color: string };
type Cell = { p: number; c: number };

/**
 * The 5×5 matrix plus the segment table beneath it. Selecting a cell filters
 * the table to exactly the assets that cell counts.
 *
 * Every asset arrives with the cell it belongs to, assigned server-side by
 * riskMatrixCell — the same function that produced the counts — so a cell's
 * number and its list cannot disagree.
 */
export function RiskMatrixExplorer({
  matrix,
  assets,
  bandFor,
  assetLabel,
  topCount = 10,
}: {
  matrix: number[][];
  assets: RiskMatrixAsset[];
  /** Band per cell, resolved on the server so the domain stays out of here. */
  bandFor: Band[][];
  assetLabel: string;
  topCount?: number;
}) {
  const [selected, setSelected] = useState<Cell | null>(null);

  const inCell = selected ? assets.filter((a) => a.cellP === selected.p && a.cellC === selected.c) : [];
  const rows = selected ? inCell : assets.slice(0, topCount);

  const heading = selected
    ? `Probability ${selected.p + 1} × Consequence ${selected.c + 1}`
    : `Highest-Risk Segments`;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Risk Matrix</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Click any cell to list the segments it counts.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-center text-xs">
              <tbody>
                {[5, 4, 3, 2, 1].map((pof) => (
                  <tr key={pof}>
                    <td className="pr-2 text-right align-middle whitespace-nowrap text-muted-foreground">
                      {POF_LABELS[pof - 1]} ({pof})
                    </td>
                    {[1, 2, 3, 4, 5].map((cof) => {
                      const p = pof - 1;
                      const c = cof - 1;
                      const count = matrix[p][c];
                      const band = bandFor[p][c];
                      const isSelected = selected?.p === p && selected?.c === c;
                      const empty = count === 0;

                      return (
                        <td key={cof} className="p-0">
                          <button
                            type="button"
                            disabled={empty}
                            onClick={() => setSelected(isSelected ? null : { p, c })}
                            aria-pressed={isSelected}
                            aria-label={`Probability ${pof} by consequence ${cof}: ${count} segments`}
                            title={
                              empty
                                ? `POF ${pof} × COF ${cof} = ${pof * cof} (${band.label}) — no segments`
                                : `POF ${pof} × COF ${cof} = ${pof * cof} (${band.label}) — ${count} segments`
                            }
                            className={`h-12 w-16 rounded-md font-semibold transition-all ${
                              empty ? "cursor-default" : "cursor-pointer hover:brightness-110"
                            } ${isSelected ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                            style={{
                              backgroundColor: `${band.color}${empty ? "26" : ""}`,
                              color: empty ? "transparent" : "white",
                            }}
                          >
                            {count}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td />
                  {COF_LABELS.map((label) => (
                    <td key={label} className="pt-1 text-muted-foreground">
                      {label}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>↑ Probability of Failure</span>
            <span>Consequence of Failure →</span>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle>
              {heading}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({formatNumber(rows.length)}
                {selected ? "" : ` of ${formatNumber(assets.length)}`})
              </span>
            </CardTitle>
            {selected && (
              <p className="mt-1 text-xs text-muted-foreground">
                Every segment counted in that cell, highest risk first.
              </p>
            )}
          </div>
          {selected && (
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setSelected(null)}>
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{assetLabel}</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Probability (1–5)</TableHead>
                  <TableHead>Consequence (1–5)</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Band</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No risk assessments yet.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.assetId}>
                    <TableCell>
                      <Link
                        href={`/assets/${row.assetId}?tab=risk`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.assetCode}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{row.serviceArea ?? "—"}</TableCell>
                    <TableCell>
                      {row.conditionScore != null && row.conditionBand ? (
                        <span style={{ color: row.conditionBand.color }}>
                          {row.conditionScore} · {row.conditionBand.label}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{row.pof}</TableCell>
                    <TableCell>{row.cof}</TableCell>
                    <TableCell className="font-medium" style={{ color: row.band.color }}>
                      {row.riskScore}
                    </TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: row.band.color, color: "white" }}>{row.band.label}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!selected && assets.length > rows.length && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Showing the {rows.length} highest-risk of {formatNumber(assets.length)} assessed segments. Click a
              matrix cell above to see a specific probability and consequence combination instead.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
