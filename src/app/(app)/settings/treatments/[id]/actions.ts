"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { setTreatmentRuleTree } from "@/server/rules";
import { ruleIdsIn, type RuleGroup } from "@/domain/waterline/decision-tree";
import { setTreatmentCosts, type CostRateInput } from "@/server/cost-rates";

/**
 * Which rules gate a treatment decides what the model recommends, so it
 * carries the same bar as editing the treatment itself.
 */
/* Superseded by setTreatmentRuleTreeAction. */

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

/**
 * How the allow rules are arranged, plus which blocks apply. Same bar as
 * editing the treatment: the arrangement decides what the model proposes.
 */
export async function setTreatmentRuleTreeAction(
  treatmentId: string,
  tree: RuleGroup,
  blockIds: string[]
): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireCardWrite(
      "/settings/treatments",
      "Only an Administrator can change when a treatment can be used"
    );

    await setTreatmentRuleTree(
      session.user.organizationId,
      treatmentId,
      tree,
      Array.isArray(blockIds) ? blockIds : []
    );

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

    const count = ruleIdsIn(tree).length;
    return {
      ok: true,
      message:
        count === 0 && blockIds.length === 0
          ? "Saved. With nothing arranged, this treatment is considered for every inspected asset."
          : `Saved. ${count} rule${count === 1 ? "" : "s"} arranged${blockIds.length > 0 ? `, plus ${blockIds.length} blocking` : ""}.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}
