"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionGroup, CollapsibleSection } from "@/components/layout/collapsible-section";
import { CancelOrDiscard } from "@/components/layout/save-actions";
import { CostEditor } from "../[id]/cost-editor";
import { RuleTreeEditor } from "../[id]/rule-tree-editor";
import { EffectListEditor } from "../[id]/effect-list-editor";
import {
  DefinitionFields,
  Feedback,
  draftFromTreatment,
  type TreatmentDraft,
} from "../treatment-fields";
import { createTreatmentAction } from "../actions";
import { EMPTY_TREATMENT_STATE, type TreatmentActionState } from "../state";
import type { RuleGroup } from "@/domain/waterline/decision-tree";
import type { CostRateRow, CostRateInput } from "@/server/cost-rates";
import type { RuleSummary } from "@/server/rules";
import type { EffectSummary } from "@/server/effects";

/** Same order as the detail page, so the page you fill in and the page you
 * come back to are the same page. */
const SECTION_IDS = ["definition", "does", "costs", "rules"];

/** A treatment starts with one price that applies to everything. Rates are
 * tried in order and the last one must match anything, so the very first rate
 * has to be that fallback — anything narrower would leave assets unpriceable. */
const STARTING_RATE: CostRateInput = {
  name: "Standard",
  ruleId: null,
  unitCost: 0,
  costUnit: "per LF",
  mobilizationCost: 0,
  annualMaintenanceCost: 0,
};

const STARTING_RATES: CostRateInput[] = [STARTING_RATE];

/** The same rate in the shape the cost editor reads, so the two cannot drift. */
const STARTING_ROWS: CostRateRow[] = [
  { id: "starting", sortOrder: 0, ruleName: null, ruleSummary: null, ...STARTING_RATE },
];

export function NewTreatmentForm({
  allRules,
  allEffects,
  emptyTree,
  canEditRules,
  canEditEffects,
}: {
  allRules: RuleSummary[];
  allEffects: EffectSummary[];
  emptyTree: RuleGroup;
  canEditRules: boolean;
  canEditEffects: boolean;
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
  const [effectIds, setEffectIds] = useState<string[]>([]);

  // The prices and the arrangement are held by their own editors, which report
  // upwards but keep their state. Remounting them is what actually empties
  // them; bumping this key is the discard.
  const [generation, setGeneration] = useState(0);

  // Whether anything has been entered. The rule tree is compared by value like
  // everything else, so removing what you added reads as untouched again.
  const started =
    JSON.stringify(draft) !== JSON.stringify(draftFromTreatment()) ||
    JSON.stringify(rates) !== JSON.stringify(STARTING_RATES) ||
    JSON.stringify(tree) !== JSON.stringify(emptyTree) ||
    blockIds.length > 0 ||
    effectIds.length > 0;

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
        <input type="hidden" name="effectIds" value={JSON.stringify(effectIds)} />

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
            description="Its effects on condition, failure probability and remaining life — the numbers every recommendation and life-cycle comparison is built from."
          >
            <EffectListEditor
              key={generation}
              allEffects={allEffects}
              initialIds={[]}
              treatmentName={draft.name.trim() || "this treatment"}
              canEdit
              canEditEffects={canEditEffects}
              onChange={setEffectIds}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="costs"
            title="What it costs"
            description="Prices tried top to bottom — the first whose rule matches is charged."
          >
            <CostEditor
              key={generation}
              treatmentName="this treatment"
              initial={STARTING_ROWS}
              rules={allRules}
              canEdit
              canEditRules={canEditRules}
              onChange={setRates}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="rules"
            title="When it can be used"
            description="How the rules combine to decide whether this treatment is considered. Click any rule to open it."
          >
            <RuleTreeEditor
              key={generation}
              allRules={allRules}
              initialTree={emptyTree}
              initialBlockIds={[]}
              canEdit
              canEditRules={canEditRules}
              onChange={(next, blocks) => {
                setTree(next);
                setBlockIds(blocks);
              }}
            />
          </CollapsibleSection>
        </SectionGroup>

        {/* One button for all four sections, outside every one of them so it
            stays reachable however many are folded away. */}
        <div className="flex items-center justify-end gap-2">
          {/* Nothing is stored yet, so "the saved state" here is the empty form
              the page opened with. Discard clears it back to that, which is
              also what makes leaving safe again. */}
          <CancelOrDiscard
            dirty={started}
            onDiscard={() => {
              setDraft(draftFromTreatment());
              setRates(STARTING_RATES);
              setTree(emptyTree);
              setBlockIds([]);
              setEffectIds([]);
              setGeneration((g) => g + 1);
            }}
            disabled={pending}
            size="default"
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create Treatment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
