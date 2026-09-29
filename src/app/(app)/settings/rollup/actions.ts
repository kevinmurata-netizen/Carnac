"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { auth } from "@/lib/auth";
import {
  applyRollupChange,
  createRollupStrategy,
  deleteRollupStrategy,
  previewRollupChange,
  type RollupChange,
  type RollupPreview,
} from "@/server/rollup";
import { ROLLUP_STRATEGY_TYPES, type RollupStrategyType } from "@/domain/components/rollup";

const CARD = "/settings/rollup";

export type RollupActionResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function fail(e: unknown): RollupActionResult {
  return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
}

function revalidate() {
  for (const path of [CARD, "/settings", "/assets"]) revalidatePath(path);
}

/** Changes are validated here as well as in the server module: this is the
 * boundary a crafted request would cross. */
function checkChange(change: RollupChange): RollupChange {
  if (change.kind === "editStrategy" && !ROLLUP_STRATEGY_TYPES.includes(change.type)) {
    throw new Error("Unknown strategy type");
  }
  return change;
}

/** What a change would do. Reading only, so anyone who can open the page may
 * preview; applying needs write access. */
export async function previewRollupChangeAction(
  change: RollupChange
): Promise<{ status: "success"; preview: RollupPreview } | { status: "error"; message: string }> {
  try {
    const session = await auth();
    if (!session) throw new Error("Sign in first");
    const preview = await previewRollupChange(session.user.organizationId, checkChange(change));
    return { status: "success", preview };
  } catch (e) {
    return fail(e) as { status: "error"; message: string };
  }
}

export async function applyRollupChangeAction(change: RollupChange): Promise<RollupActionResult> {
  try {
    const session = await requireCardWrite(CARD, "Your role cannot change roll-up strategies");
    await applyRollupChange(session.user.organizationId, checkChange(change));
    revalidate();
    return { status: "success", message: "Applied. Every asset score it governs now reads the new way." };
  } catch (e) {
    return fail(e);
  }
}

export async function createRollupStrategyAction(input: {
  name: string;
  description: string;
  type: RollupStrategyType;
  fullWeightSharePct: number | null;
}): Promise<RollupActionResult> {
  try {
    const session = await requireCardWrite(CARD, "Your role cannot change roll-up strategies");
    await createRollupStrategy(session.user.organizationId, {
      name: input.name,
      description: input.description || null,
      type: input.type,
      fullWeightShare: input.fullWeightSharePct == null ? null : input.fullWeightSharePct / 100,
    });
    revalidate();
    return {
      status: "success",
      message: "Strategy added. It scores nothing until it is made the default or an asset type is pointed at it.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRollupStrategyAction(strategyId: string): Promise<RollupActionResult> {
  try {
    const session = await requireCardWrite(CARD, "Your role cannot change roll-up strategies");
    await deleteRollupStrategy(session.user.organizationId, strategyId);
    revalidate();
    return { status: "success", message: "Strategy deleted." };
  } catch (e) {
    return fail(e);
  }
}
