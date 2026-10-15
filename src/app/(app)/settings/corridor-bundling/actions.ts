"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { saveCorridorConfig, type CorridorInput } from "@/server/corridors";

const CARD = "/settings/corridor-bundling";

export type CorridorFormState = { status: "idle" | "success" | "error"; message?: string };

/**
 * The settings, posted as one JSON field: a savings table over every pair of
 * asset types is easier to send whole than to rebuild from field names. The
 * server checks every figure regardless.
 */
export async function saveCorridorAction(_prev: CorridorFormState, formData: FormData): Promise<CorridorFormState> {
  try {
    const session = await requireCardWrite(CARD, "Only an Administrator can change corridor bundling");
    let input: CorridorInput;
    try {
      const raw = JSON.parse(String(formData.get("config") ?? "{}"));
      input = {
        distanceMeters: Number(raw.distanceMeters),
        windowYears: Number(raw.windowYears),
        attributes: Object.fromEntries(
          Object.entries((raw.attributes ?? {}) as Record<string, unknown>).map(([id, code]) => [id, code ? String(code) : null])
        ),
        savings: ((raw.savings ?? []) as Array<Record<string, unknown>>).map((s) => ({
          assetTypeAId: String(s.assetTypeAId),
          assetTypeBId: String(s.assetTypeBId),
          sharesMobilization: s.sharesMobilization === true,
          savingPct: Number(s.savingPct),
        })),
      };
    } catch {
      throw new Error("The corridor settings could not be read");
    }
    await saveCorridorConfig(session.user.organizationId, input);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not save corridor bundling" };
  }
  for (const path of [CARD, "/scenario-planning"]) revalidatePath(path);
  return { status: "success", message: "Saved. The preview below reflects these settings." };
}
