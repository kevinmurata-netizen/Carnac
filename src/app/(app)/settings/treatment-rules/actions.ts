"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { createRule, updateRule, deleteRule, deleteRules } from "@/server/rules";
import { isValidNode, type Group, type RuleEffect } from "@/domain/waterline/decision-tree";

/** Treatment rules gate what work gets recommended and therefore what shows up
 * in the identified need, so changing them is an Administrator action. */
async function requireWriteAccess() {
  return requireCardWrite("/settings/treatment-rules", "Only an Administrator can change treatment rules");
}

/** Recommendations, costs, work plans and scenarios all run through
 * isApplicable, so all of them change the moment a rule does. */
function revalidateEverythingRulesTouch() {
  for (const path of [
    "/settings/treatment-rules",
    "/settings/treatments",
    "/treatment-planning",
    "/work-plan",
    "/scenario-planning",
    "/model-results",
    "/assets",
  ]) {
    revalidatePath(path);
  }
}

export type RulePayload = {
  id: string | null;
  name: string;
  description: string;
  effect: RuleEffect;
  enabled: boolean;
  root: Group;
};

export async function saveRuleAction(payload: RulePayload): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const session = await requireWriteAccess();

    // The definition arrives from the browser, so it is validated here rather
    // than trusted — a crafted payload must not become a stored rule.
    if (!isValidNode(payload?.root) || payload.root.kind !== "group") {
      throw new Error("That rule is incomplete — check that every condition has a field and an operator");
    }
    const effect: RuleEffect = payload.effect === "block" ? "block" : "allow";

    const input = {
      name: payload.name,
      description: payload.description,
      effect,
      enabled: Boolean(payload.enabled),
      root: payload.root,
    };

    let id = payload.id;
    if (id) await updateRule(session.user.organizationId, id, input);
    else id = await createRule(session.user.organizationId, input);

    revalidateEverythingRulesTouch();

    return {
      ok: true,
      id,
      message: payload.enabled
        ? "Saved. This rule applies to every treatment it is attached to, from the next run."
        : "Saved, and left disabled — it takes no part in qualification until you enable it.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}

export async function deleteRuleAction(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireWriteAccess();
    await deleteRule(session.user.organizationId, id);
    revalidateEverythingRulesTouch();
    return { ok: true, message: "Deleted." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not delete" };
  }
}

export type BulkDeleteState = { status: "idle" | "success" | "error"; message: string | null };

/**
 * Delete the rules ticked on the list. Anything still in use is kept and
 * named, and a partial result reads as an error so it is never mistaken for
 * everything having gone.
 */
export async function deleteRulesAction(_prev: BulkDeleteState, formData: FormData): Promise<BulkDeleteState> {
  try {
    const session = await requireWriteAccess();
    const ids = formData.getAll("id").map(String).filter(Boolean);
    if (ids.length === 0) return { status: "error", message: "No rules were selected." };

    const { deleted, kept } = await deleteRules(session.user.organizationId, ids);
    revalidateEverythingRulesTouch();

    const deletedText =
      deleted.length === 0 ? "Nothing was deleted." : `Deleted ${deleted.length}: ${deleted.join(", ")}.`;
    if (kept.length === 0) return { status: "success", message: deletedText };
    return {
      status: "error",
      message: `${deletedText} Kept ${kept.length}, because deleting ${kept.length === 1 ? "it" : "them"} would quietly change what they apply to: ${kept
        .map((k) => `${k.name} (${k.reason})`)
        .join("; ")}.`,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not delete those rules" };
  }
}
