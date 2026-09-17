"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCardWrite } from "@/server/guard";
import {
  createTreatment,
  updateTreatment,
  deleteTreatment,
  deleteTreatments,
  copyTreatments,
  type TreatmentInput,
} from "@/server/treatment-config";
import { setTreatmentCosts, validateCostRates, type CostRateInput } from "@/server/cost-rates";
import { setTreatmentRuleTree } from "@/server/rules";
import { setTreatmentEffects } from "@/server/effects";
import { isValidRuleNode, type RuleGroup } from "@/domain/waterline/decision-tree";
import type { TreatmentCategory } from "@/domain/waterline/treatment";
import type { TreatmentActionState } from "./state";

async function requireWriteAccess() {
  return requireCardWrite("/settings/treatments", "Only an Administrator can change the treatment library");
}

/** Treatments feed recommendations, LCCA, work plans and scenarios. */
function revalidateAffected() {
  for (const path of [
    "/settings/treatments",
    "/treatment-planning",
    "/work-plan",
    "/scenario-planning",
    "/assets",
  ]) {
    revalidatePath(path);
  }
}

const CATEGORIES: TreatmentCategory[] = ["Assess", "Repair", "Rehabilitate", "Renew", "Retire"];

function num(form: FormData, key: string, fallback = 0): number {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`"${key}" must be a number`);
  return n;
}

function optionalNum(form: FormData, key: string): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`"${key}" must be a number`);
  return n;
}

function parseInput(form: FormData): TreatmentInput {
  const category = String(form.get("category") ?? "Repair") as TreatmentCategory;

  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    // Empty means "use the shipped default", not "no limit" — so an
    // administrator who never opens this box still gets the backstop.
    retreatmentIntervalYears: optionalNum(form, "retreatmentIntervalYears"),
    category: CATEGORIES.includes(category) ? category : "Repair",
    // No cost fields: the form has not asked about them since prices moved to
    // cost rates, so reading them here only ever produced zeroes. The create
    // path supplies the fallback rate explicitly instead.
    usefulLife: num(form, "usefulLife", 0),
    implementationConstraints: String(form.get("implementationConstraints") ?? "").trim() || null,
  };
}

/**
 * The prices and the rule arrangement travel as JSON in hidden fields, because
 * both are trees and neither survives being flattened into form keys. Parsed
 * defensively: the shape is checked here, and the values are checked again by
 * the same validators the edit page uses.
 */
function parseRates(form: FormData): CostRateInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("costRates") ?? "[]"));
  } catch {
    throw new Error("Those prices could not be read and nothing was created");
  }
  if (!Array.isArray(raw)) throw new Error("Those prices could not be read and nothing was created");

  return raw.map((entry) => {
    const r = entry as Record<string, unknown>;
    return {
      name: String(r.name ?? ""),
      ruleId: typeof r.ruleId === "string" && r.ruleId ? r.ruleId : null,
      unitCost: Number(r.unitCost ?? 0),
      costUnit: r.costUnit === "per LF" ? "per LF" : "per each",
      mobilizationCost: Number(r.mobilizationCost ?? 0),
      annualMaintenanceCost: Number(r.annualMaintenanceCost ?? 0),
    };
  });
}

function parseArrangement(form: FormData): { tree: RuleGroup; blockIds: string[] } {
  let tree: unknown;
  let blockIds: unknown;
  try {
    tree = JSON.parse(String(form.get("ruleTree") ?? "null"));
    blockIds = JSON.parse(String(form.get("blockIds") ?? "[]"));
  } catch {
    throw new Error("That arrangement could not be read and nothing was created");
  }
  if (!isValidRuleNode(tree) || tree.kind !== "group") {
    throw new Error("That arrangement is malformed and nothing was created");
  }
  return {
    tree,
    blockIds: Array.isArray(blockIds) ? blockIds.filter((id): id is string => typeof id === "string") : [],
  };
}

/** The chosen effects, in order. An empty list is allowed: a treatment that
 * does nothing to condition or risk is a real thing — an inspection. */
function parseEffectIds(form: FormData): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("effectIds") ?? "[]"));
  } catch {
    throw new Error("Those effects could not be read and nothing was created");
  }
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

