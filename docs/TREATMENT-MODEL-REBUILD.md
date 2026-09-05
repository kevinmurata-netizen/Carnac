# Treatment Model Rebuild

Supersedes parts of `SPEC.md` §13 (Treatments) and §16 (Optimization). Written
2026-09-05 as the build reference for splitting treatments into Treatments,
Treatment Costs, Treatment Rules, and Treatment Combinations.

Every phase below is a separate PR, ships independently, and leaves the system
working. Phases 0–3 are deliberately behaviour-preserving: they change what is
*possible* without changing any number the Executive Dashboard shows. The
behaviour changes land in Phases 4 and 5, once the plumbing they need already
exists and has been through production.

---

# 1. The goal, restated

Four things are being asked for:

1. **Multiple costs per treatment**, chosen by a rule — "Replacement costs
   $340/LF in District 3 and $290/LF in District 1".
2. **Treatment Rules as reusable, named, treatment-independent objects** —
   "Condition 0–30" is one rule, written once, attached to whichever treatments
   need it. This replaces both Decision Trees and the "when it can be used"
   fields on a treatment.
3. **Treatment Combinations** — which treatments may be applied together on one
   asset in one year, and which are standalone only.
4. **A new ranking objective**: Criticality × Expected Benefit ÷ Cost per Unit.

---

# 2. What stands in the way

Three facts about the current code shape the phasing.

**a. Every consumer assumes exactly one treatment per asset.** There are three
of them and they each independently pick a single winner:

| Consumer | Location | How it picks |
| --- | --- | --- |
| Recommendation engine | `src/domain/waterline/treatment.ts` → `recommendTreatment` | ranks by risk reduction per $1,000, three published overrides |
| Work plan generator | `src/server/workplans.ts` → `buildCandidates` | `let best` — highest life-cycle saving |
| Scenario simulation | `src/domain/waterline/scenario.ts` → `candidateFor` | one per asset per year |

Combinations break that assumption in all three places at once. Phase 3 exists
solely to introduce a shared abstraction — the **Option** — so Phase 4 adds data
rather than rewriting three loops.

**b. "When it can be used" is in three places, not one.** Eliminating the
section means dealing with all three, or the elimination is cosmetic:

- Columns on `Treatment`: `applicableConditionMin/Max`, and
  `applicability.materials / diameterMin / diameterMax`.
- Decision trees in `treatment_rules` rows (`ruleType = "qualification-tree"`).
- **Hard-coded gates in `isApplicable`** (`treatment.ts:303-328`): Inspection is
  suppressed at WCI ≥ 85, Abandonment at > 25 customers, Emergency Repair with
  zero recorded failures. These are policy, they are invisible in the UI, and
  they will silently survive the rebuild unless they are converted into seeded
  rules. Phase 1 converts them.

**c. District is not a field a rule can test.** `DecisionField` in
`decision-tree.ts:18-30` has eleven fields; none of them is district. The
closest stored value is `AssetLocation.serviceArea`, which is what the map and
work plan already treat as district. The headline cost-by-district example is
blocked until that is exposed, so it comes first, in Phase 0.

---

# 3. Reused, not rebuilt

Two existing pieces do most of this work and should not be duplicated.

**The grouped AND/OR rule builder** (`decision-tree.ts` + the editor at
`src/app/(app)/settings/decision-trees/rule-builder.tsx`) already has
structural editing, evaluation, a pass/fail trace for §32 explainability,
JSON validation on read, and a legacy converter. A "Treatment Rule" is the
existing `DecisionTree` type with an owner change — from a treatment to the
organization. The editor is reused wholesale.

**The criticality expression language** (`criticality-formula.ts`) —
tokenizer, AST, `if()`, comparisons, `and`/`or` — is the right tool if cost
rules ever need arithmetic rather than a yes/no test (e.g. a cost that *scales*
with diameter rather than switching between fixed values). Phase 2 does not
need it; §8 notes where it would come in.

Two engines is the right number here. A rule answers "does this apply?" and
must produce a trace. A formula answers "what number?" and must produce a
value. Collapsing them would make both worse.

---

# 4. Phases

## Phase 0 — Fields and naming (no behaviour change)

- Add `serviceArea` (labelled **District**) and `pressureZone` to
  `DecisionField`, `DecisionInput`, `FIELD_LABELS`, `TEXT_FIELDS`, and
  `AssetTreatmentContext`; populate them at all three call sites
  (`workplans.ts:120`, `scenario.ts`, the asset detail context builder).
