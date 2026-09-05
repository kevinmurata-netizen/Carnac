import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { prisma } from "@/lib/prisma";
import { listTreatmentTrees } from "@/server/decision-trees";
import { listMaterials, listCriticalities, listServiceAreas, listPressureZones } from "@/server/assets";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { ageInYears } from "@/lib/format";
import type { DecisionField, DecisionInput } from "@/domain/waterline/decision-tree";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RuleBuilder, type Sample } from "./rule-builder";
import { TreatmentPicker } from "./treatment-picker";
import { saveTreesAction } from "./actions";
import { getPageName } from "@/server/navigation";

/**
 * Real segments to test a rule against, spread across the condition range so a
 * rule can be checked at both ends rather than only against whichever asset
 * happened to be worst.
 */
async function loadSamples(organizationId: string): Promise<Sample[]> {
  const measurements = await prisma.conditionMeasurement.findMany({
    where: { asset: { organizationId, deletedAt: null, status: "ACTIVE" } },
    orderBy: { score: "asc" },
    distinct: ["assetId"],
    include: {
      asset: {
        include: {
          attributeValues: { include: { definition: true } },
          riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
          failureEvents: { select: { id: true } },
          location: { select: { serviceArea: true, pressureZone: true } },
        },
      },
    },
  });
  if (measurements.length === 0) return [];

  // Worst, best and three between — enough to see where a threshold bites.
  const picks = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => Math.min(measurements.length - 1, Math.round(f * (measurements.length - 1))))
    .filter((v, i, all) => all.indexOf(v) === i);

  return picks.map((index) => {
    const measurement = measurements[index];
    const asset = measurement.asset;
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
    const risk = asset.riskAssessments[0];
    const age = ageInYears(asset.installationDate);
    const life = asset.expectedUsefulLife ?? 75;

    const input: DecisionInput = {
      condition: Math.round(measurement.score * 10) / 10,
      ageYears: age,
      ageRatio: age != null ? Math.round((age / life) * 100) / 100 : null,
      diameterInches: attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null,
      lengthFt: attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null,
      customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null,
      riskScore: risk?.riskScore ?? null,
      pof: risk?.probabilityScore ?? null,
      cof: risk?.consequenceScore ?? null,
      failuresLast10Years: asset.failureEvents.length,
      material: attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null,
      criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
      serviceArea: asset.location?.serviceArea ?? null,
      pressureZone: asset.location?.pressureZone ?? null,
    };

    return {
      id: asset.id,
      label: `${asset.assetCode} — WCI ${input.condition}, ${input.material ?? "unknown material"}, ${
        input.customersServed ?? 0
      } customers${input.serviceArea ? `, ${input.serviceArea}` : ""}`,
      input,
    };
  });
}

export default async function DecisionTreesPage({
  searchParams,
}: {
  searchParams: Promise<{ treatment?: string }>;
}) {
  const { treatment: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/decision-trees");
  const pageTitle = await getPageName(organizationId, "/settings/decision-trees", "Treatment Rules");

  const [treatments, samples, materials, criticalities, serviceAreas, pressureZones] = await Promise.all([
    listTreatmentTrees(organizationId),
    loadSamples(organizationId),
    listMaterials(organizationId),
    listCriticalities(organizationId),
    listServiceAreas(organizationId),
    listPressureZones(organizationId),
  ]);

  const selected = treatments.find((t) => t.treatmentId === requested) ?? treatments[0];

  // Text fields offer what the inventory actually holds, so a rule cannot be
  // written against a material no segment has.
  const fieldOptions: Partial<Record<DecisionField, string[]>> = {
    material: materials,
    criticality: criticalities,
    serviceArea: serviceAreas,
    pressureZone: pressureZones,
  };

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Policy rules that decide whether an asset qualifies for a treatment, on top of its technical window."
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatment rules are read-only for your role.
        </div>
      )}

      {treatments.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No treatments are configured yet. Add one under Settings → Treatments and Costs first.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <TreatmentPicker
            treatments={treatments.map((t) => ({
              id: t.treatmentId,
              name: t.treatmentName,
              treeCount: t.trees.filter((tree) => tree.enabled).length,
            }))}
            selectedId={selected.treatmentId}
          />

          {canEdit ? (
            <RuleBuilder
              key={selected.treatmentId}
              treatmentId={selected.treatmentId}
              treatmentName={selected.treatmentName}
              initialTrees={selected.trees}
              initialMode={selected.qualifyMode}
              samples={samples}
              fieldOptions={fieldOptions}
              onSave={saveTreesAction}
            />
          ) : (
            <Card>
              <CardContent className="space-y-2 py-6 text-sm">
                {selected.trees.length === 0 ? (
                  <p className="text-muted-foreground">
                    No treatment rule gates {selected.treatmentName}.
                  </p>
                ) : (
                  selected.trees.map((tree) => (
                    <p key={tree.id}>
                      <span className="font-medium">{tree.name}</span>
                      {!tree.enabled && <span className="text-muted-foreground"> (disabled)</span>}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
