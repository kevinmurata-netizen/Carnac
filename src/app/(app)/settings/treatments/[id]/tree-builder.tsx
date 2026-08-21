"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  defaultTree,
  splitLeaf,
  collapseBranch,
  updateNode,
  describeTest,
  countLeaves,
  evaluateTree,
  FIELD_LABELS,
  NUMERIC_FIELDS,
  TEXT_FIELDS,
  type DecisionNode,
  type DecisionBranch,
  type DecisionField,
  type DecisionOperator,
  type DecisionInput,
} from "@/domain/waterline/decision-tree";
import { saveDecisionTreeAction } from "../actions";
import { EMPTY_TREATMENT_STATE, type TreatmentActionState } from "../state";
import { AlertTriangle, CheckCircle2, GitBranch, Scissors, XCircle } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const NUMERIC_OPS: DecisionOperator[] = ["<", "<=", ">", ">=", "==", "!="];
const TEXT_OPS: DecisionOperator[] = ["in", "not in", "==", "!="];

export function TreeBuilder({
  treatmentId,
  treatmentName,
  initialTree,
  sample,
}: {
  treatmentId: string;
  treatmentName: string;
  initialTree: DecisionNode | null;
  /** A real asset from the network, so the preview is grounded in live data. */
  sample: { label: string; input: DecisionInput } | null;
}) {
  const [tree, setTree] = useState<DecisionNode | null>(initialTree);
  const [state, save, saving] = useActionState<TreatmentActionState, FormData>(
    saveDecisionTreeAction,
    EMPTY_TREATMENT_STATE
  );

  const preview = sample ? evaluateTree(tree, sample.input) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Decision Tree
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            When should {treatmentName} even be considered? The condition/material window says what is technically
            possible; this says what is policy. Leave it off and only the window applies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tree ? (
            <>
              <Badge variant="secondary">{countLeaves(tree)} outcomes</Badge>
              <Button size="sm" variant="outline" onClick={() => setTree(null)}>
                Remove tree
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setTree(defaultTree())}>
              Add a tree
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {state.status !== "idle" && state.message && (
          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              state.status === "error"
                ? "border-destructive/40 bg-destructive/5"
                : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
            }`}
          >
            {state.status === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <span>{state.message}</span>
          </div>
        )}

        {tree ? (
          <>
            <div className="rounded-md border p-3">
              <NodeView node={tree} tree={tree} onChange={setTree} depth={0} />
            </div>

            {sample && preview && (
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="mb-1 text-xs font-medium text-foreground">
                  Preview against {sample.label}
                </div>
                {preview.path.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tests — every asset reaches the root outcome.</p>
                ) : (
                  <ol className="space-y-0.5 text-xs text-muted-foreground">
                    {preview.path.map((step, i) => (
                      <li key={i}>
                        {i + 1}. {step}
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-2 text-xs">
                  Outcome:{" "}
                  <span className={preview.consider ? "font-medium text-emerald-600" : "font-medium text-destructive"}>
                    {preview.consider ? "Consider" : "Do not consider"}
                  </span>
                  {preview.note ? ` — ${preview.note}` : ""}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No decision tree. {treatmentName} is considered whenever it fits the technical window.
          </p>
        )}

        <form action={save} className="flex items-center justify-between gap-3">
          <input type="hidden" name="treatmentId" value={treatmentId} />
          <input type="hidden" name="tree" value={tree ? JSON.stringify(tree) : "null"} />
          <p className="text-xs text-muted-foreground">
            Changes are not applied until saved. Rules take effect on the next recommendation, plan or scenario run.
          </p>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Decision Tree"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NodeView({
  node,
  tree,
  onChange,
  depth,
}: {
  node: DecisionNode;
  tree: DecisionNode;
  onChange: (next: DecisionNode) => void;
  depth: number;
}) {
  if (node.kind === "leaf") {
    return (
      <LeafView node={node} tree={tree} onChange={onChange} depth={depth} />
    );
  }
  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 16 }} className="space-y-2">
      <BranchHeader node={node} tree={tree} onChange={onChange} />
      <div className="border-l-2 border-emerald-600/40 pl-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Yes
        </div>
        <NodeView node={node.whenTrue} tree={tree} onChange={onChange} depth={depth + 1} />
      </div>
      <div className="border-l-2 border-muted-foreground/30 pl-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">No</div>
        <NodeView node={node.whenFalse} tree={tree} onChange={onChange} depth={depth + 1} />
      </div>
    </div>
  );
}

function BranchHeader({
  node,
  tree,
  onChange,
}: {
  node: DecisionBranch;
  tree: DecisionNode;
  onChange: (next: DecisionNode) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isText = TEXT_FIELDS.includes(node.field);

  return (
    <div className="rounded-md border bg-card p-2">
      {editing ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <select
            className={input}
            value={node.field}
            onChange={(e) => {
              const field = e.target.value as DecisionField;
              const nowText = TEXT_FIELDS.includes(field);
              onChange(
                updateNode(tree, node.id, {
                  field,
                  operator: nowText ? "in" : "<",
                  value: nowText ? "" : 0,
                })
              );
            }}
          >
            <optgroup label="Numeric">
              {NUMERIC_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Text">
              {TEXT_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </optgroup>
          </select>

          <select
            className={input}
            value={node.operator}
            onChange={(e) => onChange(updateNode(tree, node.id, { operator: e.target.value as DecisionOperator }))}
          >
            {(isText ? TEXT_OPS : NUMERIC_OPS).map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>

          <input
            className={input}
            value={Array.isArray(node.value) ? node.value.join(", ") : String(node.value)}
            placeholder={isText ? "Cast Iron, Steel" : "25"}
            onChange={(e) =>
              onChange(
                updateNode(tree, node.id, {
                  value: isText ? e.target.value : Number(e.target.value),
                })
              )
            }
          />

          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            <GitBranch className="mr-1 inline h-3.5 w-3.5 text-primary" />
            {describeTest(node)} ?
          </span>
          <span className="flex gap-1">
            <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
              Edit test
            </Button>
            <Button size="xs" variant="destructive" onClick={() => onChange(collapseBranch(tree, node.id))}>
              <Scissors className="mr-1 h-3 w-3" />
              Collapse
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}

function LeafView({
  node,
  tree,
  onChange,
}: {
  node: Extract<DecisionNode, { kind: "leaf" }>;
  tree: DecisionNode;
  onChange: (next: DecisionNode) => void;
  depth: number;
}) {
  const [splitting, setSplitting] = useState(false);
  const [field, setField] = useState<DecisionField>("condition");
  const [operator, setOperator] = useState<DecisionOperator>("<");
  const [value, setValue] = useState("25");

  const isText = TEXT_FIELDS.includes(field);

  return (
    <div className="rounded-md border bg-card p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          {node.consider ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className={node.consider ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-destructive"}>
            {node.consider ? "Consider" : "Do not consider"}
          </span>
          <input
            className="h-7 w-56 rounded-md border border-input bg-background px-2 text-xs"
            placeholder="why (optional)"
            defaultValue={node.note ?? ""}
            onBlur={(e) => onChange(updateNode(tree, node.id, { note: e.target.value || undefined }))}
          />
        </span>
        <span className="flex gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => onChange(updateNode(tree, node.id, { consider: !node.consider }))}
          >
            Flip
          </Button>
          <Button size="xs" variant="outline" onClick={() => setSplitting((v) => !v)}>
            {splitting ? "Cancel" : "Split on a test"}
          </Button>
        </span>
      </div>

      {splitting && (
        <div className="mt-2 grid grid-cols-1 gap-2 rounded-md border bg-muted/40 p-2 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Field</Label>
            <select
              className={input}
              value={field}
              onChange={(e) => {
                const f = e.target.value as DecisionField;
                setField(f);
                setOperator(TEXT_FIELDS.includes(f) ? "in" : "<");
                setValue(TEXT_FIELDS.includes(f) ? "" : "25");
              }}
            >
              <optgroup label="Numeric">
                {NUMERIC_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABELS[f]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Text">
                {TEXT_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABELS[f]}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <Label className="text-xs">Operator</Label>
            <select className={input} value={operator} onChange={(e) => setOperator(e.target.value as DecisionOperator)}>
              {(isText ? TEXT_OPS : NUMERIC_OPS).map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Value</Label>
            <input
              className={input}
              value={value}
              placeholder={isText ? "Cast Iron, Steel" : "25"}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={() => {
                onChange(
                  splitLeaf(tree, node.id, {
                    field,
                    operator,
                    value: isText ? value : Number(value),
                  })
                );
                setSplitting(false);
              }}
            >
              Split
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
