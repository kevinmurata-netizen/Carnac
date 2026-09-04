"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  allResourceKeys,
  createRole,
  deleteRole,
  getSessionPermissions,
  renameRole,
  resetRolePermissions,
  setRolePermissions,
  type PermissionInput,
} from "@/server/permissions";
import type { SettingsActionState } from "@/app/(app)/settings/state";

/**
 * Only someone who can write the Roles card may change who can do what.
 *
 * Checked here rather than only in the page, because the page hiding a form is
 * not what stops a request — this is. It asks the permission system rather
 * than the role's name, so renaming the Administrator role does not quietly
 * open this up.
 */
async function requireRoleAdmin() {
  const session = await auth();
  if (!session) throw new Error("Sign in first");

  const permissions = await getSessionPermissions(session);
  if (!permissions.canWrite("card:/administration/roles")) {
    throw new Error("Your role cannot change role permissions");
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
    const session = await requireRoleAdmin();
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
    const session = await requireRoleAdmin();
    const roleId = String(formData.get("roleId") ?? "");
    if (!roleId) throw new Error("Choose a role first");

    await resetRolePermissions(session.user.organizationId, roleId);
    revalidateEverything();
    return { status: "success", message: "Back to the defaults for this role." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not reset permissions" };
  }
}

export async function createRoleAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  let created: string | null = null;
  try {
    const session = await requireRoleAdmin();
    const copyFrom = String(formData.get("copyFromRoleId") ?? "").trim();

    const role = await createRole(session.user.organizationId, {
      name: String(formData.get("name") ?? ""),
      copyFromRoleId: copyFrom || undefined,
    });
    created = role.id;
    revalidateEverything();
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not create that role" };
  }

  // Outside the try: redirect works by throwing, so catching it here would
  // swallow the navigation and report it as a failure.
  redirect(`/administration/roles?role=${created}`);
}

export async function renameRoleAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    await requireRoleAdmin();
    const roleId = String(formData.get("roleId") ?? "");
    if (!roleId) throw new Error("Choose a role first");

    const role = await renameRole(roleId, String(formData.get("name") ?? ""));
    revalidateEverything();
    return { status: "success", message: `Renamed to ${role.name}.` };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not rename that role" };
  }
}

export async function deleteRoleAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireRoleAdmin();
    const roleId = String(formData.get("roleId") ?? "");
    if (!roleId) throw new Error("Choose a role first");

    await deleteRole(session.user.organizationId, roleId);
    revalidateEverything();
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not delete that role" };
  }

  redirect("/administration/roles");
}
