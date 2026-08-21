// Configurable inspection template for the WATERLINE asset type. This is the
// seed/default template — administrators will eventually be able to edit this
// through the Administration screens (Phase 8) without touching application
// code, since the form is already driven entirely by InspectionTemplateField
// rows rather than hard-coded fields.

export const INSPECTION_TYPES = ["Routine", "Condition Assessment", "Post-Failure", "Follow-Up"] as const;

// Every component field is scored 0 (severe deficiency) – 10 (no issue found)
// so they can be combined into the Waterline Condition Index using a single,
// transparent weighted-average formula (see condition.ts).
export const WATERLINE_INSPECTION_FIELDS: Array<{
  code: string;
  label: string;
  dataType: "NUMBER" | "TEXT";
  isRequired: boolean;
  sortOrder: number;
  helpText: string;
}> = [
  { code: "STRUCTURAL_DAMAGE", label: "Structural Damage", dataType: "NUMBER", isRequired: true, sortOrder: 10, helpText: "0 = severe structural damage, 10 = no damage observed" },
  { code: "CORROSION", label: "Corrosion", dataType: "NUMBER", isRequired: true, sortOrder: 20, helpText: "0 = severe corrosion, 10 = no corrosion observed" },
  { code: "LEAKAGE", label: "Leakage", dataType: "NUMBER", isRequired: true, sortOrder: 30, helpText: "0 = active leak, 10 = no leakage observed" },
  { code: "JOINT_DETERIORATION", label: "Joint Deterioration", dataType: "NUMBER", isRequired: true, sortOrder: 40, helpText: "0 = joint failure, 10 = joints sound" },
  { code: "INTERNAL_CONDITION", label: "Internal Condition", dataType: "NUMBER", isRequired: true, sortOrder: 50, helpText: "0 = severe tuberculation/obstruction, 10 = clean bore" },
  { code: "EXTERNAL_DAMAGE", label: "External Damage", dataType: "NUMBER", isRequired: true, sortOrder: 60, helpText: "0 = severe external damage, 10 = no external damage" },
  { code: "COATING_CONDITION", label: "Coating Condition", dataType: "NUMBER", isRequired: true, sortOrder: 70, helpText: "0 = coating failed, 10 = coating intact" },
  { code: "SEDIMENT_DEPOSITION", label: "Sediment / Deposition", dataType: "NUMBER", isRequired: true, sortOrder: 80, helpText: "0 = heavy sediment buildup, 10 = none observed" },
  { code: "PRESSURE_ISSUES", label: "Pressure Issues", dataType: "NUMBER", isRequired: true, sortOrder: 90, helpText: "0 = significant pressure irregularity, 10 = normal pressure" },
  { code: "GROUND_MOVEMENT", label: "Ground Movement", dataType: "NUMBER", isRequired: true, sortOrder: 100, helpText: "0 = significant settlement/movement, 10 = no movement observed" },
  { code: "CATHODIC_PROTECTION", label: "Cathodic Protection Condition", dataType: "NUMBER", isRequired: true, sortOrder: 110, helpText: "0 = protection failed/absent, 10 = fully functional" },
  { code: "OTHER_DEFICIENCIES", label: "Other Observed Deficiencies", dataType: "TEXT", isRequired: false, sortOrder: 120, helpText: "Free-text notes on anything not captured above" },
];

export const WATERLINE_TEMPLATE_NAME = "Waterline Condition Assessment";
