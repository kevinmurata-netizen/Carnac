"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import {
  createFundingPlan,
  updateFundingPlan,
  deleteFundingPlan,
  setDefaultFundingPlan,
  clearDefaultFundingPlan,
  type FundingPlanInput,
} from "@/server/category-funding";
import { CATEGORY_KEYS } from "@/domain/waterline/category-weight";
import type { FundingStep } from "@/domain/waterline/category-funding";
import type { TreatmentCategory } from "@/domain/waterline/treatment";

const CARD = "/settings/category-funding";

/** A funding plan decides what a year's money actually buys, so changing one
 * carries the same bar as changing a treatment. */
async function requireWriteAccess() {
  return requireCardWrite(CARD, "Only an Administrator can change category funding");
}

function revalidateAffected() {
  for (const path of [CARD, "/scenario-planning", "/work-plan", "/treatment-planning"]) {
    revalidatePath(path);
  }
}

/**
 * The ordered list, posted as one JSON field.
 *
 * Parsed defensively rather than trusted: this is the field that decides
 * spending order, and a malformed one should be a message rather than a plan
 * that silently drops a category.
 */
function parseSteps(raw: FormDataEntryValue | null): FundingStep[] {
  if (typeof raw !== "string" || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Could not read the spending order. Try again.");
  }
  if (!Array.isArray(parsed)) throw new Error("Could not read the spending order. Try again.");

  return parsed.map((entry) => {
    const step = entry as { category?: unknown; maxPct?: unknown };
    const category = String(step.category ?? "");
    if (!(CATEGORY_KEYS as string[]).includes(category)) {
      throw new Error(`"${category}" is not a treatment category`);
    }
    const maxPct = Number(step.maxPct);
    if (!Number.isFinite(maxPct)) throw new Error(`${category}'s share must be a number`);
    return { category: category as TreatmentCategory, maxPct };
  });
}

function parse(form: FormData): FundingPlanInput {
  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? "").trim() || null,
    steps: parseSteps(form.get("steps")),
  };
}

export async function saveFundingPlanAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    const id = String(formData.get("id") ?? "").trim();
    const input = parse(formData);

    if (id) {
      await updateFundingPlan(session.user.organizationId, id, input);
    } else {
      await createFundingPlan(session.user.organizationId, input);
    }

    revalidateAffected();
    return {
      status: "success",
      message: id
        ? "Saved. Scenarios using this plan fund by it from the next run."
        : "Created. Choose it on a scenario.",
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not save the funding plan" };
  }
}

/**
 * Make one the default, or — with an empty id — clear it.
 *
 * Clearing is a real choice here in a way it is not for the weightings: "no
 * category order" is how allocation worked before this page existed, and
 * someone experimenting with an order needs a way back to it.
 */
export async function setDefaultFundingPlanAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    const id = String(formData.get("id") ?? "").trim();

    if (!id) {
      await clearDefaultFundingPlan(session.user.organizationId);
      revalidateAffected();
      return {
        status: "success",
        message:
          "Default cleared. A scenario that does not choose a plan now makes one pass down the ranked list, with category playing no part.",
      };
    }

    await setDefaultFundingPlan(session.user.organizationId, id);
    revalidateAffected();
    return { status: "success", message: "Default changed. Any scenario that did not choose a plan now uses this one." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not change the default" };
  }
}

export async function deleteFundingPlanAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    await deleteFundingPlan(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Funding plan deleted." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not delete the funding plan" };
  }
}
