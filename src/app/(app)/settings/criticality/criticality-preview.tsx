"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormulaPreview } from "@/server/criticality";

/**
 * What a criticality formula does to the network, drawn while it is written.
 *
 * A formula that parses can still be wrong in the way that matters —
 * everything scoring 100, or a dropdown value nobody mapped quietly counting
 * as nothing — and the only way to see that is to run it against real assets.
 * The distribution is the point: criticality is a 0-100 rating, so a histogram
 * says immediately whether it is spreading assets out or bunching them.
 */
export function CriticalityPreview(result: FormulaPreview, assetCount: number) {
  return <PreviewPanel result={result} assetCount={assetCount} />;
}

function PreviewPanel({ result, assetCount }: { result: FormulaPreview; assetCount: number }) {
  if (!result.ok) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-4">
          <p className="text-sm text-destructive">{result.error}</p>
          {result.errorAt != null && (
            <p className="mt-1 text-xs text-muted-foreground">At character {result.errorAt + 1}.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const peak = Math.max(1, ...(result.histogram ?? [1]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Tried on {result.assetsScored?.toLocaleString()} assets
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            lowest {result.min} · average {result.average} · highest {result.max}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-4">
        {result.assetsMissingInputs != null && result.assetsMissingInputs > 0 && (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {result.assetsMissingInputs.toLocaleString()} of {assetCount.toLocaleString()} assets are missing a value
            this formula reads — usually a dropdown value with no number set. They score as if it were zero, which
            will drag them down the ranking.
          </p>
        )}

        <div>
          <div className="mb-1 text-xs text-muted-foreground">How the scores spread, in tens</div>
          {/* Bars and labels are separate rows: a percentage height only
              resolves against a parent with a definite height, and a column
              that also holds its own label has neither. */}
          <div className="flex h-24 items-end gap-1">
            {(result.histogram ?? []).map((count, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${Math.max((count / peak) * 100, count > 0 ? 3 : 0)}%` }}
                title={`${count} asset${count === 1 ? "" : "s"} scored ${i * 10}–${i * 10 + 9}`}
              />
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {(result.histogram ?? []).map((count, i) => (
              <div key={i} className="flex-1 text-center">
                <div className="text-[10px] text-foreground">{count}</div>
                <div className="text-[9px] text-muted-foreground">{i * 10}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ScoreList title="Would rank first" rows={result.highest ?? []} />
          <ScoreList title="Would rank last" rows={result.lowest ?? []} />
        </div>

        {result.fieldsUsed && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Reads:</span>
            {result.fieldsUsed.map((f) => (
              <Badge key={f} variant="secondary" className="font-mono text-[10px] font-normal">
                {f}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ assetId: string; assetCode: string; score: number }>;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="rounded-md border">
        {rows.map((r) => (
          <li key={r.assetId} className="flex items-center justify-between border-b px-3 py-1.5 text-xs last:border-b-0">
            <Link href={`/assets/${r.assetId}`} className="font-medium text-primary hover:underline">
              {r.assetCode}
            </Link>
            <span className="font-mono">{r.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
