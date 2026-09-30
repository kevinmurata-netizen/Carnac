/**
 * What is recorded about each kind of component when a site is inspected.
 *
 * Every form carries a condition rating, 0-10 like the rest of the app's
 * inspection scores: it is the inspector's judgement, and the one thing that
 * becomes the component's condition score (×10). The readings beside it are
 * what that judgement rests on — a coating's film thickness, a motor's
 * insulation resistance — recorded as measured and kept with the visit, so a
 * rating can be checked against the evidence and a trend can be seen.
 *
 * Readings are not turned into a score automatically. What a given DFT or
 * potential means depends on the system's specification, which the app does
 * not hold; a rule that pretended otherwise would be wrong in ways nobody
 * could see.
 *
 * A component type with no form here — one added under Settings — gets the
 * condition rating alone.
 */

export type ComponentReadingType = "NUMBER" | "TEXT" | "ENUM" | "BOOLEAN" | "DATE";

export type ComponentReadingSpec = {
  code: string;
  label: string;
  dataType: ComponentReadingType;
  unit?: string;
  help?: string;
  options?: string[];
  isRequired?: boolean;
  min?: number;
  max?: number;
};

export const CONDITION_READING: ComponentReadingSpec = {
  code: "CONDITION",
  label: "Condition",
  dataType: "NUMBER",
  isRequired: true,
  min: 0,
  max: 10,
  help: "0 failed · 3 poor · 5 fair · 7 good · 10 as new",
};

export type ComponentInspectionSpec = { name: string; description: string; readings: ComponentReadingSpec[] };

const SEVERITY = ["None", "Light", "Moderate", "Heavy"];

