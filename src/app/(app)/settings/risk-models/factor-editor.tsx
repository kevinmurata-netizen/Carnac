"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { RiskFactorDef } from "@/domain/waterline/risk";
import type { MeasureInfo } from "@/server/measures";
import type { SettingsActionState } from "../state";
import { removeRiskFactorAction, saveRiskFactorAction } from "../actions";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type State = SettingsActionState;
const EMPTY: State = { status: "idle", message: null };
type Group = "pof" | "cof";

/** The inputs a factor can rate that are not measures. */
const SIGNALS = [
  { source: "condition", label: "Condition", note: "Rated on how far below 100 the score is, so a worse condition rates higher." },
  { source: "ageRatio", label: "Age vs expected life", note: "Age as a share of expected useful life: 0.5 is halfway." },
  { source: "failures", label: "Failures in the last 10 years", note: "A count of recorded failures." },
] as const;

type Draft = {
  group: Group;
  originalKey: string;
  name: string;
  label: string;
  source: string;
  breakpoints: [string, string, string, string];
  ratings: string;
  prefix: string;
  suffix: string;
  unknownRating: string;
  defaultWeight: string;
};

function Feedback({ state }: { state: State }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        error ? "border-destructive/40 bg-destructive/5" : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
      }`}
    >
      {error ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <span>{state.message}</span>
    </div>
  );
}

/**
 * The factors a risk model rates, and how each maps its input to 1–5.
 *
 * Kept apart from the weights form: a factor is added or changed one at a
 * time, and the weights form below picks the new one up once it is saved.
 */
export function FactorEditor({
  assetTypeId,
  pofFactors,
  cofFactors,
  measures,
  canEdit,
}: {
  assetTypeId: string;
  pofFactors: RiskFactorDef[];
  cofFactors: RiskFactorDef[];
  measures: MeasureInfo[];
  canEdit: boolean;
}) {
  const [state, setState] = useState<State>(EMPTY);
  const [pending, startTransition] = useTransition();
  const [draft, setDraftRaw] = useState<Draft | null>(null);
  const setDraft = (d: Draft | null) => {
    if (d) setState(EMPTY);
    setDraftRaw(d);
  };

  const submit = (action: (prev: State, form: FormData) => Promise<State>, formData: FormData, close: () => void) =>
    startTransition(async () => {
      const result = await action(EMPTY, formData);
      setState(result);
      if (result.status === "success") close();
    });

  const sourceLabel = (source: string) => {
    const signal = SIGNALS.find((s) => s.source === source);
    if (signal) return signal.label;
    const m = measures.find((x) => x.role === source);
    if (!m) return source;
    if (!m.attributeLabel) return `${m.label} — not set for this type`;
    return m.attributeLabel.toLowerCase() === m.label.toLowerCase() ? m.label : `${m.label} · ${m.attributeLabel}`;
  };

  const newDraft = (group: Group): Draft => ({
    group,
    originalKey: "",
    name: "",
    label: "",
    source: "",
    breakpoints: ["", "", "", ""],
    ratings: "",
    prefix: "",
    suffix: "",
    unknownRating: "3",
    defaultWeight: "0.1",
  });
  const editDraft = (group: Group, f: RiskFactorDef): Draft => ({
    group,
    originalKey: f.key,
    name: f.name,
    label: f.label ?? "",
    source: f.source,
    breakpoints: (f.breakpoints?.map(String) ?? ["", "", "", ""]) as Draft["breakpoints"],
    ratings: Object.entries(f.ratings ?? {})
      .map(([value, rating]) => `${value} = ${rating}`)
      .join("\n"),
    prefix: f.prefix ?? "",
    suffix: f.suffix ?? "",
    unknownRating: String(f.unknownRating ?? 3),
    defaultWeight: String(f.defaultWeight),
  });

  return (
    <div className="mt-4 space-y-4">
      <Feedback state={state} />
      <div className="space-y-4">
        {(
          [
            ["pof", "Probability factors", pofFactors],
            ["cof", "Consequence factors", cofFactors],
          ] as const
        ).map(([group, title, factors]) => (
          <Card key={group}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                {title} <span className="text-muted-foreground">({factors.length})</span>
              </CardTitle>
              {canEdit && (
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft(newDraft(group))}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add factor
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableCell className="font-medium">Factor</TableCell>
                      <TableCell className="font-medium">Rates</TableCell>
                      <TableCell className="font-medium">1–5 by</TableCell>
                      {canEdit && <TableCell className="w-28" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {factors.map((f) => (
                      <TableRow key={f.key}>
                        <TableCell className="whitespace-nowrap font-medium">{f.label ?? f.name}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{sourceLabel(f.source)}</TableCell>
                        <TableCell className="min-w-64 whitespace-normal text-xs text-muted-foreground">
                          {describeRating(f)}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                aria-label={`Edit ${f.name}`}
                                onClick={() => setDraft(editDraft(group, f))}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <ConfirmDelete
                                size="xs"
                                disabled={pending || factors.length === 1}
                                title={`Remove ${f.name}?`}
                                description="It stops counting toward this model's score from the next risk recompute, and its weight goes with it. Past assessments keep the factor they were scored with."
                                confirmLabel="Remove"
                                triggerTitle={factors.length === 1 ? "A score needs at least one factor" : undefined}
                                onConfirm={() => {
                                  const fd = new FormData();
                                  fd.set("assetTypeId", assetTypeId);
                                  fd.set("group", group);
                                  fd.set("key", f.key);
                                  submit(removeRiskFactorAction, fd, () => {});
                                }}
                              >
                                Remove
                              </ConfirmDelete>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {canEdit && (
        <EditorDialog
          open={draft != null}
          onClose={() => setDraft(null)}
          title={draft?.originalKey ? `Edit ${draft.name}` : `New ${draft?.group === "cof" ? "consequence" : "probability"} factor`}
          description="What the factor reads from each asset, and how that becomes a rating from 1 to 5. It applies from the next risk recompute; past assessments keep what they were scored with."
        >
          {state.status === "error" && <Feedback state={state} />}
          {draft && (
            <FactorForm
              key={`${draft.group}:${draft.originalKey}`}
              draft={draft}
              assetTypeId={assetTypeId}
              measures={measures}
              pending={pending}
              onSubmit={(formData) => submit(saveRiskFactorAction, formData, () => setDraft(null))}
              onCancel={() => setDraft(null)}
            />
          )}
        </EditorDialog>
      )}
    </div>
  );
}

/** "1 below 6 · 2 from 6 · …" or "Cast Iron 4 · PVC 1 · others 3". */
function describeRating(f: RiskFactorDef): string {
  const unknown = f.unknownRating ?? 3;
  if (f.breakpoints) {
    const [a, b, c, d] = f.breakpoints;
    const scale = f.source === "condition" ? " (100 − condition)" : "";
    return `1 below ${a} · 2 from ${a} · 3 from ${b} · 4 from ${c} · 5 from ${d}${scale} · unknown ${unknown}`;
  }
  const entries = Object.entries(f.ratings ?? {});
  return `${entries.map(([v, r]) => `${v} ${r}`).join(" · ")} · others ${unknown}`;
}

function FactorForm({
  draft,
  assetTypeId,
  measures,
  pending,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  assetTypeId: string;
  measures: MeasureInfo[];
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState(draft.source);
  const [name, setName] = useState(draft.name);
  const measure = measures.find((m) => m.role === source);
  const signal = SIGNALS.find((s) => s.source === source);
  const numeric = !!signal || measure?.kind === "number";
  const isText = measure?.kind === "text";
  const missing = [!name.trim() ? "A name" : null, !source ? "what it rates" : null].filter((v): v is string => v != null);

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="assetTypeId" value={assetTypeId} />
      <input type="hidden" name="group" value={draft.group} />
      <input type="hidden" name="originalKey" value={draft.originalKey} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="factor-name">Name</Label>
          <input
            id="factor-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shell Material"
            className={input}
          />
          <p className="text-xs text-muted-foreground">Recorded on each assessment beside what was observed.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="factor-label">Label in the weights form</Label>
          <input
            id="factor-label"
            name="label"
            defaultValue={draft.label}
            placeholder="Optional — the name is used otherwise"
            className={input}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="factor-source">Rates</Label>
        <select
          id="factor-source"
          name="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={input}
        >
          <option value="" disabled>
            Choose what this factor reads
          </option>
          <optgroup label="From the asset's history">
            {SIGNALS.map((s) => (
              <option key={s.source} value={s.source}>
                {s.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Measures (Settings › Asset Types)">
            {measures.map((m) => (
              <option key={m.role} value={m.role}>
                {m.label}
                {m.attributeLabel ? ` — ${m.attributeLabel}${m.unit ? ` (${m.unit})` : ""}` : " — not set for this type"}
              </option>
            ))}
          </optgroup>
        </select>
        {signal && <p className="text-xs text-muted-foreground">{signal.note}</p>}
        {measure && !measure.attributeLabel && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This type has no attribute for {measure.label.toLowerCase()} yet, so every asset would rate as unknown. Set
            it under Settings › Asset Types.
          </p>
        )}
      </div>

      {numeric && (
        <div className="space-y-1.5">
          <Label>Rating reaches 2, 3, 4 and 5 at</Label>
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                name={`bp${i + 1}`}
                type="number"
                step="any"
                defaultValue={draft.breakpoints[i]}
                aria-label={`Rating ${i + 2} from`}
                placeholder={`→ ${i + 2}`}
                className={input}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Below the first value rates 1. Each value must be higher than the one before.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <input name="prefix" defaultValue={draft.prefix} placeholder="Shown before the value (optional)" className={input} />
            <input name="suffix" defaultValue={draft.suffix} placeholder={'Shown after it, e.g. " MG"'} className={input} />
          </div>
        </div>
      )}

      {isText && (
        <div className="space-y-1.5">
          <Label htmlFor="factor-ratings">Ratings</Label>
          <textarea
            id="factor-ratings"
            name="ratings"
            defaultValue={draft.ratings || (measure?.values ?? []).map((v) => `${v} = 3`).join("\n")}
            rows={Math.min(10, Math.max(4, (measure?.values.length ?? 0) + 1))}
            placeholder={"Steel = 4\nConcrete = 2"}
            className={`${input} h-auto py-2 font-mono`}
          />
          <p className="text-xs text-muted-foreground">
            One value per line, as value = rating from 1 to 5.
            {measure && measure.values.length > 0 && <> Recorded on this type: {measure.values.join(", ")}.</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="factor-unknown">Rating when unknown</Label>
          <select id="factor-unknown" name="unknownRating" defaultValue={draft.unknownRating} className={input}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
                {n === 3 ? " — the middle, assuming nothing" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {isText ? "Also used for a value the table doesn't list." : "When the asset has no value to rate."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="factor-weight">Built-in weight</Label>
          <input
            id="factor-weight"
            name="defaultWeight"
            type="number"
            min={0}
            step="any"
            defaultValue={draft.defaultWeight}
            className={input}
          />
          <p className="text-xs text-muted-foreground">
            Its starting weight in the form below, and what benefit and the fallback criticality use.
          </p>
        </div>
      </div>

      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {missing.length === 1 ? `${missing[0]} is required.` : `${missing.join(" and ")} are required.`}
        </p>
      )}
      <div data-dialog-actions className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || missing.length > 0}>
          {pending ? "Saving…" : draft.originalKey ? "Save factor" : "Add factor"}
        </Button>
      </div>
    </form>
  );
}
