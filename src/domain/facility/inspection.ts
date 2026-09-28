/**
 * Inspection forms for the facility asset types.
 *
 * Same shape as the waterline template: every component is scored 0 (severe
 * deficiency) to 10 (no issue observed), with one free-text field at the end,
 * so a form can be combined into a condition index by the same transparent
 * weighted average — and so the inspection screen, which is already driven by
 * template rows rather than hard-coded fields, renders them without knowing
 * what a reservoir is.
 *
 * What is asked differs by type because the failure modes do. A reservoir is
 * inspected for the things that let water out or let contamination in; a well
 * for the column of equipment in the ground and the sanitary seal at the top;
 * a pump station for machinery, power and control. Nothing here is specific to
 * one utility — these are the items any of the three would be walked through.
 */

export type FacilityInspectionField = {
  code: string;
  label: string;
  dataType: "NUMBER" | "TEXT";
  isRequired: boolean;
  sortOrder: number;
  helpText: string;
};

export type FacilityInspectionTemplate = {
  /** The asset type this form belongs to. */
  assetTypeCode: string;
  name: string;
  description: string;
  fields: FacilityInspectionField[];
};

/** The free-text field every form ends with, for what the scores cannot say. */
const OTHER: FacilityInspectionField = {
  code: "OTHER_DEFICIENCIES",
  label: "Other Observed Deficiencies",
  dataType: "TEXT",
  isRequired: false,
  sortOrder: 200,
  helpText: "Free-text notes on anything not captured above",
};

