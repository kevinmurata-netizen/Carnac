"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StickyActionBar } from "@/components/layout/sticky-action-bar";
import { CircleDot, MapPin } from "lucide-react";
import { saveMapPopupAction } from "./actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import type { MapField } from "@/server/map-settings";

/**
 * Which fields the map's hover card shows.
 *
 * A live preview sits alongside the checkboxes because the only question that
 * matters here is whether the resulting card is readable, and a list of ticked
 * boxes does not answer that.
 */
export function MapPopupEditor({
  fields,
  selected,
  sample,
  canEdit,
}: {
  fields: MapField[];
  selected: string[];
  /** A real segment's values, so the preview is not invented. */
  sample: Record<string, string> | null;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(saveMapPopupAction, EMPTY_SETTINGS_STATE);
  const [chosen, setChosen] = useState<string[]>(selected);
  const [saved, setSaved] = useState(() => JSON.stringify(selected));
  const [seen, setSeen] = useState(state);

  const dirty = JSON.stringify(chosen) !== saved;

  if (seen !== state) {
    setSeen(state);
    if (state.status === "success") setSaved(JSON.stringify(chosen));
  }

  const toggle = (key: string) =>
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  // Shown in the order the fields are declared, which is the order the card
  // renders them — so the preview matches what you will actually see.
  const previewRows = fields.filter((f) => chosen.includes(f.key));

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fields on the hover card</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Tick what appears when someone hovers a segment on the map. Only ticked fields are fetched, so a
              shorter card is also a smaller page.
            </p>
          </CardHeader>
          <CardContent className="grid gap-2 border-t pt-4 sm:grid-cols-2">
            {fields.map((field) => (
              <label
                key={field.key}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm ${
                  chosen.includes(field.key) ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <input
                  type="checkbox"
                  name="field"
                  value={field.key}
                  checked={chosen.includes(field.key)}
                  onChange={() => toggle(field.key)}
                  disabled={!canEdit}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{field.label}</span>
                  <span className="block text-xs text-muted-foreground">{field.hint}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              Preview
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {sample ? "Using a real segment from your network." : "No segments with a location yet."}
            </p>
          </CardHeader>
          <CardContent className="border-t pt-4">
            <div className="inline-block rounded-md border bg-card px-3 py-2 shadow-sm">
              <div className="text-xs leading-relaxed">
                <strong>{sample?.assetCode ?? "WL-0001"}</strong>
                {previewRows.length === 0 ? (
                  <div className="text-muted-foreground">{sample?.status ?? "ACTIVE"}</div>
                ) : (
                  previewRows.map((f) => (
                    <div key={f.key}>
                      {f.label}: <strong>{sample?.[f.key] ?? "—"}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
            {previewRows.length === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                With nothing ticked the card falls back to the segment ID and its status.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <StickyActionBar
        status={
          <>
            <span className="text-muted-foreground">
              {chosen.length === 0 ? "No fields selected." : `${chosen.length} field${chosen.length === 1 ? "" : "s"} on the card.`}
            </span>
            {dirty && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                <CircleDot className="h-3 w-3" />
                Unsaved
              </span>
            )}
            {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
            {state.status === "success" && !dirty && (
              <span className="text-xs text-emerald-600">{state.message}</span>
            )}
          </>
        }
      >
        {canEdit ? (
          <Button type="submit" size="sm" disabled={!dirty}>
            {dirty ? "Save changes" : "No changes"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Your role cannot change map settings</span>
        )}
      </StickyActionBar>
    </form>
  );
}
