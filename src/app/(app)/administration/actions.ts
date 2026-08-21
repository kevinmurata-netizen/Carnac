"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { updateUserRole, setUserActive } from "@/server/admin";

/** User administration is Administrator-only, unlike field data entry. */
async function requireAdministrator() {
  const session = await auth();
  if (!session || session.user.roleName !== "Administrator") {
    throw new Error("Only an Administrator can manage users");
  }
  return session;
}

export async function updateUserRoleAction(formData: FormData) {
  const session = await requireAdministrator();
  const userId = String(formData.get("userId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  if (!userId || !roleId) throw new Error("User and role are required");

  if (userId === session.user.id) {
    throw new Error("You cannot change your own role — ask another Administrator.");
  }

  await updateUserRole(session.user.organizationId, userId, roleId);
  revalidatePath("/administration/users");
}

export async function toggleUserActiveAction(formData: FormData) {
  const session = await requireAdministrator();
  const userId = String(formData.get("userId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!userId) throw new Error("User is required");

  if (userId === session.user.id && !isActive) {
    throw new Error("You cannot deactivate your own account.");
  }

  await setUserActive(session.user.organizationId, userId, isActive);
  revalidatePath("/administration/users");
}
