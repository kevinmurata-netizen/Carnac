"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ExportButton } from "@/components/layout/export-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import { previewImportAction, commitImportAction } from "../actions";
import type { WorkPlanImportPreview } from "@/server/workplan-import";

const field =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Into a plan that exists, or into a new one the import creates. */
type Target = { workPlanId: string; startYear: number; endYear: number } | { newPlan: true };

/**
 * Import programmed work from a spreadsheet: choose a file, see exactly what
 * it would add, then import. The file is checked on the server both times, so
 * what is written is what the preview showed — or, if the library changed in
 * between, a fresh preview saying why not.
 *
 * Opened for a new plan, it also asks what to call the plan and, optionally,
 * its period and budget. The plan is created only when the import is — with
 * the spreadsheet's projects and nothing else — so cancelling leaves nothing
 * behind.
 */
export function ImportDialog(target: Target) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WorkPlanImportPreview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startBusy] = useTransition();
  const [committing, setCommitting] = useState(false);
  const isNew = "newPlan" in target;
  const [plan, setPlan] = useState({ name: "", startYear: "", endYear: "", annualBudget: "" });

  const form = (f: File) => {
    const data = new FormData();
    if ("workPlanId" in target) data.set("workPlanId", target.workPlanId);
    else for (const [key, value] of Object.entries(plan)) data.set(key, value);
    data.set("file", f);
    return data;
  };

  const check = (f: File) =>
    startBusy(async () => {
      setPreview(null);
      setMessage(null);
      const outcome = await previewImportAction(form(f));
      if (outcome.ok) setPreview(outcome.preview);
      else setMessage({ ok: false, text: outcome.message });
    });

  const commit = () =>
    file &&
    startBusy(async () => {
      setCommitting(true);
      const outcome = await commitImportAction(form(file));
      setCommitting(false);
      if (!outcome.ok) {
        setMessage({ ok: false, text: outcome.message });
        return;
      }
      if (outcome.imported == null || outcome.imported === 0) {
        // Checked again and something changed; show what the server now sees.
        setPreview(outcome.preview);
        setMessage({ ok: false, text: "Nothing was imported — the file no longer checks out. See below." });
        return;
      }
      if (isNew && outcome.workPlanId) {
        // Straight to the plan it made.
        router.push(`/work-plan/${outcome.workPlanId}`);
        return;
      }
      setPreview(null);
      setFile(null);
      if (input.current) input.current.value = "";
      setMessage({
        ok: true,
        text: `Imported ${formatNumber(outcome.imported)} project${outcome.imported === 1 ? "" : "s"} from ${outcome.preview.fileName}.`,
      });
      router.refresh();
    });

  const blocked = preview != null && (preview.errors.length > 0 || preview.missingColumns.length > 0);
  const ready = preview != null && !blocked && preview.toImport > 0 && (!isNew || plan.name.trim() !== "");
  // The plan's details decide what the file is checked against, so a change
  // to them re-checks a file already chosen.
  const recheck = () => {
    if (file) check(file);
  };

  return (
    <>
      {isNew ? (
        <Button type="button" onClick={() => setOpen(true)}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          New plan from a spreadsheet
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Upload className="mr-1.5 h-4 w-4" />
          Import
        </Button>
      )}

      <EditorDialog
        open={open}
        onClose={() => setOpen(false)}
        title={isNew ? "New plan from a spreadsheet" : "Import programmed work"}
        description={
          isNew ? (
            <>
              A plan holding the spreadsheet&apos;s projects and nothing else: one row per project, with the
              segment&apos;s <strong>Asset ID</strong>, the <strong>Treatment</strong> or combination by its library
              name, and the <strong>Year</strong> the money is spent. Programmed Year, Build Year, Cost, Status, Funding
              and Notes are optional. The plan is created when you import, and not before.
            </>
          ) : (
            <>
              Bring in work that is already committed, from an Excel or CSV file: one row per project, with the
              segment&apos;s <strong>Asset ID</strong>, the <strong>Treatment</strong> or combination by its library
              name, and the <strong>Year</strong> the money is spent ({target.startYear}–{target.endYear}). Programmed
              Year, Build Year, Cost, Status, Funding and Notes are optional. Work already in the plan stays; nothing is
              written until you import.
            </>
          )
        }
      >
        <div className="space-y-4">
          {isNew && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-4">
                <Label htmlFor="import-plan-name">Plan name</Label>
                <input
                  id="import-plan-name"
                  value={plan.name}
                  onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                  onBlur={recheck}
                  placeholder="e.g. 2026–2030 Capital Improvement Program"
                  className={field}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-plan-start">Start year</Label>
                <input
                  id="import-plan-start"
                  type="number"
                  value={plan.startYear}
                  onChange={(e) => setPlan({ ...plan, startYear: e.target.value })}
                  onBlur={recheck}
                  placeholder="From the file"
                  className={field}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-plan-end">End year</Label>
                <input
                  id="import-plan-end"
                  type="number"
                  value={plan.endYear}
                  onChange={(e) => setPlan({ ...plan, endYear: e.target.value })}
                  onBlur={recheck}
                  placeholder="From the file"
                  className={field}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="import-plan-budget">Annual budget ($, optional)</Label>
                <input
                  id="import-plan-budget"
                  type="number"
                  min={0}
                  step="any"
                  value={plan.annualBudget}
                  onChange={(e) => setPlan({ ...plan, annualBudget: e.target.value })}
                  onBlur={recheck}
                  placeholder="None"
                  className={field}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-4">
                Leave the years blank to take the plan&apos;s period from the spreadsheet&apos;s earliest and latest
                Year. A budget lets the plan show each year as over or under it.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv"
              aria-label="Spreadsheet to import"
              className="block max-w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) check(f);
                else setPreview(null);
              }}
            />
            <div className="ml-auto">
              <ExportButton
                href="/work-plan/import-template"
                label="Download the template"
                title="An empty sheet with the columns, how to fill them in, and every treatment and combination name"
              />
            </div>
          </div>

          {busy && !committing && <p className="text-sm text-muted-foreground">Checking every row…</p>}

          {message && (
            <p className={`flex items-start gap-2 text-sm ${message.ok ? "text-emerald-600" : "text-destructive"}`}>
              {message.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              {message.text}
            </p>
          )}

          {preview && preview.missingColumns.length > 0 && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              No {preview.missingColumns.join(", ")} column found. The first rows of the sheet need a heading row with
              at least Asset ID, Treatment and Year — the template has them.
            </p>
          )}

          {preview && preview.missingColumns.length === 0 && (
            <>
              {preview.plan.isNew && (
                <p className="text-sm">
                  Creates <span className="font-medium">{preview.plan.name}</span>, {preview.plan.startYear}–
                  {preview.plan.endYear}.
                </p>
              )}
              <div className="flex flex-wrap gap-2 text-sm">
                <Stat label="To import" value={formatNumber(preview.toImport)} tone={ready ? "good" : undefined} />
                <Stat label="Cost" value={formatCurrency(preview.totalCost, { compact: true })} />
                <Stat label="Already in the plan" value={formatNumber(preview.toSkip)} />
                <Stat label="Errors" value={formatNumber(preview.errors.length)} tone={blocked ? "bad" : undefined} />
              </div>

              {preview.unknownColumns.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Ignored column{preview.unknownColumns.length === 1 ? "" : "s"}: {preview.unknownColumns.join(", ")}
                </p>
              )}

              {preview.errors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-destructive">
                    Fix {preview.errors.length === 1 ? "this" : "these"} in the file and choose it again — nothing
                    is imported while any row has an error.
                  </p>
                  <div className="max-h-56 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">Row</TableHead>
                          <TableHead className="w-24">Column</TableHead>
                          <TableHead>Problem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.errors.slice(0, 200).map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="tabular-nums">{e.row}</TableCell>
                            <TableCell>{e.column}</TableCell>
                            <TableCell className="text-destructive">{e.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {preview.rows.length === 0 && preview.errors.length === 0 && (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  The sheet has the headings but no rows under them.
                </p>
              )}

              {preview.rows.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Row</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((r) => (
                        <TableRow key={r.row} className={r.skipped ? "text-muted-foreground" : undefined}>
                          <TableCell className="align-top tabular-nums">{r.row}</TableCell>
                          <TableCell className="align-top">
                            <div className="font-medium">
                              {r.assetCode} - {r.members.join(", ")}
                            </div>
                            {r.isCombination && (
                              <Badge variant="outline" className="mt-1">
                                {r.name}
                              </Badge>
                            )}
                            {r.skipped && <div className="mt-1 text-xs">Skipped: {r.skipped}</div>}
                            {r.warnings.map((w) => (
                              <div key={w} className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                                {w}
                              </div>
                            ))}
                          </TableCell>
                          <TableCell className="align-top tabular-nums">
                            {r.year}
                            {(r.programmedYear !== r.year || r.buildYear !== r.year) && (
                              <div className="text-[11px] text-muted-foreground">
                                programmed {r.programmedYear} · built {r.buildYear}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums">
                            {formatCurrency(r.cost)}
                            <div className="text-[11px] text-muted-foreground">
                              {r.costFrom === "file" ? "from file" : "library price"}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-xs">{r.status}</TableCell>
                          <TableCell className="align-top text-xs">{r.notes ?? ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          <div data-dialog-actions className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button type="button" size="sm" onClick={commit} disabled={busy || !ready}>
              {committing
                ? isNew
                  ? "Creating the plan…"
                  : "Importing…"
                : ready
                  ? isNew
                    ? `Create plan with ${formatNumber(preview!.toImport)} project${preview!.toImport === 1 ? "" : "s"}`
                    : `Import ${formatNumber(preview!.toImport)} project${preview!.toImport === 1 ? "" : "s"}`
                  : isNew
                    ? "Create plan"
                    : "Import"}
            </Button>
          </div>
        </div>
      </EditorDialog>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border px-3 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-semibold tabular-nums ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
