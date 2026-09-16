import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listRules, getRuleForEditing } from "@/server/rules";
import { loadRuleSamples, loadRuleFieldOptions } from "@/server/rule-samples";
import { emptyGroup } from "@/domain/waterline/decision-tree";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RuleEditor, type RuleDraft } from "./rule-editor";
import { RuleList } from "./rule-list";
import { saveRuleAction, deleteRuleAction } from "./actions";
import { getPageName } from "@/server/navigation";

export default async function TreatmentRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ rule?: string }>;
}) {
  const { rule: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/treatment-rules");
  const pageTitle = await getPageName(organizationId, "/settings/treatment-rules", "Treatment Rules");

  const [rules, samples, fieldOptions] = await Promise.all([
    listRules(organizationId),
    loadRuleSamples(organizationId),
    loadRuleFieldOptions(organizationId),
  ]);

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
                href="/settings/treatment-rules?rule=new"
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
              <RuleList rules={rules} selectedId={selected?.id ?? null} canEdit={canEdit} />
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
