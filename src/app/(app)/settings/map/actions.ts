"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { setPopupFields } from "@/server/map-settings";
import type { SettingsActionState } from "../state";

export async function saveMapPopupAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireCardWrite("/settings/map", "Your role cannot change map settings");

    // Unchecked boxes do not submit, so what arrives is exactly the set to keep.
    const keys = formData.getAll("field").map((v) => String(v));
    await setPopupFields(session.user.organizationId, keys);

    // The map reads these on the server to decide what to fetch, so both pages
    // that draw one have to re-render.
    revalidatePath("/network");
    revalidatePath("/settings/map");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message:
        keys.length === 0
          ? "Saved. The card now shows just the segment ID."
          : `Saved. The card shows ${keys.length} field${keys.length === 1 ? "" : "s"}.`,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not save" };
  }
}
