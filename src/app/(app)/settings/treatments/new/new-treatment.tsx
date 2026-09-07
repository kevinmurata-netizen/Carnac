"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionGroup, CollapsibleSection } from "@/components/layout/collapsible-section";
import { CostEditor } from "../[id]/cost-editor";
import { RuleTreeEditor } from "../[id]/rule-tree-editor";
import {
  DefinitionFields,
  EffectFields,
  Feedback,
  draftFromTreatment,
  type TreatmentDraft,
} from "../treatment-fields";
import { createTreatmentAction } from "../actions";
import { EMPTY_TREATMENT_STATE, type TreatmentActionState } from "../state";
import type { RuleGroup } from "@/domain/waterline/decision-tree";
import type { CostRateRow, CostRateInput } from "@/server/cost-rates";
import type { RuleSummary } from "@/server/rules";

/** Same order as the detail page, so the page you fill in and the page you
 * come back to are the same page. */
const SECTION_IDS = ["definition", "does", "costs", "rules"];

/** A treatment starts with one price that applies to everything. Rates are
 * tried in order and the last one must match anything, so the very first rate
 * has to be that fallback — anything narrower would leave assets unpriceable. */
const STARTING_RATES: CostRateRow[] = [
  {
    id: "starting",
    name: "Standard",
    sortOrder: 0,
    ruleId: null,
    ruleName: null,
    ruleSummary: null,
    unitCost: 0,
    costUnit: "per LF",
    mobilizationCost: 0,
    annualMaintenanceCost: 0,
  },
];

export function NewTreatmentForm({
  allRules,
  emptyTree,
}: {
  allRules: RuleSummary[];
  emptyTree: RuleGroup;
}) {
  const [state, submit, pending] = useActionState<TreatmentActionState, FormData>(
    createTreatmentAction,
    EMPTY_TREATMENT_STATE
  );
  // Controlled, so a refused create leaves everything typed on the page. React
  // clears an uncontrolled form as soon as its action returns, which on this
  // page would empty every box at the exact moment the error asks for a fix.
  const [draft, setDraft] = useState<TreatmentDraft>(() => draftFromTreatment());
  const patch = (change: Partial<TreatmentDraft>) => setDraft((d) => ({ ...d, ...change }));
  const [rates, setRates] = useState<CostRateInput[]>(STARTING_RATES);
  const [tree, setTree] = useState<RuleGroup>(emptyTree);
  const [blockIds, setBlockIds] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <Feedback state={state} />

      <form action={submit} className="space-y-4">
        {/* Prices and the arrangement are trees, and a tree does not survive
            being flattened into form fields. They ride along as JSON and are
            parsed back on the server, where the same validators the edit page
            uses check them again. */}
        <input type="hidden" name="costRates" value={JSON.stringify(rates)} />
        <input type="hidden" name="ruleTree" value={JSON.stringify(tree)} />
        <input type="hidden" name="blockIds" value={JSON.stringify(blockIds)} />

        <SectionGroup ids={SECTION_IDS}>
          <CollapsibleSection
            id="definition"
            title="Treatment Definition"
            description="What it is called, what kind of work it is, and how long it lasts."
          >
            <DefinitionFields draft={draft} onChange={patch} />
          </CollapsibleSection>

          <CollapsibleSection
            id="does"
            title="What it does"
            description="The effect on condition, on failure probability, and on remaining life — the numbers every recommendation and life-cycle comparison is built from."
          >
            <EffectFields draft={draft} onChange={patch} />
          </CollapsibleSection>

          <CollapsibleSection
            id="costs"
            title="What it costs"
            description="Prices tried top to bottom — the first whose rule matches is charged."
          >
            <CostEditor
              treatmentName="this treatment"
              initial={STARTING_RATES}
              rules={allRules}
              canEdit
              onChange={setRates}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="rules"
            title="When it can be used"
            description="How the rules combine to decide whether this treatment is considered. Click any rule to open it."
          >
            <RuleTreeEditor
              allRules={allRules}
              initialTree={emptyTree}
              initialBlockIds={[]}
              canEdit
              onChange={(next, blocks) => {
                setTree(next);
                setBlockIds(blocks);
              }}
            />
          </CollapsibleSection>
        </SectionGroup>

        {/* One button for all four sections, outside every one of them so it
            stays reachable however many are folded away. */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/settings/treatments">Cancel</Link>}
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create Treatment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
