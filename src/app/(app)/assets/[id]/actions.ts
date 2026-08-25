"use server";

import { revalidatePath } from "next/cache";
import { AssetStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { updateAsset } from "@/server/assets";
import { parseDateInput } from "@/lib/format";

export type EditState = { status: "idle" | "success" | "error"; message?: string };

/** "" means the field was shown and deliberately cleared; a missing key means
 * the form never showed it, which must not overwrite anything. */
function text(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function number(formData: FormData, key: string): number | null | undefined {
  const value = text(formData, key);
  if (value === undefined || value === null) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`"${value}" is not a number`);
  return n;
}

function date(formData: FormData, key: string): Date | null | undefined {
  const value = text(formData, key);
  if (value === undefined || value === null) return value;
  const d = parseDateInput(value);
  if (!d) throw new Error(`"${value}" is not a valid date`);
  return d;
}

export async function saveAssetAction(_prev: EditState, formData: FormData): Promise<EditState> {
  try {
    const session = await auth();
    if (!session) throw new Error("Sign in to edit this segment");
    if (!canRecordFieldData(session)) throw new Error("Your role cannot edit segment records");

    const id = String(formData.get("assetId") ?? "");
    if (!id) throw new Error("Missing segment id");

    // Attributes arrive as attr:CODE so they stay separate from the asset's
    // own columns without the form needing a second nested structure.
    const attributes: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("attr:")) attributes[key.slice(5)] = String(value ?? "");
    }

    const statusRaw = formData.get("status");
    const status =
      typeof statusRaw === "string" && statusRaw in AssetStatus ? (statusRaw as AssetStatus) : undefined;

    await updateAsset(
      session.user.organizationId,
      id,
      {
        status,
        ownerDepartment: text(formData, "ownerDepartment"),
        installationDate: date(formData, "installationDate"),
        expectedUsefulLife: number(formData, "expectedUsefulLife"),
        attributes,
        location: {
          serviceArea: text(formData, "serviceArea"),
          pressureZone: text(formData, "pressureZone"),
          depth: number(formData, "depth"),
        },
      },
      session.user.name ?? session.user.email ?? null
    );

    revalidatePath(`/assets/${id}`);
    revalidatePath("/assets");
    return { status: "success", message: "Changes saved." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  }
}
