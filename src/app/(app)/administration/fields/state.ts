export type FieldActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const EMPTY_FIELD_STATE: FieldActionState = { status: "idle", message: null };