/** By component type code. */
export const COMPONENT_INSPECTION_FORMS: Record<string, ComponentInspectionSpec> = {
  TANK_SHELL: {
    name: "Tank Shell Inspection",
    description: "Walls, welds or joints, and signs of leakage.",
    readings: [
      { code: "MIN_WALL_THICKNESS", label: "Minimum wall thickness", dataType: "NUMBER", unit: "in", help: "Thinnest ultrasonic reading" },
      { code: "MAX_PIT_DEPTH", label: "Deepest pit", dataType: "NUMBER", unit: "mils" },
      { code: "CRACKING", label: "Cracking at welds or joints", dataType: "ENUM", options: SEVERITY },
      { code: "LEAKAGE", label: "Leakage", dataType: "ENUM", options: ["None", "Weeping", "Active"] },
    ],
  },
  ROOF: {
    name: "Roof Inspection",
    description: "Roof structure, hatches, vents and screens — the sanitary seal.",
    readings: [
      { code: "COATING_FAILED_PCT", label: "Roof coating failed", dataType: "NUMBER", unit: "%", min: 0, max: 100 },
      { code: "HATCHES_SECURE", label: "Hatches closed and locked", dataType: "BOOLEAN" },
      { code: "VENT_SCREENS_INTACT", label: "Vent screens intact", dataType: "BOOLEAN" },
      { code: "DEFLECTION", label: "Structural deflection", dataType: "ENUM", options: SEVERITY },
    ],
  },
  FLOOR: {
    name: "Floor Inspection",
    description: "Floor slab or bottom plate, usually seen by diver or ROV.",
    readings: [
      { code: "SEDIMENT_DEPTH", label: "Sediment depth", dataType: "NUMBER", unit: "in" },
      { code: "MAX_PIT_DEPTH", label: "Deepest pit", dataType: "NUMBER", unit: "mils" },
      { code: "SETTLEMENT", label: "Settlement or cracking", dataType: "ENUM", options: SEVERITY },
    ],
  },
  COATING_SYSTEM: {
    name: "Coating Inspection",
    description: "Interior and exterior coating survey.",
    readings: [
      { code: "DFT_AVG", label: "Dry film thickness, average", dataType: "NUMBER", unit: "mils" },
      { code: "AREA_FAILED_PCT", label: "Area failed", dataType: "NUMBER", unit: "%", min: 0, max: 100 },
      {
        code: "ADHESION",
        label: "Adhesion (ASTM D3359)",
        dataType: "ENUM",
        options: ["5B", "4B", "3B", "2B", "1B", "0B"],
        help: "5B no removal · 0B more than 65% removed",
      },
      { code: "HOLIDAYS", label: "Holidays found", dataType: "NUMBER", help: "Pinholes or voids from a holiday test" },
    ],
  },
  CATHODIC_PROTECTION: {
    name: "Cathodic Protection Survey",
    description: "Protection levels and the system delivering them.",
    readings: [
      {
        code: "POTENTIAL_MV",
        label: "Structure-to-water potential",
        dataType: "NUMBER",
        unit: "mV CSE",
        help: "Instant-off; −850 mV or more negative is the usual criterion",
      },
      { code: "RECTIFIER_OUTPUT_A", label: "Rectifier output", dataType: "NUMBER", unit: "A" },
      { code: "ANODES_REMAINING_PCT", label: "Anode material remaining", dataType: "NUMBER", unit: "%", min: 0, max: 100 },
    ],
  },
  WELL_CASING: {
    name: "Well Casing Inspection",
    description: "Casing and grout seal, usually from a video log.",
    readings: [
      { code: "VIDEO_FINDINGS", label: "Video log findings", dataType: "ENUM", options: ["No defects", "Minor", "Major", "Not logged"] },
      { code: "GROUT_SEAL_INTACT", label: "Grout seal intact", dataType: "BOOLEAN" },
      { code: "STATIC_LEVEL_FT", label: "Static water level", dataType: "NUMBER", unit: "ft bgs" },
    ],
  },
  PUMP: {
    name: "Pump Test",
    description: "Performance against the pump's curve.",
    readings: [
      { code: "FLOW_GPM", label: "Flow", dataType: "NUMBER", unit: "gpm" },
      { code: "DISCHARGE_PSI", label: "Discharge pressure", dataType: "NUMBER", unit: "psi" },
      { code: "VIBRATION_IPS", label: "Vibration", dataType: "NUMBER", unit: "in/s", help: "Peak velocity at the bearing housing" },
      { code: "EFFICIENCY_PCT", label: "Wire-to-water efficiency", dataType: "NUMBER", unit: "%", min: 0, max: 100 },
    ],
  },
  MOTOR: {
    name: "Motor Test",
    description: "Electrical and thermal condition of the motor.",
    readings: [
      { code: "CURRENT_A", label: "Running current", dataType: "NUMBER", unit: "A" },
      { code: "INSULATION_MOHM", label: "Insulation resistance", dataType: "NUMBER", unit: "MΩ", help: "Megger, one minute" },
      { code: "TEMPERATURE_F", label: "Winding temperature", dataType: "NUMBER", unit: "°F" },
      { code: "VIBRATION_IPS", label: "Vibration", dataType: "NUMBER", unit: "in/s" },
    ],
  },
  WELL_SCREEN: {
    name: "Well Screen Inspection",
    description: "Where fouling and sand show first.",
    readings: [
      { code: "SPECIFIC_CAPACITY", label: "Specific capacity", dataType: "NUMBER", unit: "gpm/ft", help: "Falls as the screen fouls" },
      { code: "ENCRUSTATION", label: "Encrustation", dataType: "ENUM", options: SEVERITY },
      { code: "SAND_PPM", label: "Sand production", dataType: "NUMBER", unit: "ppm" },
    ],
  },
  PIPING: {
    name: "Station Piping Inspection",
    description: "Headers, piping and valves inside the station.",
    readings: [
      { code: "LEAKS", label: "Leaks", dataType: "ENUM", options: ["None", "Weeping", "Active"] },
      { code: "EXTERNAL_CORROSION", label: "External corrosion", dataType: "ENUM", options: SEVERITY },
      { code: "VALVES_EXERCISED", label: "Valves exercised and operable", dataType: "BOOLEAN" },
    ],
  },
  CONTROLS: {
    name: "Controls Inspection",
    description: "Electrical gear, instruments, SCADA and backup power.",
    readings: [
      { code: "ALARMS_TESTED", label: "Alarms tested and reporting", dataType: "BOOLEAN" },
      { code: "CALIBRATION_CURRENT", label: "Instrument calibration current", dataType: "BOOLEAN" },
      { code: "BACKUP_POWER_TESTED", label: "Backup power tested", dataType: "BOOLEAN" },
    ],
  },
};

/** The form for a component type: its own, or the condition rating alone. */
export function componentInspectionSpec(code: string, name: string): ComponentInspectionSpec {
  const spec = COMPONENT_INSPECTION_FORMS[code];
  return {
    name: spec?.name ?? `${name} Inspection`,
    description: spec?.description ?? `Condition of the ${name.toLowerCase()}.`,
    readings: [CONDITION_READING, ...(spec?.readings ?? [])],
  };
}

/** A 0-10 rating as a 0-100 condition score. */
export function conditionFromRating(rating: number): number {
  return Math.max(0, Math.min(100, Math.round(rating * 10)));
}

/** Probability of failure, 1-5, from a 0-100 condition. */
export function probabilityFromCondition(condition: number): number {
  if (condition >= 85) return 1;
  if (condition >= 70) return 2;
  if (condition >= 50) return 3;
  if (condition >= 30) return 4;
  return 5;
}