export const FACILITY_INSPECTION_TEMPLATES: FacilityInspectionTemplate[] = [
  {
    assetTypeCode: "RESERVOIR",
    name: "Reservoir Condition Assessment",
    description:
      "Interior and structural inspection of a finished-water reservoir — drained, or by diver or ROV.",
    fields: [
      { code: "STRUCTURAL_CRACKING", label: "Structural Cracking", dataType: "NUMBER", isRequired: true, sortOrder: 10, helpText: "0 = through-cracking or active movement, 10 = no cracking observed" },
      { code: "INTERIOR_COATING", label: "Interior Coating / Lining", dataType: "NUMBER", isRequired: true, sortOrder: 20, helpText: "0 = coating failed, substrate exposed, 10 = coating intact" },
      { code: "CORROSION", label: "Corrosion", dataType: "NUMBER", isRequired: true, sortOrder: 30, helpText: "0 = severe section loss, 10 = no corrosion observed" },
      { code: "ROOF_AND_HATCHES", label: "Roof, Hatches & Access", dataType: "NUMBER", isRequired: true, sortOrder: 40, helpText: "0 = roof unsound or hatches unsecured, 10 = sound and secure" },
      { code: "VENTS_AND_SCREENS", label: "Vents & Screens", dataType: "NUMBER", isRequired: true, sortOrder: 50, helpText: "0 = screens missing or torn — contamination path open, 10 = intact and sealed" },
      { code: "SEDIMENT_ACCUMULATION", label: "Sediment Accumulation", dataType: "NUMBER", isRequired: true, sortOrder: 60, helpText: "0 = heavy accumulation reducing usable volume, 10 = floor clean" },
      { code: "INLET_OUTLET_VALVES", label: "Inlet, Outlet & Valves", dataType: "NUMBER", isRequired: true, sortOrder: 70, helpText: "0 = valves seized or leaking by, 10 = operate freely and seal" },
      { code: "OVERFLOW_AND_DRAIN", label: "Overflow & Drain", dataType: "NUMBER", isRequired: true, sortOrder: 80, helpText: "0 = blocked or discharging incorrectly, 10 = clear and correctly screened" },
      { code: "FOUNDATION_AND_SITE", label: "Foundation & Site Drainage", dataType: "NUMBER", isRequired: true, sortOrder: 90, helpText: "0 = settlement or water standing against the structure, 10 = stable and draining away" },
      { code: "SITE_SECURITY", label: "Site Security", dataType: "NUMBER", isRequired: true, sortOrder: 100, helpText: "0 = unsecured, 10 = fencing, locks and intrusion alarms sound" },
      OTHER,
    ],
  },
  {
    assetTypeCode: "WELL",
    name: "Well Condition Assessment",
    description: "Mechanical, electrical and sanitary inspection of a groundwater production well.",
    fields: [
      { code: "PUMP_AND_MOTOR", label: "Pump & Motor", dataType: "NUMBER", isRequired: true, sortOrder: 10, helpText: "0 = failed or running outside its curve, 10 = performing to specification" },
      { code: "COLUMN_AND_SHAFT", label: "Column & Shaft", dataType: "NUMBER", isRequired: true, sortOrder: 20, helpText: "0 = wear, vibration or misalignment, 10 = true and quiet" },
      { code: "CASING_INTEGRITY", label: "Casing Integrity", dataType: "NUMBER", isRequired: true, sortOrder: 30, helpText: "0 = perforation or collapse suspected, 10 = casing sound on survey" },
      { code: "SANITARY_SEAL", label: "Wellhead Sanitary Seal", dataType: "NUMBER", isRequired: true, sortOrder: 40, helpText: "0 = seal breached — contamination path open, 10 = sealed and vented correctly" },
      { code: "DISCHARGE_PIPING", label: "Discharge Piping & Valves", dataType: "NUMBER", isRequired: true, sortOrder: 50, helpText: "0 = leaking or seized, 10 = tight and operating freely" },
      { code: "ELECTRICAL_AND_CONTROLS", label: "Electrical & Controls", dataType: "NUMBER", isRequired: true, sortOrder: 60, helpText: "0 = faults, overheating or failed starts, 10 = clean, tight and testing correctly" },
      { code: "INSTRUMENTATION", label: "Instrumentation & Metering", dataType: "NUMBER", isRequired: true, sortOrder: 70, helpText: "0 = not reading or uncalibrated, 10 = reading true against a check" },
      { code: "SPECIFIC_CAPACITY", label: "Specific Capacity Trend", dataType: "NUMBER", isRequired: true, sortOrder: 80, helpText: "0 = yield well below the original test — screen fouling or drawdown, 10 = holding its original capacity" },
      { code: "SITE_AND_ENCLOSURE", label: "Site & Enclosure", dataType: "NUMBER", isRequired: true, sortOrder: 90, helpText: "0 = building or enclosure unsound, site not draining, 10 = sound, secure and draining away" },
      OTHER,
    ],
  },
  {
    assetTypeCode: "BOOSTER_PUMP_STATION",
    name: "Booster Pump Station Condition Assessment",
    description: "Mechanical, electrical and structural inspection of a booster pump station.",
    fields: [
      { code: "PUMPS_AND_MOTORS", label: "Pumps & Motors", dataType: "NUMBER", isRequired: true, sortOrder: 10, helpText: "0 = failed or running outside its curve, 10 = performing to specification" },
      { code: "PIPING_AND_VALVES", label: "Piping & Valves", dataType: "NUMBER", isRequired: true, sortOrder: 20, helpText: "0 = leaking, corroded or seized, 10 = tight and operating freely" },
      { code: "ELECTRICAL_AND_CONTROLS", label: "Electrical & Controls", dataType: "NUMBER", isRequired: true, sortOrder: 30, helpText: "0 = faults, overheating or failed starts, 10 = clean, tight and testing correctly" },
      { code: "SURGE_PROTECTION", label: "Surge Protection", dataType: "NUMBER", isRequired: true, sortOrder: 40, helpText: "0 = absent or not charged, 10 = present, charged and proven" },
      { code: "INSTRUMENTATION_SCADA", label: "Instrumentation & SCADA", dataType: "NUMBER", isRequired: true, sortOrder: 50, helpText: "0 = not reporting or reading false, 10 = reporting true to the control room" },
      { code: "STANDBY_POWER", label: "Standby Power", dataType: "NUMBER", isRequired: true, sortOrder: 60, helpText: "0 = none, or fails to start on test, 10 = starts and carries the load on test" },
      { code: "BUILDING_STRUCTURE", label: "Building & Structure", dataType: "NUMBER", isRequired: true, sortOrder: 70, helpText: "0 = roof, walls or floor unsound, 10 = weathertight and sound" },
      { code: "VENTILATION_AND_HEATING", label: "Ventilation & Heating", dataType: "NUMBER", isRequired: true, sortOrder: 80, helpText: "0 = not maintaining a safe temperature for the plant, 10 = working and adequate" },
      { code: "SITE_SECURITY", label: "Site Security", dataType: "NUMBER", isRequired: true, sortOrder: 90, helpText: "0 = unsecured, 10 = fencing, locks and intrusion alarms sound" },
      OTHER,
    ],
  },
];