export async function saveTreatmentAction(
  _prev: TreatmentActionState,
  formData: FormData
): Promise<TreatmentActionState> {
  try {
    const session = await requireWriteAccess();
    await updateTreatment(session.user.organizationId, String(formData.get("id") ?? ""), parseInput(formData));
    revalidateAffected();
    return { status: "success", message: "Treatment saved. Recommendations and plans will use it from now on." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not save treatment" };
  }
}

/**
 * Create a treatment complete with its prices and its rule arrangement.
 *
 * All three are submitted together because a treatment is not usable without
 * all three: no rate means it cannot be priced, so it is silently absent from
 * every recommendation. The new-treatment page therefore shows the same four
 * sections as the detail page and saves them in one press.
 *
 * Everything is validated before anything is written, and the treatment is
 * removed again if a later step still fails — a half-built treatment left
 * behind by a failed create would quietly change what the model recommends.
 */
export async function createTreatmentAction(
  _prev: TreatmentActionState,
  formData: FormData
): Promise<TreatmentActionState> {
  let created: { organizationId: string; id: string } | null = null;

  try {
    const session = await requireWriteAccess();
    const organizationId = session.user.organizationId;

    const rates = parseRates(formData);
    const { tree, blockIds } = parseArrangement(formData);
    const effectIds = parseEffectIds(formData);
    validateCostRates(rates);

    // The treatment row keeps its own copy of the price, and the fallback is
    // the one that applies to everything, so that is the one it carries.
    const fallback = rates.find((r) => !r.ruleId) ?? rates[rates.length - 1];
    const id = await createTreatment(organizationId, {
      ...parseInput(formData),
      unitCost: fallback.unitCost,
      costUnit: fallback.costUnit,
      mobilizationCost: fallback.mobilizationCost,
      annualMaintenanceCost: fallback.annualMaintenanceCost,
    });
    created = { organizationId, id };

    await setTreatmentCosts(organizationId, id, rates);
    await setTreatmentRuleTree(organizationId, id, tree, blockIds);
    await setTreatmentEffects(organizationId, id, effectIds);
  } catch (err) {
    if (created) {
      // Safe: a treatment created moments ago is in no work plan, which is the
      // only thing deletion refuses over.
      await deleteTreatment(created.organizationId, created.id).catch(() => {});
    }
    return { status: "error", message: err instanceof Error ? err.message : "Could not create treatment" };
  }

  if (!created) return { status: "error", message: "Could not create treatment" };

  revalidateAffected();
  revalidatePath("/settings/treatment-rules");
  // Straight to the treatment just made, which is where its rules and prices
  // are edited from now on.
  redirect(`/settings/treatments/${created.id}`);
}

export async function deleteTreatmentAction(
  _prev: TreatmentActionState,
  formData: FormData
): Promise<TreatmentActionState> {
  try {
    const session = await requireWriteAccess();
    await deleteTreatment(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Treatment deleted." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not delete treatment" };
  }
}

/**
 * Delete the treatments ticked on the library page.
 *
 * A partial result is reported as an error when anything was kept, even if
 * most went: "5 deleted" in green over a list still showing two of them reads
 * as a bug. The message names what stayed and why.
 */
/** The list's bar: Copy selected and Delete selected share one form, and the
 * button pressed says which. */
export async function bulkTreatmentsAction(
  prev: TreatmentActionState,
  formData: FormData
): Promise<TreatmentActionState> {
  return formData.get("intent") === "copy" ? copyTreatmentsAction(formData) : deleteTreatmentsAction(prev, formData);
}

async function copyTreatmentsAction(formData: FormData): Promise<TreatmentActionState> {
  try {
    const session = await requireWriteAccess();
    const ids = formData.getAll("id").map(String).filter(Boolean);
    if (ids.length === 0) return { status: "error", message: "No treatments were selected." };
    const names = await copyTreatments(session.user.organizationId, ids);
    revalidateAffected();
    revalidatePath("/settings/treatment-rules");
    revalidatePath("/settings/treatment-effects");
    revalidatePath("/settings/treatment-costs");
    return {
      status: "success",
      message: `Copied ${names.length}: ${names.join(", ")} — each with its rules, prices and effects. A copy qualifies wherever the original does, so change its rules or effects before running a scenario that considers every treatment.`,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not copy those treatments" };
  }
}

export async function deleteTreatmentsAction(
  _prev: TreatmentActionState,
  formData: FormData
): Promise<TreatmentActionState> {
  try {
    const session = await requireWriteAccess();
    const ids = formData.getAll("id").map(String).filter(Boolean);
    if (ids.length === 0) return { status: "error", message: "No treatments were selected." };

    const { deleted, kept } = await deleteTreatments(session.user.organizationId, ids);
    revalidateAffected();
    revalidatePath("/settings/treatment-combinations");

    const deletedText =
      deleted.length === 0 ? "Nothing was deleted." : `Deleted ${deleted.length}: ${deleted.join(", ")}.`;
    if (kept.length === 0) return { status: "success", message: deletedText };
    return {
      status: "error",
      message: `${deletedText} Kept ${kept.length}, because deleting ${kept.length === 1 ? "it" : "them"} would break existing plans: ${kept
        .map((k) => `${k.name} (${k.reason})`)
        .join("; ")}.`,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not delete those treatments" };
  }
}

export async function goToTreatmentAction(formData: FormData) {
  redirect(`/settings/treatments/${String(formData.get("id") ?? "")}`);
}
