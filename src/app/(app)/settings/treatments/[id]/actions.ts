"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { setTreatmentRules } from "@/server/rules";
import { setTreatmentCosts, type CostRateInput } from "@/server/cost-rates";

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

/**
 * What a treatment costs, and which rule picks each price. Same bar as editing
 * the treatment: a cost rate decides what the model spends.
 */
export async function setTreatmentCostsAction(
  treatmentId: string,
  rates: CostRateInput[]
): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireCardWrite(
      "/settings/treatments",
      "Only an Administrator can change what a treatment costs"
    );

    await setTreatmentCosts(session.user.organizationId, treatmentId, Array.isArray(rates) ? rates : []);

    // Costs feed recommendations, life-cycle comparisons, work plans and
    // scenarios, so all of them change the moment a rate does.
    for (const path of [
      "/settings/treatments",
      `/settings/treatments/${treatmentId}`,
      "/treatment-planning",
      "/work-plan",
      "/scenario-planning",
      "/model-results",
      "/assets",
    ]) {
      revalidatePath(path);
    }

    const priced = rates.filter((r) => r.ruleId).length;
    return {
      ok: true,
      message:
        priced === 0
          ? "Saved. One price for every asset."
          : `Saved. ${priced} rule-selected price${priced === 1 ? "" : "s"}, plus the fallback.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}
