"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditorDialog } from "@/components/ui/editor-dialog";
import type { EffectSummary } from "@/server/effects";
import { EffectList } from "./effect-list";
import { EffectEditor, BLANK_EFFECT, effectDraftOf, type EffectDraft } from "./effect-editor";
import { saveEffectAction, deleteEffectAction } from "./actions";

/**
 * The effects list, and the editor that opens over it.
 *
 * The editor is a pop-up rather than a section under the list: opened from a
 * long list, a section appeared below the fold, and closing it meant scrolling
 * back to find your place. Cancel, Save and Save & close work the same way as
 * the pop-up on a treatment.
 *
 * `?effect=<id>` or `?effect=new` still opens the editor, so an old link lands
 * where it used to; closing clears it from the address.
 */
export function EffectWorkspace({
  effects,
  canEdit,
  initialOpen,
}: {
  effects: EffectSummary[];
  canEdit: boolean;
  /** From the address: an effect id, "new", or nothing. */
  initialOpen: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const draftFor = (key: string | null): EffectDraft | null => {
    if (!key || !canEdit) return null;
    if (key === "new") return { ...BLANK_EFFECT };
    const effect = effects.find((e) => e.id === key);
    return effect ? effectDraftOf(effect) : null;
  };

  // A fresh key per opening, so the editor starts from that draft — and
  // saving without closing does not remount it and blank what was typed.
  const [editing, setEditing] = useState<EffectDraft | null>(() => draftFor(initialOpen));
  const [opening, setOpening] = useState(0);
  const open = (draft: EffectDraft) => {
    setOpening((n) => n + 1);
    setEditing(draft);
  };

  const close = () => {
    setEditing(null);
    // Arrived by a link that opened the editor: take the parameter off, so a
    // refresh does not open it again.
    if (initialOpen) router.replace(pathname, { scroll: false });
  };

  // The saved effect's id, once it has one, so the list can highlight it and
  // the sharing warning can name its treatments.
  const [savedId, setSavedId] = useState<string | null>(null);
  const currentId = editing?.id ?? savedId;
  const current = currentId ? effects.find((e) => e.id === currentId) : undefined;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>
          Effects <span className="text-muted-foreground">({effects.length})</span>
        </CardTitle>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setSavedId(null);
              open({ ...BLANK_EFFECT });
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New effect
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {effects.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            No effects yet. A treatment with none changes nothing about condition or risk.
          </p>
        ) : (
          <EffectList
            effects={effects}
            selectedId={editing ? (currentId ?? null) : null}
            canEdit={canEdit}
            onOpen={(id) => {
              const effect = effects.find((e) => e.id === id);
              if (effect) {
                setSavedId(null);
                open(effectDraftOf(effect));
              }
            }}
          />
        )}
      </CardContent>

      <EditorDialog
        open={editing != null}
        onClose={close}
        title={editing?.id ? `Edit ${editing.name}` : "New effect"}
        description={
          editing?.id
            ? "Changes apply to every treatment using this effect once saved."
            : "Written once here, then added to as many treatments as it applies to."
        }
      >
        {editing && (
          <EffectEditor
            key={opening}
            initial={editing}
            usedBy={current?.usedBy ?? []}
            inDialog
            onSave={saveEffectAction}
            onCancel={close}
            onSaved={(id, shouldClose) => {
              setSavedId(id);
              router.refresh();
              if (shouldClose) close();
            }}
            onDelete={async (id) => {
              const outcome = await deleteEffectAction(id);
              if (outcome.ok) {
                close();
                router.refresh();
              }
              return outcome;
            }}
          />
        )}
      </EditorDialog>
    </Card>
  );
}
