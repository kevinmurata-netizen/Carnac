import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { prisma } from "@/lib/prisma";
import { listRules, getRuleForEditing } from "@/server/rules";
import {
  listMaterials,
  listCriticalities,
  listServiceAreas,
  listPressureZones,
} from "@/server/assets";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { ageInYears } from "@/lib/format";
import { emptyGroup, type DecisionField, type DecisionInput } from "@/domain/waterline/decision-tree";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RuleEditor, type Sample, type RuleDraft } from "./rule-editor";
import { saveRuleAction, deleteRuleAction } from "./actions";
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

export default async function TreatmentRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ rule?: string }>;
}) {
  const { rule: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/decision-trees");
  const pageTitle = await getPageName(organizationId, "/settings/decision-trees", "Treatment Rules");

  const [rules, samples, materials, criticalities, serviceAreas, pressureZones] = await Promise.all([
    listRules(organizationId),
    loadSamples(organizationId),
    listMaterials(organizationId),
    listCriticalities(organizationId),
    listServiceAreas(organizationId),
    listPressureZones(organizationId),
  ]);

  // Text fields offer what the inventory actually holds, so a rule cannot be
  // written against a material or district no segment has.
  const fieldOptions: Partial<Record<DecisionField, string[]>> = {
    material: materials,
    criticality: criticalities,
    serviceArea: serviceAreas,
    pressureZone: pressureZones,
  };

  const selected = requested && requested !== "new" ? rules.find((r) => r.id === requested) : undefined;
  const editing = await (selected ? getRuleForEditing(organizationId, selected.id) : Promise.resolve(null));

  // Built here rather than by a helper in rule-editor.tsx: that file is a
  // client module, and a server component cannot call into one.
  const draft: RuleDraft | null =
    requested === "new" && canEdit
      ? { id: null, name: "", description: "", effect: "allow", enabled: true, root: emptyGroup("AND") }
      : editing
        ? {
            id: editing.id,
            name: editing.name,
            description: editing.description ?? "",
            effect: editing.effect,
            enabled: editing.enabled,
            root: editing.root,
          }
        : null;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Named conditions that decide whether an asset qualifies for a treatment. A rule is written once here and attached to as many treatments as it applies to."
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatment rules are read-only for your role.
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle>
              Rules <span className="text-muted-foreground">({rules.length})</span>
            </CardTitle>
            {canEdit && (
              <Link
                href="/settings/decision-trees?rule=new"
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                New rule
              </Link>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No rules yet. Without any, every treatment is considered for every inspected asset.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Effect</TableHead>
                      <TableHead>Reads as</TableHead>
                      <TableHead>Used by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => (
                      <TableRow key={r.id} className={r.id === selected?.id ? "bg-muted/50" : undefined}>
                        <TableCell>
                          <Link
                            href={`/settings/decision-trees?rule=${r.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.name}
                          </Link>
                          {!r.enabled && <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.effect === "block" ? "destructive" : "secondary"}>
                            {r.effect === "block" ? "Blocks" : "Allows"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md text-sm text-muted-foreground">{r.summary}</TableCell>
                        <TableCell className="text-sm">
                          {r.usedBy.length === 0 ? (
                            <span className="text-muted-foreground">Nothing yet</span>
                          ) : (
                            r.usedBy.join(", ")
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {draft && canEdit && (
          <RuleEditor
            key={draft.id ?? "new"}
            initial={draft}
            usedBy={selected?.usedBy ?? []}
            isGenerated={selected?.isGenerated ?? false}
            samples={samples}
            fieldOptions={fieldOptions}
            onSave={saveRuleAction}
            onDelete={deleteRuleAction}
          />
        )}
      </div>
    </div>
  );
}
