import type { TreatmentCategory, TreatmentRole } from "@/domain/waterline/treatment";
import type { EffectConditionMode } from "@/domain/waterline/effect";

/**
 * Starter packs: a whole asset class set up in one go — its asset types,
 * their attributes and measures, condition index, deterioration curves,
 * treatments with what they do and what they cost, failure costs, and what
 * doing neighbouring work together saves.
 *
 * Everything here is configuration a utility could enter by hand under
 * Settings, and remains theirs to change. The figures are industry-typical
 * starting points, not anyone's own: prices and lives vary by region,
 * contractor and design standard, and each is meant to be tuned.
 */

export type PackAttribute = {
  code: string;
  label: string;
  dataType: "TEXT" | "NUMBER" | "ENUM";
  unit?: string;
  options?: string[];
  required?: boolean;
  help?: string;
};

export type PackTreatment = {
  name: string;
  description: string;
  category: TreatmentCategory;
  role?: TreatmentRole;
  unitCost: number;
  costUnit: "per each" | "per LF";
  mobilizationCost: number;
  usefulLife: number;
  retreatmentIntervalYears?: number;
  /** Names of effects in the pack's `effects`. */
  effects: string[];
};

export type PackEffect = {
  name: string;
  description: string;
  conditionMode: EffectConditionMode;
  conditionValue: number | null;
  failureProbMultiplier: number;
  expectedLifeExtension: number;
};

export type PackType = {
  code: string;
  name: string;
  description: string;
  geometry: "point" | "line";
  attributes: PackAttribute[];
  /** Which attribute plays each measure role (see lib/measure-roles.ts). */
  measures: Partial<Record<"material" | "diameter" | "length" | "customersServed" | "criticality", string>>;
  /** Price growing with the size measure: (size / reference) ^ exponent. */
  sizeCostScale?: { reference: number; exponent: number };
  inspection: string;
  index: { name: string; components: Array<{ code: string; label: string; weight: number; help: string }> };
  /** A curve per material, by the value of the material measure. */
  curves: Array<{ material: string; serviceLife: number; shape: number }>;
  effects: PackEffect[];
  treatments: PackTreatment[];
  failureCost: { repairCost: number; perCustomer: number };
  /** Sample files for a demo, in public/samples/<pack id>/, written by
   * `npm run samples:power`: the assets, then their inspections oldest first. */
  samples?: { assets: string; inspections: string[] };
};

export type StarterPack = {
  id: string;
  name: string;
  description: string;
  types: PackType[];
  /** What doing two of the pack's types' work together saves, by type code. */
  corridorSavings: Array<{ a: string; b: string; sharesMobilization: boolean; savingPct: number }>;
};

const CRITICALITY: PackAttribute = {
  code: "CRITICALITY",
  label: "Criticality",
  dataType: "ENUM",
  options: ["Low", "Medium", "High", "Critical"],
  help: "How much it matters if this fails: hospitals, feeder backbones and single points of failure rate higher.",
};
const CUSTOMERS: PackAttribute = {
  code: "CUSTOMERS_SERVED",
  label: "Customers Served",
  dataType: "NUMBER",
  help: "Customers who lose supply if this fails.",
};

