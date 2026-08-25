import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTreatmentForAdmin } from "@/server/treatment-config";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { TreatmentForm } from "../treatment-form";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";

export default async function TreatmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const isAdmin = session!.user.roleName === "Administrator";

  const treatment = await getTreatmentForAdmin(organizationId, id);
  if (!treatment) notFound();

  return (
    <div>
      <SetBreadcrumb segment={id} label={treatment.name} />
      <PageHeader
        title={treatment.name}
        description={treatment.description || "Treatment definition, applicability and costs"}
      />

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatments are read-only for your role.
        </div>
      )}

      <div className="mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {treatment.treeCount > 0
          ? `${treatment.treeCount} decision tree${treatment.treeCount === 1 ? " gates" : "s gate"} when this treatment is considered.`
          : "No decision tree gates this treatment — only the technical window below applies."}{" "}
        <Link href={`/settings/decision-trees?treatment=${treatment.id}`} className="text-primary hover:underline">
          Edit decision trees →
        </Link>
      </div>

      <div className="space-y-4">
        {isAdmin ? (
          <TreatmentForm mode="edit" treatment={treatment} />
        ) : (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            Condition {treatment.applicableConditionMin}–{treatment.applicableConditionMax} ·{" "}
            {treatment.applicableMaterials?.join(", ") ?? "all materials"} · ${treatment.unitCost}{" "}
            {treatment.costUnit}
            {treatment.treeCount > 0
              ? ` · ${treatment.treeCount} decision tree${treatment.treeCount === 1 ? "" : "s"}`
              : ""}
          </div>
        )}
      </div>
    </div>
  );
}
