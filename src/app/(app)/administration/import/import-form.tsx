"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validateImportAction, commitImportAction } from "./actions";
import { EMPTY_IMPORT_STATE, type ImportState } from "./state";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function ImportForm({ templateCsv }: { templateCsv: string }) {
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
            <textarea
              name="csv"
              rows={8}
              defaultValue={active.csv || templateCsv}
              spellCheck={false}
              className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Nothing is written until you commit. Validation runs against the live database, so duplicate asset
                IDs are caught before import.
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
                      <TableHead>Asset ID</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Diameter</TableHead>
                      <TableHead>Length</TableHead>
                      <TableHead>Installed</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Service Area</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.validRows.slice(0, 20).map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="font-medium">{r.assetCode}</TableCell>
                        <TableCell>{r.material}</TableCell>
                        <TableCell>{r.diameter}&quot;</TableCell>
                        <TableCell>{r.length}</TableCell>
                        <TableCell>{r.installationYear}</TableCell>
                        <TableCell>{r.condition ?? "—"}</TableCell>
                        <TableCell>{r.serviceArea ?? "—"}</TableCell>
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
              <p className="text-xs text-muted-foreground">
                {hasErrors
                  ? "Commit is disabled while the file has errors — fix them and validate again."
                  : `${report.validRows.length} row${report.validRows.length === 1 ? "" : "s"} will be created as ACTIVE waterline segments.`}
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
