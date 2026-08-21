/**
 * Shared between the server actions and the client form. Kept out of
 * actions.ts because a "use server" module may only export async functions.
 */
export type IndexActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  /** Set when stored scores no longer match the configured weights. */
  staleScores?: boolean;
};

export const EMPTY_INDEX_STATE: IndexActionState = {
  status: "idle",
  message: null,
};
