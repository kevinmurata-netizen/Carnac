"use client";

import { useRouter } from "next/navigation";
import { EffectEditor, type EffectDraft } from "./effect-editor";
import { saveEffectAction, deleteEffectAction } from "./actions";

/**
 * The editor as the Treatment Effects page uses it: after creating, the page
 * moves to the new effect's address, and after deleting, back to the list.
 * Kept apart from the editor itself so the pop-up on a treatment can use the
 * same editor without inheriting any of this navigation.
 */
export function EffectPageEditor({ initial, usedBy }: { initial: EffectDraft; usedBy: string[] }) {
  const router = useRouter();
  return (
    <EffectEditor
      initial={initial}
      usedBy={usedBy}
      onSave={saveEffectAction}
      onSaved={(id) => {
        if (!initial.id) router.replace(`/settings/treatment-effects?effect=${id}`);
        else router.refresh();
      }}
      onDelete={async (id) => {
        const outcome = await deleteEffectAction(id);
        if (outcome.ok) router.replace("/settings/treatment-effects");
        return outcome;
      }}
    />
  );
}
