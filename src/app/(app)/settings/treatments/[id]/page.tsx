import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTreatmentForAdmin } from "@/server/treatment-config";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { ageInYears } from "@/lib/format";
import type { DecisionInput } from "@/domain/waterline/decision-tree";
import { PageHeader } from "@/components/layout/page-header";
import { TreatmentForm } from "../treatment-form";
import { TreeBuilder } from "./tree-builder";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";

/** A real, currently-worst asset so the tree preview is grounded in live data
 * rather than an invented example. */
async function loadSample(organizationId: string) {
  const measurement = await prisma.conditionMeasurement.findFirst({
    where: { asset: { organizationId, deletedAt: null, status: "ACTIVE" } },
    orderBy: { score: "asc" },
    include: {
      asset: {
        include: {
          attributeValues: { include: { definition: true } },
          riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
          failureEvents: { select: { id: true } },
        },
      },
    },
  });
  if (!measurement) return null;

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
  };

  return { label: `${asset.assetCode} (WCI ${input.condition}, ${input.material ?? "unknown"})`, input };
}

export default async function TreatmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const isAdmin = session!.user.roleName === "Administrator";

  const [treatment, sample] = await Promise.all([
    getTreatmentForAdmin(organizationId, id),
    loadSample(organizationId),
  ]);
  if (!treatment) notFound();

  return (
    <div>
      <SetBreadcrumb segment={id} label={treatment.name} />
      <PageHeader
        title={treatment.name}
        description={treatment.description || "Treatment definition and decision tree"}
      />

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatments are read-only for your role.
        </div>
      )}

      <div className="space-y-4">
        {isAdmin && (
          <TreeBuilder
            treatmentId={treatment.id}
            treatmentName={treatment.name}
            initialTree={treatment.decisionTree ?? null}
            sample={sample}
          />
        )}
        {isAdmin ? (
          <TreatmentForm mode="edit" treatment={treatment} />
        ) : (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            Condition {treatment.applicableConditionMin}–{treatment.applicableConditionMax} ·{" "}
            {treatment.applicableMaterials?.join(", ") ?? "all materials"} · ${treatment.unitCost}{" "}
            {treatment.costUnit}
            {treatment.decisionTree ? ` · decision tree with ${treatment.treeLeafCount} outcomes` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