- Rename the UI concept: the `decision-trees` settings card becomes
  **Treatment Rules**, page title and breadcrumb follow. Route and storage
  unchanged — renaming the route in the same PR as a data migration is how a
  redirect gets forgotten.

**Done when:** a rule can test District, and every existing rule evaluates
exactly as before.

---

## Phase 1 — Treatment Rules become first-class and reusable

The centrepiece. A rule stops belonging to a treatment.

**Schema**

```prisma
model Rule {
  id             String  @id @default(cuid())
  organizationId String
  name           String            // "Condition 0-30", "Material - Metallic"
  description    String?
  /// "allow" = the asset must match. "block" = a match disqualifies.
  effect         String  @default("allow")
  enabled        Boolean @default(true)
  definition     Json              // the existing DecisionTree.root Group

  treatments   TreatmentRuleLink[]
  combinations CombinationRuleLink[]   // Phase 4
  costs        TreatmentCost[]         // Phase 2

  @@unique([organizationId, name])
  @@map("rules")
}

model TreatmentRuleLink {
  treatmentId String
  ruleId      String
  @@id([treatmentId, ruleId])
  @@map("treatment_rule_links")
}
```

`Treatment.qualifyMode` (`any` / `all`) moves out of the `applicability` blob
into a real column, and now governs only the `allow` rules. **`block` rules are
always AND-ed and always win** — that asymmetry is deliberate and must be stated
on the page, because "never abandon a main serving more than 25 customers" is
not a permission that competes with other permissions.

> **Why `effect` exists.** Every current gate is phrased as a permission, so
> expressing an exclusion means hand-inverting each condition and remembering
> that `NOT (a AND b)` is `(NOT a) OR (NOT b)`. Users will get that wrong and
> the mistake is silent — the rule still evaluates, just against the wrong
> assets. One dropdown removes the whole class of error.

**Migration** (hand-written, three steps, on populated tables):

1. For every `treatment_rules` row of type `qualification-tree`, create a `Rule`
   from its stored tree and link it. **Deduplicate by structural equality** —
   "Condition 0–30" written separately on three treatments becomes one rule
   linked three times, which is the entire point of the change.
2. Generate rules from the technical window on each treatment:
   `applicableConditionMin/Max` → `"Condition {min}-{max}"`;
   `applicability.materials` → `"Material - {list}"`;
   diameter bounds → `"Diameter ≥ {n}"` / `"Diameter ≤ {n}"`. Dedupe the same
   way. These names match the user's own examples.
3. Seed the three hard-coded gates as named `block` rules:
   `"Skip inspection when condition is Excellent"`,
   `"No abandonment above 25 customers"`,
   `"Emergency repair only after a recorded failure"`.

**Code**

- `isApplicable` loses its window checks and its three special cases; it
  evaluates linked rules only. The `Treatment` columns stay in place but are no
  longer read — dropping them is Phase 6, one release later.
- New settings card **Treatment Rules**: a list of org-wide rules with an
  "Applied to N treatments" count, and the existing builder for editing one.
