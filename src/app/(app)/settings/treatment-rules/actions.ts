"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { prisma } from "@/lib/prisma";
import { createRule, updateRule, deleteRule, deleteRules, copyRules, getRuleForEditing } from "@/server/rules";
import { loadRuleSamples, loadRuleFieldOptions, type RuleSample } from "@/server/rule-samples";
import {
  emptyGroup,
  isValidNode,
  type DecisionField,
  type Group,
  type RuleEffect,
} from "@/domain/waterline/decision-tree";

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

export type OpenedRule = {
  draft: RulePayload;
  samples: RuleSample[];
  fieldOptions: Partial<Record<DecisionField, string[]>>;
  isGenerated: boolean;
};

/**
 * Everything the rule editor needs, fetched as the pop-up on a treatment opens
 * rather than with the treatment page — the sample segments are a real query,
 * and most visits to a treatment never open a rule.
 *
 * `id` null starts a new rule, allowing or blocking as asked.
 */
export async function openRuleAction(
  id: string | null,
  effect: RuleEffect = "allow"
): Promise<{ ok: true; rule: OpenedRule } | { ok: false; message: string }> {
  try {
    const session = await requireWriteAccess();
    const organizationId = session.user.organizationId;

    const [samples, fieldOptions, stored] = await Promise.all([
      loadRuleSamples(organizationId),
      loadRuleFieldOptions(organizationId),
      id ? prisma.rule.findFirst({ where: { id, organizationId }, select: { isGenerated: true } }) : null,
    ]);

    if (!id) {
      return {
        ok: true,
        rule: {
          draft: { id: null, name: "", description: "", effect, enabled: true, root: emptyGroup("AND") },
          samples,
          fieldOptions,
          isGenerated: false,
        },
      };
    }

    const rule = await getRuleForEditing(organizationId, id);
    if (!rule || !stored) throw new Error("That rule no longer exists");
    return {
      ok: true,
      rule: {
        draft: {
          id: rule.id,
          name: rule.name,
          description: rule.description ?? "",
          effect: rule.effect,
          enabled: rule.enabled,
          root: rule.root,
        },
        samples,
        fieldOptions,
        isGenerated: stored.isGenerated,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not open that rule" };
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
/** The list's bar: Copy selected and Delete selected share one form, and the
 * button pressed says which. */
export async function bulkRulesAction(prev: BulkDeleteState, formData: FormData): Promise<BulkDeleteState> {
  return formData.get("intent") === "copy" ? copyRulesAction(formData) : deleteRulesAction(prev, formData);
}

async function copyRulesAction(formData: FormData): Promise<BulkDeleteState> {
  try {
    const session = await requireWriteAccess();
    const ids = formData.getAll("id").map(String).filter(Boolean);
    if (ids.length === 0) return { status: "error", message: "No rules were selected." };
    const names = await copyRules(session.user.organizationId, ids);
    revalidatePath("/settings/treatment-rules");
    return {
      status: "success",
      message: `Copied ${names.length}: ${names.join(", ")}. The copies are not attached to anything yet, so nothing is gated by them until you add them to a treatment, combination or price.`,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not copy those rules" };
  }
}

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
