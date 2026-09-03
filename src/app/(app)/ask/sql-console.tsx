"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, Database, Play, X } from "lucide-react";
import type { ConsoleTable } from "@/server/sql-console";
import type { SqlRunResult } from "./sql-actions";

export type EquivalentQuery = { sql: string; unsupported: string[]; forQuestion: string } | null;

/**
 * A real SQL console: a schema tree to build a query from, an editor, and a
 * grid for whatever comes back.
 *
 * Two starting points, not two separate tools — "AI's query" loads the SQL
 * the last answer is equivalent to (see domain/waterline/sql-translate.ts;
 * nothing runs SQL to produce an answer, so this is a translation, shown as
 * one rather than passed off as a transcript), "Write your own" clears the
 * editor. Either way you land in the same box and the same Run button, so a
 * translated query is a starting point to explore from, not a dead end.
 */
export function SqlConsole({
  schema,
  equivalent,
  runSql,
  onClose,
}: {
  schema: ConsoleTable[];
  /** The AI's most recent result, translated — null until one exists. */
  equivalent: EquivalentQuery;
  runSql: (sql: string) => Promise<SqlRunResult>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"ai" | "write">(equivalent ? "ai" : "write");
  const [sql, setSql] = useState(equivalent?.sql ?? "");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlRunResult | null>(null);
  const [openTables, setOpenTables] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A new question can arrive while the console is already open; the "AI's
  // query" tab should track it rather than keep showing the previous
  // answer's SQL. Compared against state, not a ref: React discards this
  // render and immediately re-renders, so nothing stale is ever painted.
  const [loadedForQuestion, setLoadedForQuestion] = useState(equivalent?.forQuestion);
  if (equivalent && equivalent.forQuestion !== loadedForQuestion) {
    setLoadedForQuestion(equivalent.forQuestion);
    if (mode === "ai") setSql(equivalent.sql);
  }

  const insert = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      setSql((prev) => (prev ? `${prev} ${text}` : text));
      return;
    }
    const start = el.selectionStart ?? sql.length;
    const end = el.selectionEnd ?? sql.length;
    const next = sql.slice(0, start) + text + sql.slice(end);
    setSql(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const toggleTable = (name: string) =>
    setOpenTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const run = async () => {
    setRunning(true);
    setResult(null);
    setResult(await runSql(sql));
    setRunning(false);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" />
          SQL Console
        </CardTitle>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Close SQL console">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => {
                setMode("ai");
                setSql(equivalent?.sql ?? "");
              }}
              disabled={!equivalent}
              aria-pressed={mode === "ai"}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                mode === "ai" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              title={equivalent ? "The SQL the last answer is equivalent to" : "Ask a question first"}
            >
              AI&apos;s query
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("write");
                setSql("");
              }}
              aria-pressed={mode === "write"}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                mode === "write" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Write your own
            </button>
          </div>

          {mode === "ai" && equivalent && (
            <span className="text-xs text-muted-foreground">
              Equivalent to — not a transcript of — the last question:{" "}
              <span className="italic">&ldquo;{equivalent.forQuestion}&rdquo;</span>
            </span>
          )}
        </div>

        {mode === "ai" && equivalent && equivalent.unsupported.length > 0 && (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Not translated — {equivalent.unsupported.join(", ")}. The AI&apos;s answer used them; this SQL does not,
            so row counts may not match exactly.
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
          <div className="max-h-96 overflow-y-auto rounded-md border">
            {schema.map((table) => (
              <div key={table.name} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleTable(table.name)}
                  className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs font-medium hover:bg-muted/60"
                >
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 transition-transform ${openTables.has(table.name) ? "rotate-90" : ""}`}
                  />
                  <span
                    className="min-w-0 flex-1 truncate font-mono"
                    onClick={(e) => {
                      e.stopPropagation();
                      insert(table.name);
                    }}
                    title={`Insert ${table.name}`}
                  >
                    {table.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{table.columns.length}</span>
                </button>
                {openTables.has(table.name) && (
                  <ul className="pb-1">
                    {table.columns.map((col) => (
                      <li key={col.name}>
                        <button
                          type="button"
                          onClick={() => insert(`${table.name}.${col.name}`)}
                          title={`Insert ${table.name}.${col.name}`}
                          className="flex w-full items-center justify-between gap-2 py-0.5 pr-2 pl-7 text-left font-mono text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        >
                          <span className="truncate">{col.name}</span>
                          <span className="shrink-0 text-[10px] opacity-60">{col.dataType}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              spellCheck={false}
              placeholder={
                mode === "ai"
                  ? "Ask a question above, then switch to this tab to see and run its equivalent query."
                  : 'SELECT "assetCode", status FROM assets LIMIT 20'
              }
              className="h-40 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Read-only: one SELECT statement, up to 500 rows, 8 seconds. Reaches every table below — nothing else.
              </p>
              <Button type="button" size="sm" onClick={run} disabled={running || !sql.trim()}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {running ? "Running…" : "Run query"}
              </Button>
            </div>
          </div>
        </div>

        {result && (
          <div className="rounded-md border">
            {!result.ok ? (
              <p className="px-4 py-3 text-sm text-destructive">{result.message}</p>
            ) : result.rowCount === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Ran fine — nothing matched.</p>
            ) : (
              <>
                <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
                  <span>
                    {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? "" : "s"}
                    {result.truncated ? " (cut off at 500)" : ""}
                  </span>
                  <span>{result.elapsedMs}ms</span>
                </div>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {result.columns.map((c) => (
                          <TableHead key={c} className="whitespace-nowrap font-mono text-xs">
                            {c}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.map((row, i) => (
                        <TableRow key={i}>
                          {result.columns.map((c) => (
                            <TableCell key={c} className="whitespace-nowrap font-mono text-xs">
                              {row[c] === null ? <span className="text-muted-foreground">—</span> : String(row[c])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
