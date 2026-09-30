"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AssetStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { createAsset } from "@/server/assets";
import { parseDateInput } from "@/lib/format";

export type NewAssetState = { status: "idle" | "error"; message?: string };

function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

function number(formData: FormData, key: string, label: string): number | null {
  const value = text(formData, key);
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label}: "${value}" is not a number`);
  return n;
}

export async function createAssetAction(_prev: NewAssetState, formData: FormData): Promise<NewAssetState> {
  let id: string;
  let typeCode: string;
  try {
    const session = await auth();
    if (!session) throw new Error("Sign in first");
    if (!canRecordFieldData(session)) throw new Error("Your role cannot add assets");

    const attributes: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("attr:")) attributes[key.slice(5)] = String(value ?? "");
    }

    const installed = text(formData, "installationDate");
    const installationDate = installed ? parseDateInput(installed) : null;
    if (installed && !installationDate) throw new Error(`"${installed}" is not a valid date`);

    // A position is both numbers or neither: half a coordinate places nothing.
    const lat = number(formData, "lat", "Latitude");
    const lng = number(formData, "lng", "Longitude");
    if ((lat == null) !== (lng == null)) throw new Error("Give both latitude and longitude, or neither");

    const statusRaw = String(formData.get("status") ?? "ACTIVE");
    typeCode = String(formData.get("typeCode") ?? "");

    const created = await createAsset(
      session.user.organizationId,
      {
        typeCode,
        assetCode: String(formData.get("assetCode") ?? ""),
        name: text(formData, "name"),
        status: statusRaw in AssetStatus ? (statusRaw as AssetStatus) : AssetStatus.ACTIVE,
        ownerDepartment: text(formData, "ownerDepartment"),
        installationDate,
        expectedUsefulLife: number(formData, "expectedUsefulLife", "Expected useful life"),
        attributes,
        location:
          lat != null && lng != null
            ? { lat, lng, serviceArea: text(formData, "serviceArea"), pressureZone: text(formData, "pressureZone") }
            : null,
        componentTypeIds: formData.getAll("componentTypeId").map(String),
      },
      session.user.name ?? session.user.email ?? null
    );
    id = created.id;
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  }

  revalidatePath("/assets");
  revalidatePath("/network");
  // Outside the try: redirect works by throwing, which the catch would eat.
  redirect(`/assets/${id}`);
}
