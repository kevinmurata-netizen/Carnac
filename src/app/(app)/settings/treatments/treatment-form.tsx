"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { saveTreatmentAction, createTreatmentAction, deleteTreatmentAction } from "./actions";
import { EMPTY_TREATMENT_STATE, type TreatmentActionState } from "./state";
import type { TreatmentAdminRow } from "@/server/treatment-config";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const CATEGORIES = ["Assess", "Repair", "Rehabilitate", "Renew", "Retire"] as const;

function Feedback({ state }: { state: TreatmentActionState }) {
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

export function TreatmentForm({
  treatment,
  mode,
}: {
  treatment?: TreatmentAdminRow;
  mode: "edit" | "create";
}) {
  const action = mode === "edit" ? saveTreatmentAction : createTreatmentAction;
  const [state, submit, pending] = useActionState<TreatmentActionState, FormData>(action, EMPTY_TREATMENT_STATE);
  const [deleteState, remove, deleting] = useActionState<TreatmentActionState, FormData>(
    deleteTreatmentAction,
    EMPTY_TREATMENT_STATE
  );

  const [effectMode, setEffectMode] = useState<"reset" | "gain">(
    treatment?.conditionResetTo != null ? "reset" : "gain"
  );
  const effectValue = treatment?.conditionResetTo ?? treatment?.conditionGain ?? "";

  return (
    <div className="space-y-4">
      <Feedback state={deleteState.status !== "idle" ? deleteState : state} />

      <Card>
        <CardHeader>
          <CardTitle>{mode === "edit" ? "Treatment Definition" : "New Treatment"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submit} className="space-y-5">
            {treatment && <input type="hidden" name="id" value={treatment.id} />}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Name</Label>
                <input id="name" name="name" required defaultValue={treatment?.name} className={input} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <select id="category" name="category" defaultValue={treatment?.category ?? "Repair"} className={input}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="usefulLife">Useful Life (yr)</Label>
                <input
                  id="usefulLife"
                  name="usefulLife"
                  type="number"
                  min={0}
                  defaultValue={treatment?.usefulLife ?? 0}
                  className={input}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-4">
                <Label htmlFor="description">Description</Label>
                <input id="description" name="description" defaultValue={treatment?.description} className={input} />
              </div>
            </div>

            <fieldset className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">When it can be used</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="applicableConditionMin">Condition min</Label>
                  <input
                    id="applicableConditionMin"
                    name="applicableConditionMin"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={treatment?.applicableConditionMin ?? 0}
                    className={input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="applicableConditionMax">Condition max</Label>
                  <input
                    id="applicableConditionMax"
                    name="applicableConditionMax"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={treatment?.applicableConditionMax ?? 100}
                    className={input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="applicableDiameterMin">Diameter min (in)</Label>
                  <input
                    id="applicableDiameterMin"
                    name="applicableDiameterMin"
                    type="number"
                    defaultValue={treatment?.applicableDiameterMin ?? ""}
                    placeholder="any"
                    className={input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="applicableDiameterMax">Diameter max (in)</Label>
                  <input
                    id="applicableDiameterMax"
                    name="applicableDiameterMax"
                    type="number"
                    defaultValue={treatment?.applicableDiameterMax ?? ""}
                    placeholder="any"
                    className={input}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="applicableMaterials">Materials (comma-separated, blank = all)</Label>
                  <input
                    id="applicableMaterials"
                    name="applicableMaterials"
                    defaultValue={treatment?.applicableMaterials?.join(", ") ?? ""}
                    placeholder="Cast Iron, Ductile Iron"
                    className={input}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="implementationConstraints">Implementation constraints</Label>
                  <input
                    id="implementationConstraints"
                    name="implementationConstraints"
                    defaultValue={treatment?.implementationConstraints ?? ""}
                    className={input}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">What it does</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="effectMode">Condition effect</Label>
                  <select
                    id="effectMode"
                    name="effectMode"
                    value={effectMode}
                    onChange={(e) => setEffectMode(e.target.value as "reset" | "gain")}
                    className={input}
                  >
                    <option value="reset">Resets condition to</option>
                    <option value="gain">Adds points</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="effectValue">{effectMode === "reset" ? "New WCI" : "Points added"}</Label>
                  <input
                    id="effectValue"
                    name="effectValue"
                    type="number"
                    step="any"
                    defaultValue={effectValue}
                    className={input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="failureProbMultiplier">Failure prob. ×</Label>
                  <input
                    id="failureProbMultiplier"
                    name="failureProbMultiplier"
                    type="number"
                    min={0}
                    max={1}
                    step="any"
                    defaultValue={treatment?.failureProbMultiplier ?? 1}
                    className={input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expectedLifeExtension">Life extension (yr)</Label>
                  <input
                    id="expectedLifeExtension"
                    name="expectedLifeExtension"
                    type="number"
                    min={0}
                    defaultValue={treatment?.expectedLifeExtension ?? 0}
                    className={input}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A treatment that <em>resets</em> condition renews the asset; one that only <em>adds points</em> is a
                patch and stays on the same deterioration path in life-cycle cost. Failure multiplier of 1 means no
                effect, 0.2 means an 80% cut.
              </p>
            </fieldset>

            <fieldset className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">What it costs</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="unitCost">Unit cost ($)</Label>
                  <input
                    id="unitCost"
                    name="unitCost"
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={treatment?.unitCost ?? 0}
                    className={input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="costUnit">Unit</Label>
                  <select id="costUnit" name="costUnit" defaultValue={treatment?.costUnit ?? "per each"} className={input}>
                    <option value="per LF">per LF</option>
                    <option value="per each">per each</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mobilizationCost">Mobilization ($)</Label>
                  <input
                    id="mobilizationCost"
                    name="mobilizationCost"
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={treatment?.mobilizationCost ?? 0}
                    className={input}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="annualMaintenanceCost">Annual maintenance ($)</Label>
                  <input
                    id="annualMaintenanceCost"
                    name="annualMaintenanceCost"
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={treatment?.annualMaintenanceCost ?? 0}
                    className={input}
                  />
                </div>
              </div>
            </fieldset>

            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : mode === "edit" ? "Save Treatment" : "Create Treatment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {mode === "edit" && treatment && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-xs text-muted-foreground">
              {treatment.workPlanItemCount > 0
                ? `Used by ${treatment.workPlanItemCount} work plan project(s) — deletion will be refused while those exist.`
                : "Not referenced by any work plan project."}
            </p>
            <form action={remove}>
              <input type="hidden" name="id" value={treatment.id} />
              <Button type="submit" size="sm" variant="destructive" disabled={deleting}>
                {deleting ? "Deleting…" : "Delete Treatment"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
