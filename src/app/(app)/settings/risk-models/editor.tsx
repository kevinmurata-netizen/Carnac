"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { RiskModelConfig } from "@/server/settings";
import { saveRiskModelAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const FACTOR_LABELS: Record<string, string> = {
  CONDITION: "Condition (WCI)",
  AGE: "Age vs expected life",
  FAILURE_HISTORY: "Failure history (10 yr)",
  MATERIAL: "Material",
  CUSTOMERS_SERVED: "Customers served",
  CRITICALITY: "Criticality",
  DIAMETER: "Diameter",
  CUSTOMER_TYPE: "Customer type",
};

function label(code: string) {
  return FACTOR_LABELS[code] ?? code;
}

export function RiskModelEditor({ config }: { config: RiskModelConfig }) {
  const [state, action] = useActionState(saveRiskModelAction, EMPTY_SETTINGS_STATE);
  const [pof, setPof] = useState<Record<string, number>>(config.pof);
  const [cof, setCof] = useState<Record<string, number>>(config.cof);

  return (
    <form action={action}>
      <Card>
        <CardHeader>
          <CardTitle>Model</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 sm:max-w-md">
            <Label htmlFor="name">Model Name</Label>
            <input id="name" name="name" defaultValue={config.name} className={input} required />
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WeightGroup
          title="Probability of Failure"
          prefix="pof"
          weights={pof}
          onChange={(code, v) => setPof((p) => ({ ...p, [code]: v }))}
        />
        <WeightGroup
          title="Consequence of Failure"
          prefix="cof"
          weights={cof}
          onChange={(code, v) => setCof((p) => ({ ...p, [code]: v }))}
        />
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-4 pt-6">
          <p className="text-xs text-muted-foreground">
            Each factor is rated 1–5, then combined as a weighted average within its group. Weights are renormalized,
            so they need not sum to 1 — entering 40/25/25/10 and 4/2.5/2.5/1 give identical scores. Risk is then
            probability × consequence, on the 1–25 matrix.
          </p>
          <p className="text-xs text-muted-foreground">
            Saving stores the weights; they apply the next time risk is recomputed. The{" "}
            {config.assessmentCount.toLocaleString()} existing assessments keep the weights they were scored with, and
            each one records its own factor breakdown, so a past score can always be explained by the model that
            produced it.
          </p>
          <SaveBar state={state} label="Save weights" hint="Applies to the next risk recompute." />
        </CardContent>
      </Card>
    </form>
  );
}

function WeightGroup({
  title,
  prefix,
  weights,
  onChange,
}: {
  title: string;
  prefix: string;
  weights: Record<string, number>;
  onChange: (code: string, value: number) => void;
}) {
  const total = Object.values(weights).reduce((s, n) => s + n, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(weights).map(([code, value]) => {
          const share = total > 0 ? (value / total) * 100 : 0;
          return (
            <div key={code} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${prefix}_${code}`} className="text-sm">
                  {label(code)}
                </Label>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {share.toFixed(0)}% of {title.split(" ")[0].toLowerCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`${prefix}_${code}`}
                  name={`${prefix}_${code}`}
                  type="number"
                  min={0}
                  step={0.05}
                  value={value}
                  onChange={(e) => onChange(code, Number(e.target.value))}
                  className={`${input} w-24 shrink-0`}
                />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                </div>
              </div>
            </div>
          );
        })}
        {total <= 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Every weight is zero, which would make this whole score meaningless. Give at least one factor a weight.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
