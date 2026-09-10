"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import type { ScaleFactorPreview as Result } from "@/server/scale-factors";

/**
 * What a scale factor does to the network, drawn while it is written.
 *
 * Deliberately not a histogram. A scale factor is a multiplier, not a rating,
 * so the question is not "how are assets distributed" but "how far apart does
 * this push them" — a factor spanning 400× reorders the whole plan, one
 * spanning 3× barely touches it. So the spread leads, and the extremes are
 * named so the author can sanity-check both ends against assets they know.
 */
export function ScaleFactorPreviewPanel(result: Result, assetCount: number) {
  return <Panel result={result} assetCount={assetCount} />;
}

function Panel({ result, assetCount }: { result: Result; assetCount: number }) {
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

  if (!result.assetsScored) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Nothing to try it on — this asset type has no assets yet.
        </CardContent>
      </Card>
    );
  }

  const missing = result.assetsMissingInputs ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Tried on {formatNumber(result.assetsScored)} of {formatNumber(assetCount)} assets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Smallest" value={formatNumber(result.min ?? 0)} />
          <Stat label="Median" value={formatNumber(result.median ?? 0)} />
          <Stat label="Largest" value={formatNumber(result.max ?? 0)} />
          <Stat
            label="Spread"
            value={result.spread != null ? `${formatNumber(result.spread)}×` : "—"}
            hint="largest ÷ smallest"
          />
        </div>

        {missing > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
            {formatNumber(missing)} {missing === 1 ? "asset is" : "assets are"} missing a field this formula reads, so
            {missing === 1 ? " it falls" : " they fall"} back to a factor of 1. Where the rest of the network scores in
            the hundreds or thousands, that puts {missing === 1 ? "it" : "them"} last. Flooring the formula —{" "}
            <code className="font-mono">max(LENGTH, 500)</code> — is usually better than leaving that to chance.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FactorList title="Largest" rows={result.highest ?? []} />
          <FactorList title="Smallest" rows={result.lowest ?? []} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg tabular-nums">{value}</div>
      {hint && <div className="text-[0.7rem] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function FactorList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ assetId: string; assetCode: string; factor: number; missing: string[] }>;
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</h4>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.assetId} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{r.assetCode}</span>
            <span className="flex items-center gap-1.5">
              {r.missing.length > 0 && <Badge variant="secondary">missing input</Badge>}
              <span className="font-mono tabular-nums">{formatNumber(r.factor)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