export const POWER_DISTRIBUTION: StarterPack = {
  id: "power-distribution",
  name: "Power distribution",
  description:
    "Poles, distribution transformers and overhead conductor, ready to import and model: condition indexes, deterioration by material, the usual treatments with typical prices, and failure costs.",
  types: [
    {
      code: "POLE",
      name: "Pole",
      description: "Distribution and sub-transmission poles.",
      geometry: "point",
      attributes: [
        { code: "MATERIAL", label: "Material", dataType: "ENUM", options: ["Wood", "Steel", "Concrete", "Composite"], required: true },
        { code: "HEIGHT", label: "Height", dataType: "NUMBER", unit: "ft", required: true },
        { code: "POLE_CLASS", label: "Pole Class", dataType: "ENUM", options: ["H2", "H1", "1", "2", "3", "4", "5", "6"] },
        { code: "PRESERVATIVE", label: "Preservative", dataType: "ENUM", options: ["CCA", "Penta", "Creosote", "Copper Naphthenate", "None"] },
        { code: "CIRCUIT", label: "Circuit", dataType: "TEXT", help: "The feeder or circuit it carries." },
        CUSTOMERS,
        CRITICALITY,
      ],
      measures: { material: "MATERIAL", diameter: "HEIGHT", customersServed: "CUSTOMERS_SERVED", criticality: "CRITICALITY" },
      sizeCostScale: { reference: 40, exponent: 1 },
      samples: { assets: "poles.csv", inspections: ["pole-inspections-2016.csv", "pole-inspections-2024.csv"] },
      inspection: "Pole Inspection",
      index: {
        name: "Pole Condition Index (PCI)",
        components: [
          { code: "GROUNDLINE_STRENGTH", label: "Ground-line strength", weight: 0.4, help: "Remaining strength at ground line from sound-and-bore or resistance testing, 1 (failed) to 10 (as new)." },
          { code: "POLE_TOP", label: "Pole top and crossarm", weight: 0.2, help: "Top decay, crossarm rot and splits, 1 to 10." },
          { code: "HARDWARE", label: "Hardware and insulators", weight: 0.15, help: "Insulators, brackets, bolts and grounding, 1 to 10." },
          { code: "LEAN", label: "Lean and guying", weight: 0.15, help: "Lean, guy tension and anchors, 1 to 10." },
          { code: "SURFACE", label: "Surface damage", weight: 0.1, help: "Woodpecker holes, fire, vehicle impact, checking, 1 to 10." },
        ],
      },
      curves: [
        { material: "Wood", serviceLife: 50, shape: 1.6 },
        { material: "Steel", serviceLife: 70, shape: 1.3 },
        { material: "Concrete", serviceLife: 80, shape: 1.2 },
        { material: "Composite", serviceLife: 70, shape: 1.3 },
      ],
      effects: [
        { name: "Pole replaced", description: "A new pole: condition back to new.", conditionMode: "reset", conditionValue: 100, failureProbMultiplier: 0.1, expectedLifeExtension: 0 },
        { name: "Pole reinforced", description: "A steel truss or restoration sleeve at ground line.", conditionMode: "gain", conditionValue: 25, failureProbMultiplier: 0.5, expectedLifeExtension: 15 },
        { name: "Pole top rebuilt", description: "Crossarm, pins and hardware replaced.", conditionMode: "gain", conditionValue: 10, failureProbMultiplier: 0.8, expectedLifeExtension: 5 },
        { name: "Pole remedially treated", description: "Ground-line preservative applied after testing.", conditionMode: "gain", conditionValue: 5, failureProbMultiplier: 0.9, expectedLifeExtension: 10 },
      ],
      treatments: [
        { name: "Pole Replacement", description: "Replace the pole, transferring its attachments.", category: "Renew", role: "replacement", unitCost: 8500, costUnit: "per each", mobilizationCost: 1500, usefulLife: 50, effects: ["Pole replaced"] },
        { name: "Pole Reinforcement", description: "Steel truss or restoration sleeve at ground line, extending life without replacing the pole.", category: "Rehabilitate", unitCost: 2800, costUnit: "per each", mobilizationCost: 800, usefulLife: 15, effects: ["Pole reinforced"] },
        { name: "Crossarm and Pole Top Replacement", description: "Replace crossarms, pins, insulators and top hardware.", category: "Repair", unitCost: 2200, costUnit: "per each", mobilizationCost: 800, usefulLife: 25, effects: ["Pole top rebuilt"] },
        { name: "Ground-line Remedial Treatment", description: "Excavate, apply preservative and wrap at ground line.", category: "Rehabilitate", unitCost: 120, costUnit: "per each", mobilizationCost: 0, usefulLife: 10, retreatmentIntervalYears: 10, effects: ["Pole remedially treated"] },
        { name: "Pole Inspection", description: "Visual inspection with sound-and-bore or resistance testing.", category: "Assess", role: "inspection", unitCost: 60, costUnit: "per each", mobilizationCost: 0, usefulLife: 1, effects: [] },
      ],
      failureCost: { repairCost: 12000, perCustomer: 35 },
    },
    {
      code: "DIST_TRANSFORMER",
      name: "Distribution Transformer",
      description: "Pole-mounted and pad-mounted distribution transformers.",
      geometry: "point",
      attributes: [
        { code: "MOUNTING", label: "Mounting", dataType: "ENUM", options: ["Pole-mounted", "Pad-mounted"], required: true },
        { code: "KVA", label: "Rating", dataType: "NUMBER", unit: "kVA", required: true },
        { code: "PHASE", label: "Phase", dataType: "ENUM", options: ["Single", "Three"] },
        { code: "COOLING", label: "Cooling", dataType: "ENUM", options: ["Mineral oil", "Natural ester", "Dry type"] },
        { code: "CIRCUIT", label: "Circuit", dataType: "TEXT", help: "The feeder or circuit it is on." },
        CUSTOMERS,
        CRITICALITY,
      ],
      measures: { material: "MOUNTING", diameter: "KVA", customersServed: "CUSTOMERS_SERVED", criticality: "CRITICALITY" },
      sizeCostScale: { reference: 50, exponent: 0.6 },
      inspection: "Transformer Inspection",
      index: {
        name: "Transformer Condition Index (TCI)",
        components: [
          { code: "TANK_CORROSION", label: "Tank and corrosion", weight: 0.25, help: "Rust, paint and tank integrity, 1 to 10." },
          { code: "OIL_LEAKS", label: "Oil leaks", weight: 0.25, help: "Weeping or leaking at gaskets, valves and seams, 1 to 10." },
          { code: "BUSHINGS", label: "Bushings and connections", weight: 0.2, help: "Cracked bushings, hot connections, 1 to 10." },
          { code: "LOADING", label: "Loading and heat", weight: 0.15, help: "Overload history and thermal stress, 1 (badly overloaded) to 10." },
          { code: "ENCLOSURE", label: "Pad, enclosure and grounding", weight: 0.15, help: "Pad settlement, locks, enclosure and ground, 1 to 10." },
        ],
      },
      curves: [
        { material: "Pole-mounted", serviceLife: 35, shape: 1.5 },
        { material: "Pad-mounted", serviceLife: 40, shape: 1.4 },
      ],
      effects: [
        { name: "Transformer replaced", description: "A new unit: condition back to new.", conditionMode: "reset", conditionValue: 100, failureProbMultiplier: 0.1, expectedLifeExtension: 0 },
        { name: "Transformer refurbished", description: "Re-gasketed, bushings replaced, tank treated.", conditionMode: "gain", conditionValue: 20, failureProbMultiplier: 0.6, expectedLifeExtension: 10 },
        { name: "Transformer repaired", description: "A leak, connection or bushing fixed.", conditionMode: "gain", conditionValue: 8, failureProbMultiplier: 0.85, expectedLifeExtension: 3 },
      ],
      treatments: [
        { name: "Transformer Replacement", description: "Replace the transformer with a new unit of the same rating.", category: "Renew", role: "replacement", unitCost: 6500, costUnit: "per each", mobilizationCost: 1800, usefulLife: 35, effects: ["Transformer replaced"] },
        { name: "Transformer Refurbishment", description: "Re-gasket, replace bushings, treat and repaint the tank.", category: "Rehabilitate", unitCost: 1800, costUnit: "per each", mobilizationCost: 900, usefulLife: 10, effects: ["Transformer refurbished"] },
        { name: "Transformer Repair", description: "Fix a leak, a connection or a bushing in place.", category: "Repair", unitCost: 700, costUnit: "per each", mobilizationCost: 600, usefulLife: 5, effects: ["Transformer repaired"] },
        { name: "Transformer Inspection", description: "Visual and infrared inspection, with an oil sample where fitted.", category: "Assess", role: "inspection", unitCost: 90, costUnit: "per each", mobilizationCost: 0, usefulLife: 1, effects: [] },
      ],
      failureCost: { repairCost: 9000, perCustomer: 35 },
      samples: { assets: "transformers.csv", inspections: ["transformer-inspections.csv"] },
    },
    {
      code: "OH_CONDUCTOR",
      name: "Overhead Conductor",
      description: "Overhead primary conductor, one segment per span or section.",
      geometry: "line",
      attributes: [
        { code: "CONDUCTOR_TYPE", label: "Conductor Type", dataType: "ENUM", options: ["ACSR", "AAC", "AAAC", "Copper"], required: true },
        { code: "LENGTH", label: "Length", dataType: "NUMBER", unit: "ft", required: true },
        { code: "CONDUCTOR_SIZE", label: "Conductor Size", dataType: "TEXT", help: "As labelled, e.g. 1/0 or 336.4 kcmil." },
        { code: "PHASES", label: "Phases", dataType: "ENUM", options: ["1", "2", "3"] },
        { code: "VOLTAGE", label: "Voltage", dataType: "NUMBER", unit: "kV" },
        { code: "CIRCUIT", label: "Circuit", dataType: "TEXT", help: "The feeder or circuit it belongs to." },
        CUSTOMERS,
        CRITICALITY,
      ],
      measures: { material: "CONDUCTOR_TYPE", length: "LENGTH", customersServed: "CUSTOMERS_SERVED", criticality: "CRITICALITY" },
      inspection: "Line Patrol",
      index: {
        name: "Conductor Condition Index (CCI)",
        components: [
          { code: "STRANDING", label: "Broken strands and annealing", weight: 0.3, help: "Broken or birdcaged strands, signs of overheating, 1 to 10." },
          { code: "SPLICES", label: "Splices and connectors", weight: 0.25, help: "Number and condition of splices, hot connectors, 1 to 10." },
          { code: "CLEARANCE", label: "Sag and clearance", weight: 0.2, help: "Sag, clearance to ground and other circuits, 1 to 10." },
          { code: "CORROSION", label: "Corrosion", weight: 0.15, help: "Steel core and aluminium corrosion, 1 to 10." },
          { code: "VEGETATION", label: "Vegetation contact", weight: 0.1, help: "Contact or encroachment, 1 (in contact) to 10 (clear)." },
        ],
      },
      curves: [
        { material: "ACSR", serviceLife: 55, shape: 1.5 },
        { material: "AAC", serviceLife: 50, shape: 1.5 },
        { material: "AAAC", serviceLife: 60, shape: 1.4 },
        { material: "Copper", serviceLife: 70, shape: 1.3 },
      ],
      effects: [
        { name: "Conductor replaced", description: "New conductor strung: condition back to new.", conditionMode: "reset", conditionValue: 100, failureProbMultiplier: 0.1, expectedLifeExtension: 0 },
        { name: "Conductor splices repaired", description: "Failing splices and connectors replaced.", conditionMode: "gain", conditionValue: 10, failureProbMultiplier: 0.7, expectedLifeExtension: 5 },
      ],
      treatments: [
        { name: "Reconductoring", description: "Replace the conductor over the segment.", category: "Renew", role: "replacement", unitCost: 55, costUnit: "per LF", mobilizationCost: 15000, usefulLife: 55, effects: ["Conductor replaced"] },
        { name: "Splice and Connector Repair", description: "Replace failing splices and connectors on the segment.", category: "Repair", unitCost: 1800, costUnit: "per each", mobilizationCost: 1200, usefulLife: 10, effects: ["Conductor splices repaired"] },
        { name: "Line Patrol", description: "Ground or drone patrol with infrared survey.", category: "Assess", role: "inspection", unitCost: 0.4, costUnit: "per LF", mobilizationCost: 0, usefulLife: 1, effects: [] },
      ],
      failureCost: { repairCost: 15000, perCustomer: 35 },
      samples: { assets: "overhead-conductor.csv", inspections: ["line-patrols.csv"] },
    },
  ],
  corridorSavings: [
    { a: "POLE", b: "POLE", sharesMobilization: true, savingPct: 0.1 },
    { a: "POLE", b: "OH_CONDUCTOR", sharesMobilization: true, savingPct: 0.15 },
    { a: "POLE", b: "DIST_TRANSFORMER", sharesMobilization: true, savingPct: 0.1 },
    { a: "OH_CONDUCTOR", b: "OH_CONDUCTOR", sharesMobilization: true, savingPct: 0.1 },
    { a: "OH_CONDUCTOR", b: "DIST_TRANSFORMER", sharesMobilization: true, savingPct: 0.05 },
    { a: "DIST_TRANSFORMER", b: "DIST_TRANSFORMER", sharesMobilization: false, savingPct: 0.05 },
  ],
};

export const STARTER_PACKS: StarterPack[] = [POWER_DISTRIBUTION];

export type SampleFile = { name: string; url: string };

/**
 * A pack type's sample files for one kind of import, matched by the asset
 * type's code: made-up data for trying the app out, loaded through Data
 * Import like anyone's real data. Empty for a type no pack has samples for.
 */
export function sampleFiles(typeCode: string, kind: "assets" | "inspections"): SampleFile[] {
  for (const pack of STARTER_PACKS) {
    const samples = pack.types.find((t) => t.code === typeCode)?.samples;
    if (!samples) continue;
    const names = kind === "assets" ? [samples.assets] : samples.inspections;
    return names.map((name) => ({ name, url: `/samples/${pack.id}/${name}` }));
  }
  return [];
}
