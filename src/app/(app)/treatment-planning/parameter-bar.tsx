"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CircleDot, RotateCcw } from "lucide-react";

/**
 * The four inputs to the Priority Score, chosen here rather than fixed by
 * Settings.
 *
 *   Criticality × Scale Factor × Category Weight × Expected Benefit ÷ Total Cost
 *
 * Expected Benefit is shaped by the benefit weighting, so choosing it,
 * criticality, scale factor and category weight covers every term someone can
 * vary. Total cost is the one term that is not a choice.
 *
 * The choice lives in the URL, for the same reasons as the build log's
 * filter: a particular ranking is something you send someone, and it has to
 * survive a refresh. Nothing is saved — changing these asks "what if", and
 * leaves the organization's defaults exactly as they were.
 *
 * Nothing recalculates until Recalculate is pressed, because a recalculation
 * re-scores a thousand options twice over and a dropdown is not a commitment.
 * Which means the numbers below can briefly disagree with the dropdowns above
 * them, and the bar says so rather than letting someone read a ranking the
 * selections did not produce.
 */

export type ParameterChoice = { id: string; label: string; isDefault: boolean };

export type AppliedParameters = {
  weightSetId: string;
  categoryWeightSetId: string;
  criticalityModelId: string;
  scaleFactorModelId: string;
};

const FIELDS: Array<{
  key: keyof AppliedParameters;
  label: string;
  /** What choosing nothing means, spelled out — "default" alone does not say
   * which one. */
  none: string;
}> = [
  { key: "criticalityModelId", label: "Criticality", none: "Each asset's stored score" },
  { key: "scaleFactorModelId", label: "Scale factor", none: "The active formula" },
  { key: "categoryWeightSetId", label: "Category weight", none: "The default weighting" },
  { key: "weightSetId", label: "Scenario weight", none: "The default weighting" },
];

const control =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ParameterBar({
  applied,
  choices,
}: {
  applied: AppliedParameters;
  choices: Record<keyof AppliedParameters, ParameterChoice[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<AppliedParameters>(applied);

  const changed = FIELDS.filter((f) => selected[f.key] !== applied[f.key]).length;
  const anyChosen = FIELDS.some((f) => applied[f.key] !== "");

  const navigate = (next: AppliedParameters) => {
    const params = new URLSearchParams();
    for (const f of FIELDS) if (next[f.key]) params.set(f.key, next[f.key]);
    const query = params.toString();
    // A transition, so the button can say it is working: this re-scores every
    // option on every segment and takes long enough to wonder whether the
    // click registered.
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  };

  return (
    <div className="mb-4 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((field) => {
          const differs = selected[field.key] !== applied[field.key];
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`param-${field.key}`}>{field.label}</Label>
              <select
                id={`param-${field.key}`}
                value={selected[field.key]}
                onChange={(e) => setSelected((s) => ({ ...s, [field.key]: e.target.value }))}
                disabled={pending}
                className={differs ? `${control} border-amber-500` : control}
              >
                <option value="">{field.none}</option>
                {choices[field.key].map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                    {choice.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {changed > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-amber-600">
              <CircleDot className="h-3 w-3" />
              {changed} not yet applied — the rankings below still reflect the previous selection
            </span>
          ) : anyChosen ? (
            "Ranked by the selections above. Nothing is saved — your organization's defaults are unchanged."
          ) : (
            "Ranked by your organization's defaults. Choose any of these to see what changes."
          )}
        </p>

        <div className="flex items-center gap-2">
          {anyChosen && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                const cleared = { weightSetId: "", categoryWeightSetId: "", criticalityModelId: "", scaleFactorModelId: "" };
                setSelected(cleared);
                navigate(cleared);
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Back to defaults
            </Button>
          )}
          <Button type="button" size="sm" disabled={pending || changed === 0} onClick={() => navigate(selected)}>
            {pending ? "Recalculating…" : "Recalculate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
