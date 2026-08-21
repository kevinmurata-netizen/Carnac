// Canonical attribute codes for the WATERLINE asset type. Shared between the
// seed script and the query/domain layer so both sides agree on shape without
// hard-coding waterline fields anywhere in the generic Asset schema itself.

export const WATERLINE_ATTRIBUTES = {
  FACILITY_ID: "FACILITY_ID",
  MATERIAL: "MATERIAL",
  DIAMETER: "DIAMETER",
  LENGTH: "LENGTH",
  PRESSURE_CLASS: "PRESSURE_CLASS",
  PIPE_CLASS: "PIPE_CLASS",
  MANUFACTURER: "MANUFACTURER",
  JOINT_TYPE: "JOINT_TYPE",
  LINING_TYPE: "LINING_TYPE",
  INSTALLATION_METHOD: "INSTALLATION_METHOD",
  NORMAL_OPERATING_PRESSURE: "NORMAL_OPERATING_PRESSURE",
  CRITICALITY: "CRITICALITY",
  CUSTOMERS_SERVED: "CUSTOMERS_SERVED",
  CUSTOMER_TYPE: "CUSTOMER_TYPE",
  OWNER: "OWNER",
} as const;

export type WaterlineAttributeCode =
  (typeof WATERLINE_ATTRIBUTES)[keyof typeof WATERLINE_ATTRIBUTES];

export const MATERIAL_OPTIONS = [
  "Cast Iron",
  "Ductile Iron",
  "PVC",
  "HDPE",
  "Asbestos Cement",
  "Steel",
  "Copper",
] as const;

export const JOINT_TYPE_OPTIONS = [
  "Bell & Spigot",
  "Mechanical",
  "Push-On",
  "Welded",
  "Threaded",
] as const;

export const LINING_TYPE_OPTIONS = ["Cement Mortar", "Epoxy", "Polyethylene", "None"] as const;

export const INSTALLATION_METHOD_OPTIONS = ["Open Cut", "Trenchless", "Directional Bore"] as const;

export const CRITICALITY_OPTIONS = ["Low", "Moderate", "High", "Critical"] as const;

export const CUSTOMER_TYPE_OPTIONS = [
  "Residential",
  "Commercial",
  "Industrial",
  "Institutional",
  "Mixed",
] as const;

export const WATERLINE_ATTRIBUTE_DEFINITIONS: Array<{
  code: WaterlineAttributeCode;
  label: string;
  dataType: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "ENUM";
  unit?: string;
  isRequired?: boolean;
  sortOrder: number;
  options?: readonly string[];
}> = [
  { code: "FACILITY_ID", label: "Facility / Network ID", dataType: "TEXT", sortOrder: 10 },
  {
    code: "MATERIAL",
    label: "Material",
    dataType: "ENUM",
    isRequired: true,
    sortOrder: 20,
    options: MATERIAL_OPTIONS,
  },
  { code: "DIAMETER", label: "Diameter", dataType: "NUMBER", unit: "in", isRequired: true, sortOrder: 30 },
  { code: "LENGTH", label: "Length", dataType: "NUMBER", unit: "ft", isRequired: true, sortOrder: 40 },
  { code: "PRESSURE_CLASS", label: "Pressure Class", dataType: "TEXT", sortOrder: 50 },
  { code: "PIPE_CLASS", label: "Pipe Class", dataType: "TEXT", sortOrder: 60 },
  { code: "MANUFACTURER", label: "Manufacturer", dataType: "TEXT", sortOrder: 70 },
  {
    code: "JOINT_TYPE",
    label: "Joint Type",
    dataType: "ENUM",
    sortOrder: 80,
    options: JOINT_TYPE_OPTIONS,
  },
  {
    code: "LINING_TYPE",
    label: "Lining Type",
    dataType: "ENUM",
    sortOrder: 90,
    options: LINING_TYPE_OPTIONS,
  },
  {
    code: "INSTALLATION_METHOD",
    label: "Installation Method",
    dataType: "ENUM",
    sortOrder: 100,
    options: INSTALLATION_METHOD_OPTIONS,
  },
  {
    code: "NORMAL_OPERATING_PRESSURE",
    label: "Normal Operating Pressure",
    dataType: "NUMBER",
    unit: "psi",
    sortOrder: 110,
  },
  {
    code: "CRITICALITY",
    label: "Criticality",
    dataType: "ENUM",
    sortOrder: 120,
    options: CRITICALITY_OPTIONS,
  },
  { code: "CUSTOMERS_SERVED", label: "Customers Served", dataType: "NUMBER", sortOrder: 130 },
  {
    code: "CUSTOMER_TYPE",
    label: "Customer Type",
    dataType: "ENUM",
    sortOrder: 140,
    options: CUSTOMER_TYPE_OPTIONS,
  },
  { code: "OWNER", label: "Owner", dataType: "TEXT", sortOrder: 150 },
];
