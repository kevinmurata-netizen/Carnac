"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FilterTable, Criterion } from "@/server/filter-schema";
import type { SavedFilterRow, FilterResult } from "@/server/saved-filters";
import { runFilterAction, saveFilterAction, deleteFilterAction } from "./actions";
import { SchemaTree } from "./schema-tree";
import { SelectedFields } from "./selected-fields";
import { CriteriaBuilder } from "./criteria-builder";
import { formatNumber } from "@/lib/format";
import { FileSpreadsheet, Play, Save, Trash2 } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function FilterBuilder({
  schema,
  saved,
}: {
  schema: FilterTable[];
  saved: SavedFilterRow[];
}) {
  const fieldsByKey = useMemo(() => {
    const m = new Map<string, FilterTable["fields"][number]>();
    for (const t of schema) for (const f of t.fields) m.set(f.key, f);
    return m;
  }, [schema]);

  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [matchAll, setMatchAll] = useState(true);

  const [result, setResult] = useState<FilterResult | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleField = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const addField = (key: string) =>
    setSelected((prev) => (prev.includes(key) || !fieldsByKey.has(key) ? prev : [...prev, key]));

  const reorder = (from: number, to: number) =>
    setSelected((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  const load = (f: SavedFilterRow) => {
    setLoadedId(f.id);
    setName(f.name);
    setDescription(f.description ?? "");
    // Drop anything that no longer exists in the schema rather than failing.
    setSelected(f.fields.filter((k) => fieldsByKey.has(k)));
    setCriteria(f.criteria.filter((c) => fieldsByKey.has(c.field)));
    setMatchAll(f.matchAll);
    setResult(null);
    setMessage(null);
  };

  const reset = () => {
    setLoadedId(null);
    setName("");
    setDescription("");
    setSelected([]);
    setCriteria([]);
    setMatchAll(true);
    setResult(null);
    setMessage(null);
  };

  const run = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        setResult(await runFilterAction(selected, criteria, matchAll));
      } catch (e) {
        setMessage({ kind: "err", text: e instanceof Error ? e.message : "Could not run this filter" });
      }
    });

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const text = await saveFilterAction(
          { name, description: description || null, fields: selected, criteria, matchAll },
          loadedId ?? undefined
        );
        setMessage({ kind: "ok", text });
      } catch (e) {
        setMessage({ kind: "err", text: e instanceof Error ? e.message : "Could not save" });
      }
    });

  const remove = (id: string, label: string) =>
    startTransition(async () => {
      try {
        await deleteFilterAction(id);
        if (loadedId === id) reset();
        setMessage({ kind: "ok", text: `Deleted "${label}".` });
      } catch (e) {
        setMessage({ kind: "err", text: e instanceof Error ? e.message : "Could not delete" });
      }
    });

  /**
   * Both downloads post the definition and let the server re-run it.
   *
   * The preview above is capped at 500 rows; building the file here from those
   * rows exported the cap rather than the result, while the page promised
   * "export for the rest". Re-running server-side exports every match.
   */
  const download = (format: "xlsx" | "csv") => {
    if (!result) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/filters/export";

    const add = (key: string, value: string) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    };

    add("format", format);
    add("definition", JSON.stringify({ name: name || "Filter", fields: selected, criteria, matchAll }));

    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  return (
    <>
      {saved.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>
              Saved Filters <span className="text-sm font-normal text-muted-foreground">({saved.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {saved.map((f) => (
                <div
                  key={f.id}
                  className={`flex items-center gap-1 rounded-full border px-1 py-0.5 text-xs ${
                    loadedId === f.id ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => load(f)}
                    className="px-2 py-1 font-medium text-foreground hover:text-primary"
                    title={
                      f.description ??
                      `${f.fields.length} fields, ${f.criteria.length} criteria${f.createdByName ? ` · ${f.createdByName}` : ""}`
                    }
                  >
                    {f.name}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(f.id, f.name)}
                    aria-label={`Delete ${f.name}`}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Schema</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Tick a field to add it, or drag it into the column list.
            </p>
          </CardHeader>
          <CardContent>
            <SchemaTree schema={schema} selected={selected} onToggle={toggleField} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                Columns <span className="text-sm font-normal text-muted-foreground">({selected.length})</span>
              </CardTitle>
              {selected.length > 1 && (
                <span className="text-xs text-muted-foreground">Drag, or use the arrows, to reorder</span>
              )}
            </CardHeader>
            <CardContent>
              <SelectedFields
                selected={selected}
                fieldsByKey={fieldsByKey}
                onReorder={reorder}
                onRemove={toggleField}
                onDropField={addField}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Criteria</CardTitle>
            </CardHeader>
            <CardContent>
              <CriteriaBuilder
                schema={schema}
                fieldsByKey={fieldsByKey}
                criteria={criteria}
                matchAll={matchAll}
                onChange={setCriteria}
                onMatchAllChange={setMatchAll}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{loadedId ? "Update Filter" : "Save Filter"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="filter-name">Name</Label>
                  <input
                    id="filter-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cast iron in poor condition"
                    className={input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-description">Description (optional)</Label>
                  <input
                    id="filter-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={input}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <span className="text-xs">
                  {message && (
                    <span className={message.kind === "ok" ? "text-emerald-600" : "text-destructive"}>
                      {message.text}
                    </span>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {loadedId && (
                    <Button type="button" size="sm" variant="ghost" onClick={reset}>
                      New filter
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={save} disabled={pending}>
                    <Save className="mr-1 h-3.5 w-3.5" />
                    {loadedId ? "Update" : "Save"}
                  </Button>
                  <Button type="button" size="sm" onClick={run} disabled={pending || selected.length === 0}>
                    <Play className="mr-1 h-3.5 w-3.5" />
                    {pending ? "Running…" : "Run"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {result && (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>
                Results{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({formatNumber(result.matched)} of {formatNumber(result.total)} segments)
                </span>
              </CardTitle>
              {result.rows.length < result.matched && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Showing the first {formatNumber(result.rows.length)} — an export contains all{" "}
                  {formatNumber(result.matched)}.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => download("csv")}>
                Export CSV
              </Button>
              <Button type="button" size="sm" onClick={() => download("xlsx")}>
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                Export to Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {result.matched === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Nothing matched. Loosen a criterion, or switch matching from “all” to “any”.
              </p>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {result.columns.map((c) => (
                        <TableHead key={c.key} className="whitespace-nowrap">
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((r, i) => (
                      <TableRow key={i}>
                        {result.columns.map((c) => (
                          <TableCell key={c.key} className="whitespace-nowrap text-sm">
                            {r[c.key] === null || r[c.key] === "" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              String(r[c.key])
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!result && selected.length > 0 && (
        <div className="mt-4 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          <Badge variant="secondary" className="mb-2">
            {selected.length} columns · {criteria.length} criteria
          </Badge>
          <div>Press Run to see matching segments.</div>
        </div>
      )}
    </>
  );
}
