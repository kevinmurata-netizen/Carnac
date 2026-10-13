"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { indexWords } from "@/lib/index-words";
import { renameIndexAction } from "./actions";
import { EMPTY_INDEX_STATE, type IndexActionState } from "./state";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/** The index's name, and the short form the screens put beside a score. */
export function IndexNameForm({
  name,
  assetTypeId,
  canEdit,
}: {
  name: string;
  assetTypeId: string;
  canEdit: boolean;
}) {
  const [state, rename, saving] = useActionState<IndexActionState, FormData>(renameIndexAction, EMPTY_INDEX_STATE);
  const [draft, setDraft] = useState(name);
  const words = indexWords(draft);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Name</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={rename} className="space-y-2">
          <input type="hidden" name="assetTypeId" value={assetTypeId} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="indexName" className="sr-only">
                Name
              </Label>
              <input
                id="indexName"
                name="name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!canEdit}
                className={input}
              />
            </div>
            {canEdit && (
              <Button type="submit" size="sm" disabled={saving || draft.trim() === name}>
                {saving ? "Saving…" : "Save name"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Scores read as &ldquo;{words.short} 62&rdquo;, and columns as &ldquo;Start {words.short}&rdquo;. Put a short
            form in brackets to choose it, e.g. &ldquo;Pole Condition Index (PCI)&rdquo;; without one, the initials are
            used.
          </p>
          {state.message && (
            <p className={`text-sm ${state.status === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
              {state.message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
