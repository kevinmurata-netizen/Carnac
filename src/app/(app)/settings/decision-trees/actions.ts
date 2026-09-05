"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { saveTrees, setQualifyMode } from "@/server/decision-trees";
import { isValidTree, type DecisionTree, type QualifyMode } from "@/domain/waterline/decision-tree";

/** Treatment rules gate what work gets recommended and therefore what shows up
 * in the identified need, so changing them is an Administrator action. */
async function requireWriteAccess() {
  return requireCardWrite("/settings/decision-trees", "Only an Administrator can change treatment rules");
}

export async function saveTreesAction(
  treatmentId: string,
  trees: DecisionTree[],
  mode: QualifyMode
): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireWriteAccess();

    // The trees arrive from the browser, so they are validated here rather
    // than trusted — a crafted payload must not become a stored rule.
    if (!Array.isArray(trees) || !trees.every((t) => isValidTree(t))) {
      throw new Error("Some of those rules are incomplete — check that every condition has a field and operator");
    }

    await saveTrees(session.user.organizationId, treatmentId, trees);
    await setQualifyMode(session.user.organizationId, treatmentId, mode === "all" ? "all" : "any");

    // Recommendations, costs, work plans and scenarios all run through
    // isApplicable, so all of them change the moment a tree does.
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

    const active = trees.filter((t) => t.enabled).length;
    return {
      ok: true,
      message:
        active === 0
          ? "Saved. No active trees, so only the technical window applies."
          : `Saved. ${active} tree${active === 1 ? " now gates" : "s now gate"} this treatment.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}
