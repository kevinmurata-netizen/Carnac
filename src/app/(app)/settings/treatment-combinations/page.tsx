import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listCombinations, getCombination } from "@/server/combinations";
import { listTreatmentsForAdmin } from "@/server/treatment-config";
import { listRules } from "@/server/rules";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { CombinationEditor, type CombinationDraft } from "./combination-editor";
import { saveCombinationAction, deleteCombinationAction } from "./actions";
import { getPageName } from "@/server/navigation";

export default async function TreatmentCombinationsPage({
  searchParams,
}: {
  searchParams: Promise<{ combination?: string }>;
}) {
  const { combination: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/treatment-combinations");
  const pageTitle = await getPageName(
    organizationId,
    "/settings/treatment-combinations",
    "Treatment Combinations"
  );

  const [combinations, treatments, rules] = await Promise.all([
    listCombinations(organizationId),
    listTreatmentsForAdmin(organizationId),
    listRules(organizationId),
  ]);

  // The fallback rate's mobilization travels with each treatment so the
  // editor can show what a bundle would be charged if nobody overrides it.
  // It is the fallback rather than the rate that will actually apply, because
  // which rate applies depends on the asset and there is no asset here.
  // What each combination is charged to mobilize: its own figure, or the
  // largest of its members' fallback rates when it has not set one. Computed
  // here rather than in the row so the list and the editor agree on what
  // "inferred" means.
  const mobilizationFor = (members: Array<{ treatmentId: string }>): number =>
    Math.max(
      0,
      ...members.map(
        (m) => (treatments.find((t) => t.id === m.treatmentId)?.costRates ?? []).find((r) => r.rule == null)
          ?.mobilizationCost ?? 0
      )
    );

  const treatmentOptions = treatments.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    mobilizationCost: (t.costRates ?? []).find((r) => r.rule == null)?.mobilizationCost ?? 0,
  }));
  const resetTreatmentIds = treatments.filter((t) => t.conditionResetTo != null).map((t) => t.id);

  const selected =
    requested && requested !== "new" ? await getCombination(organizationId, requested) : null;

  const draft: CombinationDraft | null =
    requested === "new" && canEdit
      ? {
          id: null,
          name: "",
          description: "",
          enabled: true,
          qualifyMode: "all",
          mobilizationCost: null,
          members: [],
          ruleIds: [],
        }
      : selected
        ? {
            id: selected.id,
            name: selected.name,
            description: selected.description ?? "",
            enabled: selected.enabled,
            qualifyMode: selected.qualifyMode,
            mobilizationCost: selected.mobilizationCost,
            members: selected.members.map((m) => ({ treatmentId: m.treatmentId, required: m.required })),
            ruleIds: selected.ruleIds,
          }
        : null;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Treatments you would apply together on one asset in one year. Defining a bundle adds a way of doing the work — every treatment in it is still offered on its own."
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatment combinations are read-only for your role.
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle>
              Combinations <span className="text-muted-foreground">({combinations.length})</span>
            </CardTitle>
            {canEdit && (
              <Link
                href="/settings/treatment-combinations?combination=new"
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                New combination
              </Link>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {combinations.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                None yet. Without any, the model considers each treatment on its own — which is exactly what it did
                before this page existed.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Combination</TableHead>
                      <TableHead>Treatments</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Mobilization</TableHead>
                      <TableHead>Extra rules</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinations.map((c) => (
                      <TableRow key={c.id} className={c.id === selected?.id ? "bg-muted/50" : undefined}>
                        <TableCell>
                          <Link
                            href={`/settings/treatment-combinations?combination=${c.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {c.name}
                          </Link>
                          {!c.enabled && <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>}
                          {c.description && (
                            <div className="text-xs text-muted-foreground">{c.description}</div>
                          )}
                          {c.conflictingResets.length > 1 && (
                            <div className="text-xs text-destructive">
                              {c.conflictingResets.join(" and ")} both reset condition — probably not intended.
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="flex flex-wrap gap-1">
                            {c.members.map((m) => (
                              <Badge key={m.treatmentId} variant={m.required ? "default" : "secondary"}>
                                {m.treatmentName}
                                {m.required ? "" : " (optional)"}
                              </Badge>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {c.mobilizationCost == null ? (
                            <span
                              className="text-muted-foreground"
                              title="Not set — charged once, at the largest of the members' rates."
                            >
                              {formatCurrency(mobilizationFor(c.members))}
                              <span className="ml-1 text-xs">inferred</span>
                            </span>
                          ) : (
                            <span title="Set on this combination, replacing the largest of the members' rates.">
                              {formatCurrency(c.mobilizationCost)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.ruleNames.length === 0 ? (
                            <span className="text-muted-foreground">none</span>
                          ) : (
                            c.ruleNames.join(", ")
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
          <CombinationEditor
            key={draft.id ?? "new"}
            initial={draft}
            treatments={treatmentOptions}
            rules={rules}
            resetTreatmentIds={resetTreatmentIds}
            onSave={saveCombinationAction}
            onDelete={deleteCombinationAction}
          />
        )}
      </div>
    </div>
  );
}
