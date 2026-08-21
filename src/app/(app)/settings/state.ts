/** Shared result shape for the settings form actions. Lives outside actions.ts
 * because a "use server" module may only export async functions. */
export type SettingsActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const EMPTY_SETTINGS_STATE: SettingsActionState = { status: "idle", message: null };
