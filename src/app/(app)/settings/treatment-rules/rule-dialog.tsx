"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EditorDialog } from "@/components/ui/editor-dialog";
import type { RuleEffect } from "@/domain/waterline/decision-tree";
import { RuleEditor } from "./rule-editor";
import { openRuleAction, saveRuleAction, deleteRuleAction, type OpenedRule } from "./actions";

/** What to open: an existing rule, or a new one of the given kind. */
export type RuleRequest = { id: string } | { id: null; effect: RuleEffect };

/**
 * A rule, written or edited in a pop-up — over the Treatment Rules list, or
 * over a treatment that uses it.
 *
 * Opening a rule used to mean leaving where you were: a section far down the
 * rules page, or the rules page itself from a treatment, with the browser's
 * back button as the only way home. Here nothing underneath moves: Cancel or
 * Save & close and you are exactly where you were.
 *
 * The rule and its sample segments are fetched as it opens, not with the page
 * beneath. `onSaved` reports the rule's id and whether it allows or blocks, so
 * a new rule can be added to a treatment where it was written.
 */
export function RuleDialog({
  request,
  usedBy,
  addingTo,
  allowDelete = false,
  addsOnCreate = false,
  onClose,
  onSaved,
}: {
  /** Null when closed. Give each opening a fresh object — it is what resets. */
  request: RuleRequest | null;
  /** Treatments using the rule being edited, from the list already loaded. */
  usedBy: string[];
  /** Where a new rule goes once created, said in the dialog's description. */
  addingTo?: string;
  /** Offer Delete — on the rules list, not over a treatment, where deleting a
   * shared rule is not what anyone came to do. */
  allowDelete?: boolean;
  /** A new rule joins the treatment it was written from ("Create & add"). */
  addsOnCreate?: boolean;
  onClose: () => void;
  onSaved?: (id: string, effect: RuleEffect, close: boolean) => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ for: RuleRequest; outcome: Awaited<ReturnType<typeof openRuleAction>> } | null>(
    null
  );

  useEffect(() => {
    if (!request) return;
    let live = true;
    openRuleAction(request.id, request.id == null ? request.effect : undefined).then((outcome) => {
      if (live) setLoaded({ for: request, outcome });
    });
    return () => {
      live = false;
    };
  }, [request]);

  // Anything fetched for an earlier opening is not this one's.
  const outcome = loaded && loaded.for === request ? loaded.outcome : null;
  const rule: OpenedRule | null = outcome?.ok ? outcome.rule : null;
  const isNew = request != null && request.id == null;

  return (
    <EditorDialog
      open={request != null}
      onClose={onClose}
      title={rule ? (rule.draft.id ? `Edit ${rule.draft.name}` : "Write a new rule") : isNew ? "Write a new rule" : "Edit rule"}
      description={
        isNew
          ? `Created in the shared rule library${addingTo ? ` and ${addingTo}` : ""}.`
          : "Changes apply to every treatment, combination and price using this rule once saved."
      }
    >
      {!outcome ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the rule and sample segments…
        </p>
      ) : !outcome.ok ? (
        <p className="py-6 text-sm text-destructive">{outcome.message}</p>
      ) : (
        rule && (
          <RuleEditor
            initial={rule.draft}
            usedBy={usedBy}
            isGenerated={rule.isGenerated}
            samples={rule.samples}
            fieldOptions={rule.fieldOptions}
            onSave={saveRuleAction}
            inDialog
            addsOnCreate={addsOnCreate}
            onCancel={onClose}
            onDelete={allowDelete ? deleteRuleAction : undefined}
            onDeleted={() => {
              onClose();
              router.refresh();
            }}
            onSaved={(id, effect, close) => {
              onSaved?.(id, effect, close);
              router.refresh();
              if (close) onClose();
            }}
          />
        )
      )}
    </EditorDialog>
  );
}
