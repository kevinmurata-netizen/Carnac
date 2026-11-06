import { prisma } from "@/lib/prisma";
import type { PriorityTerms } from "@/domain/waterline/benefit";

type Ranking = {
  score: number | null;
  terms: PriorityTerms;
  incremental: number | null;
  incrementalOver: string | null;
};

export async function getScenarioReportProjects(organizationId: string, scenarioId: string) {
  const plan = await prisma.workPlan.findFirst({
    where: { organizationId, scenarioId, isScenarioMirror: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      items: {
        where: { asset: { organizationId } },
        select: {
          id: true,
          bundleId: true,
          bundleName: true,
          estimatedCost: true,
          year: true,
          programmedYear: true,
          buildYear: true,
          expectedBenefit: true,
          reasonExplanation: true,
          fundingSource: true,
          asset: { select: { assetCode: true } },
          treatment: { select: { name: true } },
        },
        orderBy: [{ year: "asc" }, { id: "asc" }],
      },
    },
  });

  const projects = new Map<string, {
    id: string;
    name: string;
    assetCode: string;
    cost: number;
    year: number;
    programmedYear: number;
    buildYear: number;
    reason: string | null;
    locked: boolean;
    ranking: Ranking | undefined;
  }>();

  for (const item of plan?.items ?? []) {
    const id = item.bundleId ?? item.id;
    const project = projects.get(id);
    if (project) {
      project.cost += item.estimatedCost;
      continue;
    }
    const benefit = item.expectedBenefit as { ranking?: Ranking } | null;
    projects.set(id, {
      id,
      name: item.bundleName ?? item.treatment.name,
      assetCode: item.asset.assetCode,
      cost: item.estimatedCost,
      year: item.year,
      programmedYear: item.programmedYear ?? item.year,
      buildYear: item.buildYear ?? item.year,
      reason: item.reasonExplanation,
      locked: item.fundingSource === "Programmed (locked)",
      ranking: benefit?.ranking,
    });
  }

  return [...projects.values()].sort(
    (a, b) => (b.ranking?.score ?? -Infinity) - (a.ranking?.score ?? -Infinity) || a.year - b.year
  );
}
