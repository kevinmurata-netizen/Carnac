"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { setTreatmentRules } from "@/server/rules";

/**
 * Which rules gate a treatment decides what the model recommends, so it
 * carries the same bar as editing the treatment itself.
 */
export async function setTreatmentRulesAction(
  treatmentId: string,
  ruleIds: string[],
  mode: "any" | "all"
): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireCardWrite(
      "/settings/treatments",
      "Only an Administrator can change which rules gate a treatment"
    );

    await setTreatmentRules(
      session.user.organizationId,
      treatmentId,
      Array.isArray(ruleIds) ? ruleIds : [],
      mode === "any" ? "any" : "all"
    );

    // Recommendations, costs, work plans and scenarios all run through
    // isApplicable, so all of them change the moment an attachment does.
    for (const path of [
      "/settings/treatments",
      `/settings/treatments/${treatmentId}`,
      "/settings/decision-trees",
      "/treatment-planning",
      "/work-plan",
      "/scenario-planning",
      "/model-results",
      "/assets",
    ]) {
      revalidatePath(path);
    }

    return {
      ok: true,
      message:
        ruleIds.length === 0
          ? "Saved. With no rules attached, this treatment is considered for every inspected asset."
          : `Saved. ${ruleIds.length} rule${ruleIds.length === 1 ? "" : "s"} now gate this treatment.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}
