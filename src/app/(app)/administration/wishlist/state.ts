/** Result of a wishlist action. Lives outside actions.ts because a
 * "use server" module may only export async functions. */
export type WishlistActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const EMPTY_WISHLIST_STATE: WishlistActionState = { status: "idle", message: null };
