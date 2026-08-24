"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  createWishlistItem,
  updateWishlistItem,
  setWishlistDone,
  deleteWishlistItem,
  parsePriority,
} from "@/server/wishlist";
import type { WishlistActionState } from "./state";

/** Any signed-in user, deliberately — see the note in server/wishlist.ts. */
async function requireUser() {
  const session = await auth();
  if (!session) throw new Error("Sign in to change the wishlist");
  return session;
}

function fail(e: unknown): WishlistActionState {
  return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
}

function refresh() {
  revalidatePath("/administration/wishlist");
  revalidatePath("/administration");
}

export async function addWishlistItemAction(
  _prev: WishlistActionState,
  formData: FormData
): Promise<WishlistActionState> {
  try {
    const session = await requireUser();
    await createWishlistItem(session.user.organizationId, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      priority: parsePriority(formData.get("priority")),
      createdByName: session.user.name ?? session.user.email ?? null,
    });
    refresh();
    return { status: "success", message: "Added." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveWishlistItemAction(
  _prev: WishlistActionState,
  formData: FormData
): Promise<WishlistActionState> {
  try {
    const session = await requireUser();
    await updateWishlistItem(session.user.organizationId, String(formData.get("id") ?? ""), {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      priority: parsePriority(formData.get("priority")),
    });
    refresh();
    return { status: "success", message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

/** Takes arguments rather than a form: the checkbox is a plain control, and a
 * nested form inside the row's edit form would be invalid HTML. */
export async function toggleWishlistDoneAction(id: string, isDone: boolean) {
  const session = await requireUser();
  await setWishlistDone(session.user.organizationId, id, isDone);
  refresh();
}

export async function removeWishlistItemAction(id: string) {
  const session = await requireUser();
  await deleteWishlistItem(session.user.organizationId, id);
  refresh();
}
