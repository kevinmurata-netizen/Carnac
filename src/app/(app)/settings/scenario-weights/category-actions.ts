"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import {
  createCategoryWeightSet,
  updateCategoryWeightSet,
  deleteCategoryWeightSet,
  setDefaultCategoryWeightSet,
  type CategoryWeightSetInput,
} from "@/server/category-weight-sets";
import { CATEGORY_KEYS, type CategoryCaps, type CategoryWeights } from "@/domain/waterline/category-weight";

/** Same card, same bar: a category weighting decides what kind of work gets
 * funded. */
async function requireWriteAccess() {
  return requireCardWrite("/settings/scenario-weights", "Only an Administrator can change scenario weights");
}

function revalidateAffected() {
  for (const path of ["/settings/scenario-weights", "/scenario-planning", "/work-plan", "/treatment-planning"]) {
    revalidatePath(path);
  }
}

/**
 * Entered as multipliers — 1 means "leave this category alone".
 *
 * Not scaled by 100 the way the benefit weights are. Those are shares and read
 * better as whole percentages; these are the number that actually multiplies
 * the score, and showing 160 where the model uses 1.6 would invite someone to
 * read it as a percentage of something.
 */
function parse(form: FormData): CategoryWeightSetInput {
  const weights = {} as CategoryWeights;
  const caps = {} as CategoryCaps;

  for (const key of CATEGORY_KEYS) {
    const raw = String(form.get(key) ?? "").trim();
    const n = raw === "" ? 1 : Number(raw);
    if (!Number.isFinite(n)) throw new Error(`"${key}" must be a number`);
    weights[key] = n;

    // Caps are entered as whole percentages and stored as fractions, the same
    // way funding growth and discount rate are. An empty box means 100%:
    // "no ceiling", which is the neutral answer rather than "spend nothing".
    const rawCap = String(form.get(`${key}Cap`) ?? "").trim();
    const pct = rawCap === "" ? 100 : Number(rawCap);
    if (!Number.isFinite(pct)) throw new Error(`"${key}" budget cap must be a number`);
    caps[key] = Math.round(pct) / 100;
  }

  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? "").trim() || null,
    weights,
    caps,
  };
}

export async function saveCategoryWeightSetAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    const id = String(formData.get("id") ?? "").trim();
    const input = parse(formData);

    if (id) {
      await updateCategoryWeightSet(session.user.organizationId, id, input);
    } else {
      await createCategoryWeightSet(session.user.organizationId, input);
    }

    revalidateAffected();
    return {
      status: "success",
      message: id
        ? "Saved. Scenarios using this weighting apply it from the next run."
        : "Created. Choose it on a scenario.",
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not save the category weighting",
    };
  }
}

export async function setDefaultCategoryWeightSetAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    await setDefaultCategoryWeightSet(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return {
      status: "success",
      message: "Default changed. Any scenario that did not choose a category weighting now uses this one.",
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not change the default" };
  }
}

export async function deleteCategoryWeightSetAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    await deleteCategoryWeightSet(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Category weighting deleted." };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not delete the category weighting",
    };
  }
}
