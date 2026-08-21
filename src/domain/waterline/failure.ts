export const WATERLINE_FAILURE_TYPES: Array<{ code: string; label: string }> = [
  { code: "BREAK", label: "Break" },
  { code: "LEAK", label: "Leak" },
  { code: "CORROSION", label: "Corrosion" },
  { code: "TUBERCULATION", label: "Tuberculation" },
  { code: "JOINT_FAILURE", label: "Joint Failure" },
  { code: "STRUCTURAL_DETERIORATION", label: "Structural Deterioration" },
  { code: "EXTERNAL_LOADING", label: "External Loading" },
  { code: "GROUND_MOVEMENT", label: "Ground Movement" },
  { code: "PRESSURE_RELATED", label: "Pressure-Related Failure" },
  { code: "MATERIAL_RELATED", label: "Material-Related Failure" },
];

export const FAILURE_SEVERITIES = ["Minor", "Moderate", "Major", "Critical"] as const;
