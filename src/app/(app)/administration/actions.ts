"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { updateUserRole, setUserActive, createUser, resetUserPassword } from "@/server/admin";
import type { UserActionState } from "./users/state";

/** User administration is Administrator-only, unlike field data entry. */
async function requireWriteAccess() {
  return requireCardWrite("/administration/users", "Only an Administrator can manage users");
}

export async function updateUserRoleAction(formData: FormData) {
  const session = await requireWriteAccess();
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
  const session = await requireWriteAccess();
  const userId = String(formData.get("userId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!userId) throw new Error("User is required");

  if (userId === session.user.id && !isActive) {
    throw new Error("You cannot deactivate your own account.");
  }

  await setUserActive(session.user.organizationId, userId, isActive);
  revalidatePath("/administration/users");
}

function failUser(e: unknown): UserActionState {
  return {
    status: "error",
    message: e instanceof Error ? e.message : "Something went wrong",
    credential: null,
  };
}

export async function createUserAction(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  try {
    const session = await requireWriteAccess();
    const created = await createUser(session.user.organizationId, {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      roleId: String(formData.get("roleId") ?? ""),
      password: String(formData.get("password") ?? "") || undefined,
    });

    revalidatePath("/administration/users");
    revalidatePath("/administration");
    return {
      status: "success",
      message: `${created.name} can now sign in as ${created.roleName}.`,
      credential: { email: created.email, password: created.password },
    };
  } catch (e) {
    return failUser(e);
  }
}

export async function resetPasswordAction(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  try {
    const session = await requireWriteAccess();
    const reset = await resetUserPassword(
      session.user.organizationId,
      String(formData.get("userId") ?? ""),
      String(formData.get("password") ?? "") || undefined
    );

    revalidatePath("/administration/users");
    return {
      status: "success",
      // A JWT session already issued stays valid until it expires or the user
      // signs out, so a reset does not by itself kick anyone off.
      message: `Password reset. ${reset.email} stays signed in on any existing session until they sign out.`,
      credential: { email: reset.email, password: reset.password },
    };
  } catch (e) {
    return failUser(e);
  }
}
