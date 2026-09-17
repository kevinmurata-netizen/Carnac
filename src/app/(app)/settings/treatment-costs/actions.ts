"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { copyCostRates, deleteCostRates } from "@/server/cost-rates";

export type BulkCostState = { status: "idle" | "success" | "error"; message: string | null };

/** Prices are saved on the treatment they belong to, so changing them here
 * carries the treatment library's permission, as the prices pop-up does. */
async function requireWriteAccess() {
  return requireCardWrite("/settings/treatments", "Only an Administrator can change what a treatment costs");
}

/** Prices feed recommendations, life-cycle comparisons, work plans and
 * scenarios. */
function revalidateEverythingPricesTouch() {
  for (const path of [
    "/settings/treatment-costs",
    "/treatment-planning",
    "/work-plan",
    "/scenario-planning",
    "/model-results",
    "/assets",
  ]) {
    revalidatePath(path);
  }
  revalidatePath("/settings/treatments", "layout");
}

const list = (items: Array<{ name: string; reason: string }>) =>
  items.map((k) => `${k.name} (${k.reason})`).join("; ");

/** The grid's bar: Copy selected and Delete selected share one form, and the
 * button pressed says which. */
export async function bulkCostRatesAction(prev: BulkCostState, formData: FormData): Promise<BulkCostState> {
  try {
    const session = await requireWriteAccess();
    const ids = formData.getAll("id").map(String).filter(Boolean);
    if (ids.length === 0) return { status: "error", message: "No prices were selected." };
    const organizationId = session.user.organizationId;

    if (formData.get("intent") === "copy") {
      const { copied, skipped } = await copyCostRates(organizationId, ids);
      revalidateEverythingPricesTouch();
      const copiedText =
        copied.length === 0
          ? "Nothing was copied."
          : `Copied ${copied.length}: ${copied.join(", ")}. Each copy sits just below its original with the same rule, so it is not charged until you change its rule.`;
      if (skipped.length === 0) return { status: "success", message: copiedText };
      return { status: "error", message: `${copiedText} Not copied: ${list(skipped)}.` };
    }

    const { deleted, kept } = await deleteCostRates(organizationId, ids);
    revalidateEverythingPricesTouch();
    const deletedText =
      deleted.length === 0
        ? "Nothing was deleted."
        : `Deleted ${deleted.length}: ${deleted.join(", ")}. Assets they priced are now charged by the next price down whose rule matches.`;
    if (kept.length === 0) return { status: "success", message: deletedText };
    return { status: "error", message: `${deletedText} Kept ${kept.length}: ${list(kept)}.` };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not change those prices" };
  }
}
