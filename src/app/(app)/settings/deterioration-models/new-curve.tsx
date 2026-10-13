"use client";

import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DEFAULT_CURVE, curveProblem, evaluateCurve, type CurveParams } from "@/domain/waterline/deterioration";
import { SimpleLineChart } from "@/components/charts/simple-line-chart";
import { addMaterialCurveAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Give a modelled asset type a curve for one of its materials. Until it has
 * one, everything of that material ages on the default 75-year curve.
 *
 * Starts from the default curve, drawn, so the first change shows what it
 * does. Suggests the materials recorded on the type's assets that have no
 * curve yet — the ones currently on the default.
 */
export function NewCurve({
  assetTypeId,
  typeName,
  materialName,
  uncovered,
}: {
  assetTypeId: string;
  typeName: string;
  /** What the type calls its material: "Material", "Pole class". */
  materialName: string;
  /** Materials recorded on this type's assets with no curve of their own. */
  uncovered: string[];
}) {
  const [state, action] = useActionState(addMaterialCurveAction, EMPTY_SETTINGS_STATE);
  const [material, setMaterial] = useState(uncovered[0] ?? "");
  const [curve, setCurve] = useState<CurveParams>(DEFAULT_CURVE);
  const set = (patch: Partial<CurveParams>) => setCurve((c) => ({ ...c, ...patch }));
  const problem = curveProblem(curve);

  const rows = useMemo(() => {
    const horizon = Math.max(DEFAULT_CURVE.serviceLife, problem ? 0 : curve.serviceLife, 1);
    const step = horizon > 60 ? 5 : horizon > 30 ? 2 : 1;
    const out: Array<Record<string, number | null>> = [];
    for (let age = 0; age <= horizon; age += step) {
      out.push({
        age,
        fallback: evaluateCurve(DEFAULT_CURVE, age),
        ...(problem ? {} : { curve: evaluateCurve(curve, age) }),
      });
    }
    return out;
  }, [curve, problem]);

  const field = (key: keyof CurveParams, label: string, attrs: { min?: number; step?: number }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`new-${key}`}>{label}</Label>
      <input
        id={`new-${key}`}
        name={key}
        type="number"
        {...attrs}
        value={curve[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
        className={input}
      />
    </div>
  );

  return (
    <form action={action}>
      <input type="hidden" name="assetTypeId" value={assetTypeId} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a curve</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {uncovered.length > 0
              ? `${uncovered.length} ${materialName.toLowerCase()} value${uncovered.length === 1 ? "" : "s"} recorded on ${typeName} assets ${uncovered.length === 1 ? "has" : "have"} no curve, so ${uncovered.length === 1 ? "it ages" : "they age"} on the default ${DEFAULT_CURVE.serviceLife}-year curve: ${uncovered.join(", ")}.`
              : `Every ${materialName.toLowerCase()} recorded on ${typeName} assets has a curve. A new one can still be added ahead of the data.`}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="new-material">{materialName}</Label>
              <input
                id="new-material"
                name="material"
                list="uncovered-materials"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder={`The ${materialName.toLowerCase()} exactly as recorded`}
                className={input}
                required
              />
              <datalist id="uncovered-materials">
                {uncovered.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            {field("serviceLife", "Service Life (yr)", { min: 1, step: 1 })}
            {field("shape", "Curve Shape", { min: 0.1, step: 0.1 })}
            <div className="grid grid-cols-2 gap-2">
              {field("initialCondition", "Initial", {})}
              {field("minCondition", "Minimum", {})}
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <SimpleLineChart
              data={rows}
              xKey="age"
              yDomain={[0, 100]}
              height={200}
              series={[
                { key: "fallback", label: "Default curve", color: "var(--color-chart-3)", dashed: true },
                ...(problem ? [] : [{ key: "curve", label: material || "New curve", color: "var(--color-chart-1)" }]),
              ]}
            />
            {problem && <p className="mt-2 text-xs text-amber-700">{problem}.</p>}
          </div>

          <SaveBar
            state={state}
            label="Add curve"
            dirty={material.trim() !== ""}
            onDiscard={() => {
              setMaterial(uncovered[0] ?? "");
              setCurve(DEFAULT_CURVE);
            }}
            hint="The material must be spelled as it is recorded on the assets — that is how a curve finds them."
          />
        </CardContent>
      </Card>
    </form>
  );
}
