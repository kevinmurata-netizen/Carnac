"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, CornerDownLeft } from "lucide-react";
import { OPERATORS } from "@/server/filter-schema";
import type { AssistantResult } from "@/server/assistant";

const OPERATOR_LABELS = new Map<string, string>(OPERATORS.map((o) => [o.key, o.label]));

const EXAMPLES = [
  'All 12" waterlines in Highland Park',
  "Cast iron mains in poor condition serving more than 200 customers",
  "Segments older than 70 years that have failed at least twice",
  "Which segments have never been inspected?",
];

/**
 * Ask a question, get segments back.
 *
 * The criteria the assistant built are shown above the results on purpose. A
 * language model will sometimes read a question the way you did not mean it,
 * and the difference between a useful tool and a misleading one is whether you
 * can see that at a glance and correct it.
 */
export function AskPanel({
  ask,
  configured,
}: {
  ask: (question: string) => Promise<AssistantResult>;
  configured: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AssistantResult | null>(null);

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    setPending(true);
    setAsked(q);
    setResult(null);
    setResult(await ask(q));
    setPending(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 py-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(question);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <div className="relative min-w-0 flex-1">
              <Sparkles className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about the network…"
                aria-label="Your question"
                disabled={!configured}
                className="h-11 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
            </div>
            <Button type="submit" disabled={pending || !configured || !question.trim()}>
              {pending ? "Looking…" : "Ask"}
              {!pending && <CornerDownLeft className="ml-1.5 h-3.5 w-3.5" />}
            </Button>
          </form>

          {configured && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setQuestion(example);
                    void submit(example);
                  }}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pending && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Working out what to look for…
          </CardContent>
        </Card>
      )}

      {result?.kind === "unavailable" && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">{result.text}</CardContent>
        </Card>
      )}

      {result?.kind === "message" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{asked}</CardTitle>
          </CardHeader>
          <CardContent className="border-t pt-4 text-sm whitespace-pre-wrap">{result.text}</CardContent>
        </Card>
      )}

      {result?.kind === "segments" && (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">
              {result.total === 0
                ? "No segments match"
                : `${result.total.toLocaleString()} segment${result.total === 1 ? "" : "s"}`}
            </CardTitle>
            {result.note && <p className="text-sm text-muted-foreground">{result.note}</p>}

            {/* Showing the criteria is the point: a misread question is
                obvious here rather than buried in a plausible-looking list. */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">
                {result.criteria.length === 0
                  ? "No filter — every segment"
                  : `Matching ${result.matchAll ? "all" : "any"} of:`}
              </span>
              {result.criteria.map((c, i) => (
                <Badge key={`${c.field}-${i}`} variant="secondary" className="font-normal">
                  {c.field} {OPERATOR_LABELS.get(c.operator) ?? c.operator} {c.value}
                  {c.value2 ? ` and ${c.value2}` : ""}
                </Badge>
              ))}
            </div>
          </CardHeader>

          {result.rows.length > 0 && (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                    {result.rows.map((row, i) => (
                      <TableRow key={row.assetId ?? i}>
                        {result.columns.map((c, ci) => (
                          <TableCell key={c.key} className="whitespace-nowrap">
                            {ci === 0 && row.assetId ? (
                              <Link
                                href={`/assets/${row.assetId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.values[c.key]}
                              </Link>
                            ) : (
                              row.values[c.key]
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {result.truncated && (
                <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                  Showing the first {result.rows.length.toLocaleString()} of {result.total.toLocaleString()}. Build
                  this on the <Link href="/filters" className="text-primary hover:underline">Filters page</Link> to
                  see them all or export to CSV.
                </p>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
