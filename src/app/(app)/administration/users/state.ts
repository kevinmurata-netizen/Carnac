/** Result of a user-management action. Lives outside actions.ts because a
 * "use server" module may only export async functions. */
export type UserActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  /**
   * Shown once, immediately after creating a user or resetting a password.
   * Never read back from the database — stored passwords are bcrypt hashes.
   */
  credential: { email: string; password: string } | null;
};

export const EMPTY_USER_STATE: UserActionState = { status: "idle", message: null, credential: null };
