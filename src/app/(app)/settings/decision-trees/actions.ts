"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { createRule, updateRule, deleteRule } from "@/server/rules";
import { isValidNode, type Group, type RuleEffect } from "@/domain/waterline/decision-tree";

/** Treatment rules gate what work gets recommended and therefore what shows up
 * in the identified need, so changing them is an Administrator action. */
async function requireWriteAccess() {
  return requireCardWrite("/settings/decision-trees", "Only an Administrator can change treatment rules");
}

/** Recommendations, costs, work plans and scenarios all run through
 * isApplicable, so all of them change the moment a rule does. */
function revalidateEverythingRulesTouch() {
  for (const path of [
    "/settings/decision-trees",
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