- The treatment detail page gets a rule **picker** (multi-select + "create new
  rule"), not a builder.

**Acceptance test — this is the one that matters.** Snapshot the full
qualification matrix (asset × treatment → applicable?) for all ~520 assets
before the migration; assert it is byte-identical after. A rebuild of the
applicability layer that quietly changes which assets qualify would surface
months later as an unexplainable work plan.

---

## Phase 2 — Treatment Costs with rules

**Schema** — `TreatmentCost` currently holds only `costType`, `amount`,
`effectiveDate`, and is written but never read. It gains a real shape:

```prisma
model TreatmentCost {
  id          String  @id @default(cuid())
  treatmentId String
  name        String            // "District 3", "Standard", "Rock excavation"
  ruleId      String?           // null = the fallback
  sortOrder   Int     @default(0)

  unitCost              Float
  costUnit              String  // "per LF" | "per each"
  mobilizationCost      Float   @default(0)
  annualMaintenanceCost Float   @default(0)

  effectiveFrom DateTime?
  effectiveTo   DateTime?
  @@map("treatment_costs")
}
```

**Resolution** — ordered, first match wins, exactly one fallback:

1. Walk cost rows in `sortOrder`.
2. Skip rows outside their effective window.
3. The first row whose rule passes (or that has no rule) is used.
4. If nothing matches, the treatment is **not costable for that asset** and is
   excluded from candidacy with a stated reason. It must not fall back to zero:
   a free treatment wins every ranking, so a missing cost rule would put
   phantom work at the top of the plan.

Validation on save requires exactly one rule-less fallback row per treatment,
placed last.

`estimateTreatmentCost` becomes `resolveTreatmentCost(treatment, ctx)`,
returning `{ amount, costRowName, reason }`. The reason string joins the
existing `reasonExplanation` on every work plan item — "Cost basis: District 3
($340/LF)" — so §32 still holds after costs stop being a single number.

**Migration:** every treatment's existing scalar costs become one fallback row
named `"Standard"`. Nothing changes numerically.

**UI:** Treatment Costs as a **section on the treatment detail page**, plus a
read-only roll-up table on the Treatments card listing every cost row across
all treatments — that roll-up is what makes an annual unit-cost update
tolerable. Not a separate editable top-level card: a cost row is meaningless
without its treatment.

**Cost of the change:** ~520 assets × ~12 treatments × ~3 cost rows ≈ 19k rule
evaluations per plan run, all in memory against already-loaded data. No new
queries. Not a concern.

---

## Phase 3 — The Option abstraction (internal, output-identical)

No user-visible change and no schema change. This is the phase that makes
Phase 4 small.

```ts
export type TreatmentOption = {
  id: string;                 // "t:relining" or "combo:trenchless-package"
  label: string;
  treatments: TreatmentDef[]; // length 1 for a standalone treatment
  cost: number;
  projectedCondition: number;
  failureProbMultiplier: number;
  expectedLifeExtension: number;
  reasons: string[];
};

export function enumerateOptions(ctx, library, combinations): TreatmentOption[]
```

Phase 3 ships `enumerateOptions` returning **singletons only**, and moves
`recommendTreatment`, `buildCandidates`, and `candidateFor` onto it. The
combination arithmetic in §5 is written and unit-tested here, against
one-member options where it reduces to the identity.

**Acceptance test:** generate a work plan and run a scenario before and after;
assert identical output. A regression in this phase is otherwise invisible.

---

## Phase 4 — Treatment Combinations

**Schema**

```prisma
model TreatmentCombination {
  id             String  @id @default(cuid())
  organizationId String
  name           String            // "Trenchless package"
  description    String?
  enabled        Boolean @default(true)
  members        CombinationMember[]
  rules          CombinationRuleLink[]   // optional extra gate on the bundle
  @@unique([organizationId, name])
  @@map("treatment_combinations")
}

model CombinationMember {
  combinationId String
  treatmentId   String
  required      Boolean @default(true)   // false = optional member
  @@id([combinationId, treatmentId])
  @@map("treatment_combination_members")
}
```

Plus `Treatment.standaloneAllowed Boolean @default(true)`. Abandonment and
Replacement get it set false only if you want them *never* considered alone,
which is unlikely — see §7.

A combination is a candidate when **every required member independently
qualifies** under its own rules, and the combination's own rules (if any) pass.
Optional members join if they qualify. This keeps rule authorship in one place:
a combination never re-states a member's conditions.

**Work plan storage:** `WorkPlanItem` gains nullable `bundleId` and
`bundleName`. One row per treatment, as today, so `treatmentId` stays a real FK
and every existing read path, export, and Treatment Mix chart keeps working
untouched. Rows sharing a `bundleId` are one decision, displayed grouped.

**Enumeration cost:** combinations are hand-authored, so options per asset are
`treatments + combinations` — linear, not `2^n`. This is exactly the saving the
request anticipates.

---

## Phase 5 — Combination arithmetic and the new objective

### 5.1 Combining effects

These are modeling assumptions, not arithmetic facts. Each is published on the
Treatment Combinations page and each is a setting, not a constant.

| Quantity | Rule | Why |
| --- | --- | --- |
| **Cost** | Σ unit costs (each resolved through its own cost rules) **+ the single largest mobilization**, not the sum | One crew, one traffic plan, one bypass. Summing mobilization would make every bundle look expensive and the feature would never fire — this saving *is* the reason to bundle. |
| **Condition** | max of members' `conditionResetTo`, then add all `conditionGain` values, capped at 100 | A reset establishes a floor; gains are incremental on top. |
| **Failure probability** | product of members' multipliers | Independent mitigations compound. |
| **Life extension** | **max**, not sum | A liner and anodes on the same main do not give 50 + 15 years. Summing is the intuitive error and it inflates every LCCA. |
| **Annual maintenance** | sum | Each installed system is separately maintained. |

**Validation:** a combination containing two `conditionResetTo` treatments
(Replacement + Relining) is almost certainly an authoring error — warn on save,
naming both.

### 5.2 The ranking objective

```
Value = Criticality × Expected Benefit ÷ Cost per Unit
Cost per Unit = total estimated cost ÷ asset length (ft)
```

Guards this needs:

- **Length null or zero** → fall back to cost per asset (unit = 1) and label the
  ranking basis in the reason string. Never divide by zero; `criticality-formula.ts`
  already sets the precedent of returning a defensible value rather than `Infinity`.
- **"per each" treatments on a short segment** — a $9,000 valve on a 20 ft stub
  is $450/ft and outranks nothing. That is arguably correct, but it is a real
  behaviour change worth watching on the first run.

**This is added as a selectable ranking method on the scenario, alongside the
existing weighted sum — it does not replace it.** The current weighted sum
(`optimization.ts`) drives the Executive Dashboard, every saved work plan, and
the priority-score decomposition shown on each item. Swapping it silently would
change every number on the dashboard with no way to explain why. Scenarios
already carry their own criticality formula (`Scenario.criticalityModelId`);
this follows the same pattern — `Scenario.rankingMethod`.

---

## Phase 6 — Cleanup (one release after Phase 2)

- Drop `Treatment.applicableConditionMin/Max` and the `materials` /
  `diameterMin` / `diameterMax` / `qualifyMode` keys from `applicability`.
- Drop `Treatment.unitCost`, `costUnit`, `mobilizationCost`,
  `annualMaintenanceCost` once cost rows are the only reader.
- Remove `fromLegacyTree` and the `LEGACY_RULE` path.

Deliberately a separate release: if Phase 1 or 2 needs reverting, the old
columns still hold the truth.

---

# 5. Card layout

| Card | Tab | Contents |
| --- | --- | --- |
| **Treatments** | Modeling | The library. Per treatment: identity, effects, useful life, constraints, `standaloneAllowed`. Sections for **Costs** (editable) and **Rules** (picker). Read-only cost roll-up on the list page. |
| **Treatment Rules** | Modeling | Org-wide named rules, allow/block, "applied to N treatments / M combinations". Replaces the Decision Trees card. |
| **Treatment Combinations** | Modeling | Named bundles, members, optional gating rules, the published combining arithmetic. |

Costs stay a section rather than a card because a cost row cannot be authored
or understood without its treatment. Rules and Combinations become cards
because both are genuinely shared objects with their own lifecycle. Each new
card is automatically permissioned by registering it in
`src/config/settings-cards.ts`, which is the single registry feeding the
Settings page, the role permissions grid, and the breadcrumb map.

---

# 6. Decisions needed before Phase 5

Phases 0–4 can proceed on the recommendations already stated. These five change
what gets built and are worth settling first.

1. **Expected Benefit is undefined in the formula.** It needs one number.
   *Recommendation:* risk points removed (probability × consequence, before
   minus after) — already computed, already explainable, already on every work
   plan item. Alternative: expose it as a criticality-style formula so you can
   write `riskReduction * 2 + conditionGain`. That is more power and more rope.

2. **District = `AssetLocation.serviceArea`?** It is the only district-shaped
   field stored, and the map and work plan already treat it that way. If
   districts are a separate concept from service areas, that is its own field
   and its own import mapping, and it belongs in Phase 0.

3. **Largest mobilization, or something else?** §5.1 assumes one mobilization
   per bundle. If your combinations mix trenchless and open-cut work that would
   genuinely mobilize twice, the rule should be "largest per work method" and
   treatments need a `workMethod` attribute.

4. **Life extension = max.** Stated as the safe default. If a bundle's whole
   point is additive life, this needs to be per-combination rather than global.

5. **Should `standaloneAllowed` default false for anything?** Turning it off for
   Replacement means the model can *only* propose replacement inside a
   combination, which is probably not intended. My reading is that Abandonment
   and Replacement are standalone-**only** — the inverse restriction: they must
   never appear in a bundle. If so, the flag is better named
   `combinableWithOthers` and defaults true, with those two set false.

---

# 7. Suggestions beyond the request

- **Rule test panel.** The rule builder should show "matches 412 of 520
  waterlines" live, with a sample. The criticality formula editor already has a
  preview; a rule that silently matches nothing is the most likely authoring
  error and the cheapest to catch.
- **Where-used, before delete.** Deleting a shared rule must name every
  treatment, combination, and cost row that depends on it. `deleteTreatment`
  already refuses when work plan items exist — same pattern.
- **Rules are org-wide but treatments are per asset-type.** A condition rule is
  meaningful for pumps and waterlines both; a material rule is not. Consider an
  optional `assetTypeId` on `Rule` — null meaning "any" — before pumps arrive.
- **Cost effective-dating is in the schema and unused.** Phase 2 keeps the
  columns. If you want "2026 rates" as a first-class thing, that is a cost
  *book* per year rather than dates per row, and should be decided before the
  table fills up.
