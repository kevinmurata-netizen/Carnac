import { prisma } from "@/lib/prisma";
import { CONSIDER_ALL, type OptionSelection } from "@/domain/waterline/option-selection";

/**
 * Which treatments and combinations each scenario may consider.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.6.
 */

export type OptionChoice = {
  /** The stable key the form posts back. Treatments go by name because that is
   * what a built option carries; combinations go by id because their names are
   * editable and a rename must not silently change what a scenario runs. */
  key: string;
  id: string;
  name: string;
  description: string | null;
  /** Category for a treatment; the member list for a combination. */
  detail: string;
  enabled: boolean;
};

export type ScenarioOptionCatalogue = {
  limitsOptions: boolean;
  treatments: OptionChoice[];
  combinations: OptionChoice[];
  /** Treatment names this scenario has selected. */
  selectedTreatments: string[];
  /** Combination ids this scenario has selected. */
  selectedCombinations: string[];
};

type Applicability = { category?: string };

/**
 * Everything a scenario could consider, and what it currently does.
 *
 * `scenarioId` is optional so the create page can show the same list before a
 * scenario exists. With none, nothing is selected and the limit is off, which
 * is the state a new scenario starts in.
 */
export async function getScenarioOptionCatalogue(
  organizationId: string,
  scenarioId?: string
): Promise<ScenarioOptionCatalogue> {
  const [treatments, combinations, scenario] = await Promise.all([
    prisma.treatment.findMany({
      where: { assetType: { code: "WATERLINE", organizationId } },
      select: { id: true, name: true, description: true, applicability: true },
      orderBy: { name: "asc" },
    }),
    prisma.treatmentCombination.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        enabled: true,
        members: { select: { treatment: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    scenarioId
      ? prisma.scenario.findFirst({
          where: { id: scenarioId, organizationId },
          select: {
            limitsOptions: true,
            treatmentOptions: { select: { treatment: { select: { name: true } } } },
            combinationOptions: { select: { combinationId: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    limitsOptions: scenario?.limitsOptions ?? false,
    treatments: treatments.map((t) => ({
      key: t.name,
      id: t.id,
      name: t.name,
      description: t.description,
      detail: ((t.applicability ?? {}) as Applicability).category ?? "Repair",
      enabled: true,
    })),
    combinations: combinations.map((c) => ({
      key: c.id,
      id: c.id,
      name: c.name,
      description: c.description,
      detail: c.members.map((m) => m.treatment.name).join(" + "),
      // A disabled combination never enumerates, so ticking it would be a
      // promise the run cannot keep. Shown, but said to be off.
      enabled: c.enabled,
    })),
    selectedTreatments: scenario?.treatmentOptions.map((o) => o.treatment.name) ?? [],
    selectedCombinations: scenario?.combinationOptions.map((o) => o.combinationId) ?? [],
  };
}

/**
 * What one scenario may consider, ready for the domain filter.
 *
 * Returns null — consider everything — whenever the scenario does not limit
 * itself, so the common case costs one boolean rather than two sets.
 */
export async function resolveOptionSelection(
  organizationId: string,
  scenarioId: string | null | undefined
): Promise<OptionSelection> {
  if (!scenarioId) return CONSIDER_ALL;

  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    select: {
      limitsOptions: true,
      treatmentOptions: { select: { treatment: { select: { name: true } } } },
      combinationOptions: { select: { combinationId: true } },
    },
  });

  if (!scenario || !scenario.limitsOptions) return CONSIDER_ALL;

  return {
    treatments: new Set(scenario.treatmentOptions.map((o) => o.treatment.name)),
    combinations: new Set(scenario.combinationOptions.map((o) => o.combinationId)),
  };
}

export type OptionSelectionInput = {
  limitsOptions: boolean;
  /** Treatment names. Resolved to ids here rather than trusted from the form. */
  treatments: string[];
  combinations: string[];
};

/**
 * Replace a scenario's selection wholesale.
 *
 * Rows are deleted and rewritten rather than diffed, for the same reason
 * assumption rows are: a partial update has an intermediate state where the
 * selection is neither the old one nor the new one, and a run that landed in
 * that window would produce a plan nobody asked for.
 *
 * Selecting nothing while limiting is allowed and means what it says. It is
 * refused higher up, in the action, where there is a person to tell.
 */
export async function setScenarioOptions(
  organizationId: string,
  scenarioId: string,
  input: OptionSelectionInput
) {
  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    select: { id: true },
  });
  if (!scenario) throw new Error("Scenario not found");

  // Checked rather than trusted: a crafted request must not be able to name
  // another organization's treatment or a combination that no longer exists.
  const [treatments, combinations] = await Promise.all([
    input.treatments.length > 0
      ? prisma.treatment.findMany({
          where: { name: { in: input.treatments }, assetType: { code: "WATERLINE", organizationId } },
          select: { id: true },
        })
      : Promise.resolve([]),
    input.combinations.length > 0
      ? prisma.treatmentCombination.findMany({
          where: { id: { in: input.combinations }, organizationId },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  await prisma.$transaction([
    prisma.scenario.update({
      where: { id: scenarioId },
      data: { limitsOptions: input.limitsOptions },
    }),
    prisma.scenarioTreatment.deleteMany({ where: { scenarioId } }),
    prisma.scenarioCombination.deleteMany({ where: { scenarioId } }),
    prisma.scenarioTreatment.createMany({
      data: treatments.map((t) => ({ scenarioId, treatmentId: t.id })),
    }),
    prisma.scenarioCombination.createMany({
      data: combinations.map((c) => ({ scenarioId, combinationId: c.id })),
    }),
  ]);
}

/** A one-line summary for the comparison grid, where a scenario's scope
 * matters as much as its budget but there is no room to list it. */
export function describeSelection(catalogue: {
  limitsOptions: boolean;
  selectedTreatments: string[];
  selectedCombinations: string[];
}): string {
  if (!catalogue.limitsOptions) return "Whole library";

  const t = catalogue.selectedTreatments.length;
  const c = catalogue.selectedCombinations.length;
  if (t === 0 && c === 0) return "Nothing selected";
  if (t === 1 && c === 0) return catalogue.selectedTreatments[0];
  if (t === 0 && c === 1) return "1 combination";

  const parts: string[] = [];
  if (t > 0) parts.push(`${t} treatment${t === 1 ? "" : "s"}`);
  if (c > 0) parts.push(`${c} combination${c === 1 ? "" : "s"}`);
  return parts.join(", ");
}
