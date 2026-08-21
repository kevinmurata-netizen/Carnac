export type TreatmentActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const EMPTY_TREATMENT_STATE: TreatmentActionState = { status: "idle", message: null };
