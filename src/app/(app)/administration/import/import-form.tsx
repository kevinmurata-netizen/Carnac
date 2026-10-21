"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validateImportAction, commitImportAction } from "./actions";
import { EMPTY_IMPORT_STATE, type ImportKind, type ImportState } from "./state";
import { AlertTriangle, CheckCircle2, FileUp } from "lucide-react";
import type { SampleFile } from "@/config/starter-packs";

export function ImportForm({
  kind,
  assetTypeId,
  assetTypeName,
  templateCsv,
  samples,
}: {
  kind: ImportKind;
  assetTypeId: string;
  assetTypeName: string;
  templateCsv: string;
  /** Made-up files from a starter pack, for trying the app out. */
  samples: SampleFile[];
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    validateImportAction,
    EMPTY_IMPORT_STATE
  );
  const [commitState, commitAction, committing] = useActionState<ImportState, FormData>(
    commitImportAction,
    EMPTY_IMPORT_STATE
  );

  // The commit result supersedes the validation result once it exists.
  const active = commitState.phase === "idle" ? state : commitState;
  const report = active.report;

  const [csv, setCsv] = useState(templateCsv);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A chosen file is read here, in the browser, into the box: what is sent is
  // what can be seen and edited.
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setLoadError(null);
    setCsv(await file.text());
  };
  const loadSample = async (sample: SampleFile) => {
    setLoadError(null);
    try {
      const response = await fetch(sample.url);
      if (!response.ok) throw new Error();
      setCsv(await response.text());
    } catch {
      setLoadError(`${sample.name} could not be loaded. Reload the page and try again.`);
    }
  };
  const hasErrors = (report?.errors.length ?? 0) > 0;
  const canCommit = report != null && !hasErrors && report.validRows.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Paste or upload CSV</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-3">
            <input type="hidden" name="assetTypeId" value={assetTypeId} />
            <input type="hidden" name="kind" value={kind} />
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                <FileUp className="mr-1.5 h-4 w-4" aria-hidden />
                Choose a CSV file
              </Button>
              {samples.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">or load sample data:</span>
                  {samples.map((s) => (
                    <Button key={s.url} type="button" size="sm" variant="ghost" onClick={() => void loadSample(s)}>
                      {s.name}
                    </Button>
                  ))}
                </>
              )}
            </div>
            {samples.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Sample data is a made-up network from a starter pack, for trying the app out before your own data
                is in — not for a live setup.{" "}
                {kind === "assets"
                  ? "Import each type's assets before its inspections."
                  : samples.length > 1
                    ? "Import them in the order listed, oldest first."
                    : "Import the assets first."}
              </p>
            )}
            {loadError && <p className="text-xs text-destructive">{loadError}</p>}
            <textarea
              name="csv"
              rows={8}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Nothing is written until you commit. Validation runs against the live database, so{" "}
                {kind === "inspections"
                  ? "an asset ID that doesn't exist is caught before import."
                  : "duplicate asset IDs are caught before import."}
              </p>
              <Button type="submit" disabled={pending}>
                {pending ? "Validating…" : "Validate"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {active.message && (
        <Card
          className={
            active.phase === "committed"
              ? "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
              : "border-destructive/40 bg-destructive/5"
          }
        >
          <CardContent className="flex items-center gap-3 py-4">
            {active.phase === "committed" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            <span className="text-sm font-medium">{active.message}</span>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>2. Validation Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <Stat label="Rows in file" value={report.totalRows} />
              <Stat label="Valid" value={report.validRows.length} tone={report.validRows.length > 0 ? "good" : undefined} />
              <Stat label="Errors" value={report.errors.length} tone={hasErrors ? "bad" : undefined} />
            </div>

            {report.unknownColumns.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Ignored unrecognised column{report.unknownColumns.length === 1 ? "" : "s"}:{" "}
                {report.unknownColumns.join(", ")}
              </p>
            )}

            {hasErrors && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row</TableHead>
                      <TableHead className="w-48">Column</TableHead>
                      <TableHead>Problem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.errors.slice(0, 100).map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{e.row}</TableCell>
                        <TableCell>{e.column}</TableCell>
                        <TableCell className="text-destructive">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {report.errors.length > 100 && (
                  <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                    Showing the first 100 of {report.errors.length} problems.
                  </div>
                )}
              </div>
            )}

            {report.validRows.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {report.previewColumns.map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.validRows.slice(0, 20).map((r) => (
                      <TableRow key={r.rowNumber}>
                        {r.preview.map((value, i) => (
                          <TableCell key={i} className={i === 0 ? "font-medium" : undefined}>
                            {value}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {report.validRows.length > 20 && (
                  <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                    Showing the first 20 of {report.validRows.length} valid rows.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>3. Commit</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={commitAction} className="flex items-center justify-between gap-4">
              <input type="hidden" name="csv" value={active.csv} />
              <input type="hidden" name="assetTypeId" value={assetTypeId} />
              <input type="hidden" name="kind" value={kind} />
              <p className="text-xs text-muted-foreground">
                {hasErrors
                  ? "Commit is disabled while the file has errors — fix them and validate again."
                  : kind === "inspections"
                    ? `${report.validRows.length} row${report.validRows.length === 1 ? "" : "s"} will be recorded as ${assetTypeName.toLowerCase()} inspections, oldest first, each scored by the condition index.`
                    : `${report.validRows.length} row${report.validRows.length === 1 ? "" : "s"} will be created as active ${assetTypeName.toLowerCase()} assets.`}
              </p>
              <Button type="submit" disabled={!canCommit || committing}>
                {committing ? "Importing…" : "Commit Import"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-semibold ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {tone === "bad" && <Badge variant="destructive" className="mt-1">Blocking</Badge>}
    </div>
  );
}
