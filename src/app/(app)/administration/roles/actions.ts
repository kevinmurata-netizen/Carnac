"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  ADMINISTRATOR,
  allResourceKeys,
  resetRolePermissions,
  setRolePermissions,
  type PermissionInput,
} from "@/server/permissions";
import type { SettingsActionState } from "@/app/(app)/settings/state";

/**
 * Only an Administrator may change who can do what.
 *
 * Checked here rather than only in the page, because the page hiding a form is
 * not what stops a request — this is.
 */
async function requireAdministrator() {
  const session = await auth();
  if (!session || session.user.roleName !== ADMINISTRATOR) {
    throw new Error("Only an Administrator can change role permissions");
  }
  return session;
}

/** Permissions decide what every screen shows, so revalidate the whole app
 * rather than just this page — a stale sidebar would still list a page the
 * role can no longer open. */
function revalidateEverything() {
  revalidatePath("/", "layout");
}

export async function saveRolePermissionsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    const roleId = String(formData.get("roleId") ?? "");
    if (!roleId) throw new Error("Choose a role first");

    // Every governed resource is submitted, so an unticked box is a real
    // "false" rather than an absent key — a checkbox that is off sends
    // nothing, and reading only what arrived would make un-ticking impossible.
    const inputs: PermissionInput[] = [...allResourceKeys()].map((resource) => ({
      resource,
      read: formData.get(`read:${resource}`) === "on",
      write: formData.get(`write:${resource}`) === "on",
      visible: formData.get(`visible:${resource}`) === "on",
    }));

    await setRolePermissions(session.user.organizationId, roleId, inputs);
    revalidateEverything();
    return { status: "success", message: "Permissions saved." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not save permissions" };
  }
}

export async function resetRolePermissionsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    const roleId = String(formData.get("roleId") ?? "");
    if (!roleId) throw new Error("Choose a role first");

    await resetRolePermissions(session.user.organizationId, roleId);
    revalidateEverything();
    return { status: "success", message: "Back to the defaults: everything readable and visible, nothing writable." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not reset permissions" };
  }
}
