import { prisma } from "@/lib/prisma";

/**
 * Empty the asset side of the database, leaving the schema and the
 * configuration on it alone.
 *
 * What this is for: re-seeding this instance with a different network — the
 * JVWCD demo — without a fresh database and without losing the library,
 * models and settings that make the app work.
 *
 * **Kept**: organization, users and roles, permissions, asset types and their
 * attribute definitions, inspection templates and their fields, condition /
 * deterioration / risk / criticality / scale-factor models, failure types,
 * the treatment library with its effects, rules, combinations and cost rates,
 * weightings, funding plans, lead time sets, scenario sets, navigation labels,
 * organization settings and saved filters.
 *
 * **Removed**: every asset and everything that describes or was derived from
 * one — attribute values, locations, relationships, inspections and their
 * results and attachments, condition measurements, failure events,
 * deterioration predictions, risk assessments, criticality scores, documents
 * attached to assets — and the planning built on top of them: work plan items,
 * work plans, and scenarios with their stored results, assumptions and option
 * selections.
 *
 * Scenarios go because a scenario's results describe assets that will not
 * exist and its funded programme is a work plan over them; keeping the row
 * would leave a scenario that reports on a network nobody can look at. The
 * scenario *sets* stay, because a set is a window and a budget rather than a
 * statement about any particular asset.
 *
 * Nothing is deleted without `--yes`. On its own it counts what it would
 * remove and stops, which is how the prune script in this repo behaves and
 * for the same reason.
 */

const DRY_RUN = !process.argv.includes("--yes");

async function main() {
  const organizationId = process.env.ORGANIZATION_ID ?? undefined;
  const org = organizationId
    ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } })
    : await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error("No organization found — this database has not been seeded at all.");

  // Scoped to one organization's assets throughout: this instance holds one,
  // but a query that says so cannot empty someone else's network by accident.
  const assets = await prisma.asset.findMany({ where: { organizationId: org.id }, select: { id: true } });
  const assetIds = assets.map((a) => a.id);
  const scenarios = await prisma.scenario.findMany({ where: { organizationId: org.id }, select: { id: true } });
  const scenarioIds = scenarios.map((s) => s.id);
  const workPlans = await prisma.workPlan.findMany({ select: { id: true } });
  const workPlanIds = workPlans.map((w) => w.id);

  const counts = {
    assets: assetIds.length,
    attributeValues: await prisma.assetAttributeValue.count({ where: { assetId: { in: assetIds } } }),
    relationships: await prisma.assetRelationship.count({ where: { assetAId: { in: assetIds } } }),
    inspections: await prisma.inspection.count({ where: { assetId: { in: assetIds } } }),
    conditionMeasurements: await prisma.conditionMeasurement.count({ where: { assetId: { in: assetIds } } }),
    failureEvents: await prisma.failureEvent.count({ where: { assetId: { in: assetIds } } }),
    deteriorationPredictions: await prisma.deteriorationPrediction.count({ where: { assetId: { in: assetIds } } }),
    riskAssessments: await prisma.riskAssessment.count({ where: { assetId: { in: assetIds } } }),
    criticalityScores: await prisma.criticalityScore.count({ where: { assetId: { in: assetIds } } }),
    documents: await prisma.document.count({ where: { assetId: { in: assetIds } } }),
    workPlanItems: await prisma.workPlanItem.count(),
    workPlans: workPlanIds.length,
    scenarios: scenarioIds.length,
    scenarioResults: await prisma.scenarioResult.count({ where: { scenarioId: { in: scenarioIds } } }),
  };

  console.log(`organization: ${org.name}`);
  for (const [what, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(6)}  ${what}`);

  if (DRY_RUN) {
    console.log("\nDry run — nothing deleted. Re-run with --yes to empty these.");
    await prisma.$disconnect();
    return;
  }

  // Order is by foreign key, children first. Not one transaction: on a real
  // network these are large deletes, and a half-finished reset is recoverable
  // by running it again, which is not true of a statement timeout inside a
  // transaction that rolls the whole thing back after ten minutes.
  await prisma.inspectionResult.deleteMany({ where: { inspection: { assetId: { in: assetIds } } } });
  await prisma.inspectionAttachment.deleteMany({ where: { inspection: { assetId: { in: assetIds } } } });
  await prisma.conditionMeasurement.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.inspection.deleteMany({ where: { assetId: { in: assetIds } } });

  await prisma.failureEvent.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.deteriorationPrediction.deleteMany({ where: { assetId: { in: assetIds } } });
  // A risk assessment carries its factors — what each one contributed — and
  // they hold the foreign key, so they go first.
  await prisma.riskFactor.deleteMany({ where: { riskAssessment: { assetId: { in: assetIds } } } });
  await prisma.riskAssessment.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.criticalityScore.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.document.deleteMany({ where: { assetId: { in: assetIds } } });

  // The planning built on those assets.
  await prisma.workPlanItem.deleteMany({});
  await prisma.workPlan.deleteMany({});
  await prisma.scenarioResult.deleteMany({ where: { scenarioId: { in: scenarioIds } } });
  await prisma.scenarioAssumption.deleteMany({ where: { scenarioId: { in: scenarioIds } } });
  await prisma.scenarioTreatment.deleteMany({ where: { scenarioId: { in: scenarioIds } } });
  await prisma.scenarioCombination.deleteMany({ where: { scenarioId: { in: scenarioIds } } });
  await prisma.scenario.deleteMany({ where: { organizationId: org.id } });

  // The assets themselves. Locations hold a PostGIS column Prisma cannot
  // address, so they go through raw SQL like every other write to that table.
  await prisma.assetRelationship.deleteMany({
    where: { OR: [{ assetAId: { in: assetIds } }, { assetBId: { in: assetIds } }] },
  });
  await prisma.assetAttributeValue.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.$executeRaw`DELETE FROM asset_locations WHERE "assetId" = ANY(${assetIds}::text[])`;
  await prisma.asset.deleteMany({ where: { organizationId: org.id } });

  const left = {
    assets: await prisma.asset.count(),
    assetTypes: await prisma.assetType.count(),
    attributeDefinitions: await prisma.assetAttributeDefinition.count(),
    treatments: await prisma.treatment.count(),
    scenarioSets: await prisma.scenarioSet.count(),
    users: await prisma.user.count(),
  };
  console.log("\nemptied. what is left:");
  for (const [what, n] of Object.entries(left)) console.log(`  ${String(n).padStart(6)}  ${what}`);

  await prisma.$disconnect();
}

main();
