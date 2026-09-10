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

**No standalone flag.** An earlier draft proposed `Treatment.standaloneAllowed`,
reading "abandonment and replacement would be standalone" as a restriction.
Confirmed 2026-09-05 that it was a description of the usual case, not a rule:
someone might still want to bundle either. So combinations are purely
additive — defining a bundle never removes the option of applying its members
on their own, and there is no flag to get backwards.

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

### Found while building Phase 4 — read before Phase 5

**A combination changes recommendations but never reaches the work plan.**
Measured on the full network with a "Spot Repair + Valve Replacement" bundle
defined: 80 of 222 recommendations switched to it, identified need fell from
$46.3M to $25.1M — and the generated work plan contained *zero* bundle rows.

The cause predates combinations. `buildCandidates` picks **one option per
asset**, by highest life-cycle saving, and only that winner is handed to the
optimizer — which then ranks assets by a completely different, weighted
objective. A bundle always costs more than its cheapest member while its
incremental benefit is discounted over time, so it loses that first contest
almost always. Three separate bundles were tried, including ones built on the
life-cycle winner; none was ever funded.

Two consequences worth deciding on:

1. **The per-asset filter and the optimizer disagree about what "best" means.**
   Whatever Expected Benefit turns out to be (§6.1), it should probably decide
   both, or the work plan will keep discarding options the ranking would have
   preferred.
2. **A bundle of cheap patches can clear a guard neither member clears.**
   `MIN_RISK_REDUCTION_PCT` (25%) exists to stop a cheap patch headlining on a
   failing main. Spot Repair alone cuts risk 20% and Valve Replacement 10%, but
   bundled they compound to 28% — over the bar, at a fraction of renewal cost.
   That is how 43 assets moved off Rehabilitation. The threshold was calibrated
   against single treatments and has not been re-examined for bundles.

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

**Superseded 2026-09-10 by §5.4.** The original form was:

```
Value = Criticality × Expected Benefit ÷ Cost per Unit
Cost per Unit = total estimated cost ÷ asset length (ft)
```

**Settled 2026-09-08.** Expected Benefit is a weighted average of three scores;
Criticality is removed from those scores and applied once, as the multiplier.
§5.3 specifies it.

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

### 5.3 Expected Benefit

**Settled 2026-09-08.** Expected Benefit is what a treatment *achieves*.
Criticality is what the asset is *worth*. Keeping them apart is the whole point
of the formula's shape, and it is why criticality has to be taken out of the
benefit side entirely rather than merely de-weighted.

```
Expected Benefit = wC · Condition improvement
                 + wR · Risk reduction        ← computed criticality-free
                 + wL · Life-cycle saving
                   (wC + wR + wL normalized to 1)

Value = Criticality × Expected Benefit ÷ Cost per Unit
```

#### The three components

All three already exist as objectives in `optimization.ts` and are already
min-max normalized to 0–100 across the candidate set. Nothing new is computed;
what changes is which of them are in the average, and how risk is derived.

| Component | Raw value | Comes from |
| --- | --- | --- |
| **Condition improvement** | WCI points restored | `conditionResetTo` / `conditionGain`, combined per §5.1 |
| **Risk reduction** | Risk points removed | POF × COF, **with the Criticality factor excluded** — see below |
| **Life-cycle saving** | Cost avoided vs. leaving the asset alone | The existing LCCA comparison |

Condition earns its own term because risk points are blind to it:
`riskReduction` moves only with `failureProbMultiplier`, so Cathodic Protection
(×0.65, +10 points) and Coating (×0.6, reset to 65) score almost identically on
risk despite very different outcomes. Dropping condition would make the model
unable to tell a patch from a renewal.

#### Taking criticality out of the risk score

This is the part that makes the formula honest, and it is a step further than
this document previously recommended. Zeroing the `criticality` **objective
weight** removes the explicit term, but criticality would still be inside the
risk term: `riskScore = POF × COF`, and `COF_WEIGHTS` includes
`CRITICALITY: 0.3` (`risk.ts`). Left alone, `Criticality × RiskReduction` is
roughly criticality squared, and large mains serving many customers dominate
the ranking for a reason no reader could see in the decomposition.

The fix needs no new arithmetic. `combineFactors` divides by the **sum of the
weights present**, so passing a COF weight map with `CRITICALITY: 0`
renormalizes the remaining three automatically:

| Factor | Standard COF | Benefit-side COF |
| --- | --- | --- |
| Customers Served | 0.35 | 0.35 / 0.7 = **0.50** |
| Criticality | 0.30 | **0** |
| Diameter | 0.20 | 0.20 / 0.7 = **0.286** |
| Customer Type | 0.15 | 0.15 / 0.7 = **0.214** |

Only the benefit calculation uses this map. The stored `riskScore` on the asset,
the risk bands, the Risk page and the dashboard all keep the standard weights —
this is a different question being asked of the same inputs, not a redefinition
of risk.

Note what survives, deliberately: customers served and customer type stay in the
benefit-side COF. They describe how much failure *hurts*, which is part of what a
treatment averts. Only the Criticality factor moves to the multiplier, because
only it is re-applied there.

#### Criticality, the multiplier

One value per asset, 0–100, from whichever source is active:

- **A user formula**, when a `CriticalityModel` is active for the asset type —
  or when the scenario names one in `Scenario.criticalityModelId`.
- **The risk-based default** otherwise: `computeCriticalityScore` in `risk.ts`,
  the weighted COF rescaled `(cof − 1) / 4 × 100`.

Production today has no active formula, so the default applies. Worth stating
plainly: that default *is* a rescale of the full COF, so under it the multiplier
and the benefit-side risk term still share their other inputs. They are no
longer the same number squared, which was the actual defect, but a scenario that
wants criticality to mean something independent of risk should carry a formula
that says so. The Criticality page exists for exactly that.

#### The weights

`wC`, `wR`, `wL` are user-assignable, normalized so that 30/40/20 and 3/4/2 rank
identically — the rule `normalizeWeights` already follows.

| Weight | Default | Why |
| --- | --- | --- |
| Condition improvement | **0.30** | Same as today's `DEFAULT_WEIGHTS` |
| Risk reduction | **0.40** | Same as today |
| Life-cycle saving | **0.20** | Same as today |

Defaults are the current weights with criticality's 0.10 simply absent;
normalization redistributes it in proportion, so a scenario that changes nothing
gets the closest available analogue of today's ranking rather than an arbitrary
new one. Set to 0.33 / 0.33 / 0.33 for a plain average.

**Where they are set today.** One place only: the **Generate Work Plan form** on
`/work-plan`, as four number inputs — `wCondition`, `wRisk`, `wLcc`,
`wCriticality` — validated 0–100 each in `work-plan/actions.ts`, with the sum
required to be above zero. They are entered per generation run and passed
straight into `generateWorkPlan`.

`DEFAULT_WEIGHTS` in `optimization.ts` is **not** a stored setting. It supplies
the form's default values and the demo baseline plan (`ensureBaselineWorkPlan`),
nothing more. There is no org-level objective-weights record, and `Scenario`
carries `criticalityModelId` but no weights of its own.

So this phase has to add somewhere for them to live. Three gaps, in the order
they matter:

1. **The generated plan does not record what produced it.** `WorkPlan` stores
   `name`, `startYear`, `endYear` and its items — not the weights. The per-item
   `reasonExplanation` captures them in prose via `explainPriority`, which is
   how they are recoverable at all today, but nothing structured survives. Two
   plans generated a week apart under different weights are indistinguishable as
   data. **Store the weights on `WorkPlan`** — a small `Json` column, the same
   shape the form submits. This is worth doing regardless of the rest.
2. **A scenario cannot hold a weighting.** "What if we chased risk only" should
   be a saved scenario, not a number retyped into a form each time and
   remembered by whoever typed it. `Scenario.criticalityModelId` is the
   precedent: nullable, meaning "use the default unless someone deliberately
   made this scenario differ". **Add `Scenario.objectiveWeights Json?`** and let
   the form inherit from the selected scenario.
3. **An org default would be nice and is the least urgent.** Once 1 and 2 exist,
   a shipped constant as the fallback is defensible; a settings screen for it is
   a convenience, not a correctness fix.

The form itself needs the criticality input removed once this ranking method is
selected — the whole point is that criticality is no longer one weight among
four. Since §5.2 keeps the existing weighted sum as a selectable alternative,
the form shows four inputs for that method and three for this one.

A guard worth having: **all three weights zero**. `normalizeWeights` returns the
defaults when the total is ≤ 0 and `work-plan/actions.ts` already rejects the
submission, which between them is the right instinct — but for a three-term
average the reason string should say a default was substituted rather than
quietly answering a different question than the one asked.

#### One normalization set, so one number decides both

Min-max normalization is relative to the set being compared, so the set has to
be named. **Normalize across every option on every asset in the run** — not per
asset, and not per treatment.

This is what resolves finding 1 from Phase 4. `buildCandidates` currently picks
one option per asset by highest life-cycle saving, then hands only that winner
to an optimizer that ranks by a different objective — which is why a bundle that
won 80 recommendations reached the work plan zero times. With a single
normalization set, Expected Benefit decides *which option an asset gets* and
`Value` decides *which assets get funded*, and the two can no longer disagree
about what "best" means.

The cost: adding one extreme asset rescales everyone, so scores are comparable
within a run and not across runs. That is already true of the existing
optimizer, so it is not a new property — but the ranking output should not be
stored and compared against a later run's as though it were absolute.

#### Units, and what the number is not

Criticality (0–100) × Benefit (0–100) ÷ dollars-per-foot. `Value` is an ordinal
ranking figure, not a rate of return and not a currency. It orders a candidate
set; it does not mean anything on its own, and the UI should not print it
without the decomposition beside it.

#### Explainability

SPEC §32 requires every recommendation to carry its reasoning, and
`explainPriority` already decomposes a weighted sum into per-objective
contributions. It extends to this with the terms it already has:

```
Priority 61/100 — Condition Improvement 18 pts (weight 30%),
Risk Reduction 28 pts (weight 40%), Life Cycle Cost 15 pts (weight 20%);
× Criticality 82 ÷ $310/ft → Value 16.1
```

The multiplier and the divisor are shown as themselves rather than folded in,
which is the reason for applying criticality once and explicitly.

### 5.4 The Priority Score

**Settled 2026-09-10.** §5.2's `÷ Cost per Unit` divided by length to keep the
ranking from preferring whatever was cheapest. That worked, but it buried two
separate judgements — what counts as "a big piece of work", and which kinds of
work the utility wants — inside one hard-coded division. Both are now terms a
user sets:

```
Priority Score = Criticality × Scale Factor × Category Weight × Expected Benefit
                 ÷ Total Cost
```

| Term | Where it is set | Shape |
| --- | --- | --- |
| Criticality | Settings › Criticality, or the risk-based default | 0–100 score |
| Scale Factor | Settings › Scale Factor | Formula over the asset's fields; a multiplier, not clamped |
| Category Weight | Settings › Scenario Weights, chosen per scenario | Multiplier per treatment category, 1 = neutral |
| Expected Benefit | §5.3, weighted by Benefit Weight | 0–100 score |
| Total Cost | The option's own price | Dollars |

**Why total cost rather than cost per unit.** With Scale Factor in the numerator,
`× length ÷ total cost` is arithmetically what `÷ (total cost ÷ length)` always
was. Writing it this way makes the length assumption a value someone chose
rather than a step in a formula, and lets an organization that measures size by
customers served, diameter, or a blend say so.

**Day one is neutral.** Scale Factor ships seeded as `LENGTH` and active;
Category Weight ships seeded as all-ones and default. Both reproduce §5.2
exactly, so turning the new formula on does not by itself move a single
project.

**Guards.**

- **Scale Factor unavailable** — no active formula, an expression that no longer
  parses, or an asset missing a field it reads — falls back to 1, never 0. A gap
  in the data should cost an asset its size advantage, not its place in the
  plan.
- **Category Weight is not normalized**, unlike Benefit Weight. Those are shares
  of one score, so 3/4/2/1 must rank identically to 30/40/20/10. These are
  multipliers, so 1 has to keep meaning "leave this category alone".
- **Zero is a real answer** for a category weight: the option scores nothing and
  is never funded. That is an exclusion expressed as a weight, and the UI says
  so out loud rather than leaving it to be discovered from an empty plan.
  Negative is refused — it would flip the sign and rank the best option last.
- **Total cost zero or negative** keeps §5.2's rule: never divide by zero, return
  a defensible value and say so in the reason string.

#### Measured 2026-09-10, and unresolved

Implemented and run against the 260-segment network, the formula ranks **1,364
options over 218 segments (191 of them combinations) in about 660 ms**. It also
does something the specification did not anticipate, and this is the most
important thing in this section:

| Category | Options | Median cost | Median benefit | Median priority |
| --- | --- | --- | --- | --- |
| Repair | 538 | $11,145 | 5.6 | **55.8** |
| Rehabilitate | 465 | $329,370 | 17 | 6.0 |
| Renew | 140 | $699,446 | 42 | 5.9 |
| Retire | 3 | $100,585 | 27.8 | 20.9 |
| Assess | 218 | $18,236 | 0 | 0 |

**The top 100 is 100 Repair.** The first Rehabilitate is at rank 443, the first
Renew at rank 543.

The cause is not a bug, it is the arithmetic meeting the data. Cost varies
**63-fold** between a median repair and a median renewal. Benefit varies
**7.5-fold**, because Expected Benefit is min-max normalized onto 0–100 and that
compresses the range. Dividing a compressed numerator by an uncompressed
denominator hands the ranking to whatever is cheapest, by roughly the ratio of
the two spreads.

**Category Weight cannot fix this.** It was the obvious lever and it was
measured: `Renewal Push` (Renew ×1.6) moves the first renewal from rank 543 to
375. Closing a gap this size would need a multiplier near 10, at which point the
weighting is not expressing policy, it is cancelling an artefact.

**Ranking by cost-efficiency is not self-evidently wrong.** Under a budget, a
hundred repairs at 5.6 benefit genuinely beat one renewal at 42. The defect is
narrower and sharper than "cheap work wins": it is that **a patch on a failing
main does not fix the main**, and the Priority Score has no equivalent of the
override `recommendTreatment` already carries for exactly this
(`MIN_RISK_REDUCTION_PCT`, §5.3 "Still open"). The treatment *rules* already gate
patches out of the very worst assets — on WL-0225 at WCI 2.2 the only priced
options are Replacement and Inspection, and Replacement wins — but between
roughly WCI 25 and 50 the patches are still applicable and they dominate.

**The candidate fix**, not yet specified or built: the Priority Score inherits
the effectiveness floor, so an option that cuts risk by less than the floor
cannot be the priority pick on an asset in Poor condition or worse. That makes
it one guard shared by both rankings rather than one ranking quietly ignoring
the other's professional judgement. Expressing the floor in absolute risk points
rather than a percentage remains the open question it already was.

Until that is settled, the ranked list is shown with its category mix above it,
because a list of a hundred patches is a statement about the cost spread and
should not be read as a finding about the network.

**A mixed-category bundle** reports the category of its most committing member
(`CATEGORY_RANK` in `treatment.ts`), so a bundle containing a replacement is
weighted as renewal. This is already how combinations report their category
everywhere else; a cost-weighted blend across members was considered and
rejected as harder to explain than it is accurate.

#### Still open, and affected by this

The **25% `MIN_RISK_REDUCTION_PCT` guard** (finding 2, Phase 4) is unresolved
and interacts directly with this. It was calibrated against single treatments,
and a bundle of cheap patches can clear it when neither member does. It is
already live in production: Leak Repair + Spot Repair clears the bar at ~32%
risk reduction for $26k and displaces Rehabilitation at 65% for $731k, because
on cost-per-unit-benefit the bundle genuinely wins. Whether that is the right
answer is a policy question this formula sharpens rather than settles — a guard
expressed as a floor on absolute risk points removed, rather than a percentage,
is the obvious candidate and is not yet specified.

---

## Phase 6 — Cleanup

Superseded columns and tables, dropped once nothing reads them. Deliberately a
separate release from the phases that replaced them: while the old columns
still hold the truth, Phases 1–2 can be reverted. Dropping them is what cashes
that insurance in, so it should not happen in the same release as anything
still being watched.

**This is not a migration-only phase.** Several of the columns below are still
read by live code, so each one needs its readers rewritten first. Surveyed
2026-09-08; check again before starting, since the survey is the part that goes
stale.

### 6.1 Applicability window → rules

Superseded by Treatment Rules in Phase 1 and by the rule tree in Phase 5's
first slice.

| Drop | Blocked by |
| --- | --- |
| `Treatment.applicableConditionMin` / `Max` | Used as a **sort key** in `treatment-config.ts` (×2), `admin.ts` and `treatments.ts`, and rendered as a `conditionRange` string by `admin.ts` and `listTreatments` — which the Treatment Library table on Treatment Planning still shows |
| `applicability.materials` / `diameterMin` / `diameterMax` | `listTreatments` renders `materials`; check `toDef` before dropping |
| `Treatment.qualifyMode` | Superseded by `Treatment.ruleTree`; `getTreatmentRules` still falls back to it via `ruleTreeFromFlat` for treatments saved before the tree existed |

Two traps here. The sort order has to be replaced with something meaningful —
name, or category — rather than silently dropped, or the Treatments list
reorders for no reason a reader can see. And `conditionRange` has no rule-based
equivalent: a treatment gated by "Condition 20-55" *and* "Diameter at least 6"
cannot be reduced to one range, so that column should be removed rather than
recomputed.

**`qualifyMode` is not only a treatment column.** `TreatmentCombination` has
its own `qualifyMode` and it is live — `loadCombinations` reads it and
`enumerateOptions` gates bundles on it. Drop the one on `Treatment`; leave the
combination's alone.

### 6.2 Cost columns → cost rates

Superseded by `TreatmentCostRate` in Phase 2.

- Drop `Treatment.unitCost`, `costUnit`, `mobilizationCost`,
  `annualMaintenanceCost`.
- Readers: `listTreatments` (rendered on Treatment Planning's library table),
  and `createTreatment` / `ensureTreatments`, which still write them.
- `createTreatmentAction` copies the fallback rate into these columns on
  create. That copy becomes dead and should go with them.

### 6.3 Superseded tables

- **`treatment_rules`** (`TreatmentRule`) — the pre-Phase-1 per-treatment rule
  rows. Only surviving reader is a `deleteMany` in `deleteTreatment` and the
  `rules: true` include in `listTreatments`.
- **`treatment_costs`** (`TreatmentCost`) — the `Initial` / `Maintenance` pair
  written at create time. Same shape: a `deleteMany` in `deleteTreatment`, and
  the `costs: true` include.

Both are still *written* by `ensureTreatments` and `createTreatment`. Stop
writing them one release before dropping them, or a rollback lands on rows that
no longer exist.

### 6.4 Legacy decision trees

- Remove `fromLegacyTree` in `decision-tree.ts`. Already unreferenced — this
  one is a straight deletion.

### 6.5 Rename the Decision Trees route

The card is titled **Treatment Rules** and the page is at
`/settings/decision-trees`. Closing that gap is cheap in code and expensive in
data, because two tables key on the href:

- `role_permissions.resource` stores `card:/settings/decision-trees`.
  `resourceKey()` is `` `${kind}:${href}` ``, and `allResourceKeys()` rejects
  anything not derived from a current card — so a rename orphans every stored
  permission row for this card and silently drops the role restrictions on it.
- `navigation_labels.href` stores any per-organization rename of the page
  title, keyed the same way.

So the rename needs: the route moved, a permanent redirect from the old path
(external links and the rule-link deep links written in Phase 5 both use it),
and a data migration updating both tables. Worth doing — but it is its own
change with its own risk, and it does not belong in the same release as the
column drops.

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
what gets built and are worth settling first. **1 and 5 are settled; 2, 3 and 4
remain open.**

1. ~~**Expected Benefit is undefined in the formula.**~~ **Settled 2026-09-08:
   a weighted average of condition improvement, risk reduction and life-cycle
   saving, with criticality removed from all three and applied once as the
   multiplier. The three weights are user-assignable. Specified in §5.3.**

   Two things found while investigating it, both of which shaped the answer:

   - **Risk points are blind to condition.** `riskReduction` moves only with
     `failureProbMultiplier`; a treatment's `conditionResetTo` / `conditionGain`
     never enters it. So Cathodic Protection (×0.65, +10) and Coating (×0.6,
     reset to 65) score almost identically on risk, despite very different
     outcomes. The current optimizer avoids this by scoring
     `conditionImprovement` as its own objective at weight 0.30.
   - **Criticality is already inside risk.** `riskScore = POF × COF`, and COF
     is a weighted blend whose factors include Criticality itself
     (`risk.ts` `combineFactors`). With no criticality formula active — which
     is production today — the stored criticality score is a straight rescale
     of that same COF. So `Criticality × RiskReduction` is roughly COF², and
     large mains serving many customers would dominate for reasons no reader
     could see.

   *What was decided.* The recommendation had been to zero criticality's
   **objective weight** and keep the other three terms. That was half the fix:
   it removes the explicit criticality term but leaves criticality inside the
   risk term via `COF_WEIGHTS.CRITICALITY`, so `Criticality × RiskReduction`
   stays roughly criticality squared. The settled design takes criticality out
   of the risk score as well — a COF weight map with `CRITICALITY: 0`, which
   `combineFactors` renormalizes on its own — so criticality is applied exactly
   once, where it can be read. The formula keeps its shape and
   `explainPriority` still decomposes every term.

   Two alternatives were not taken: risk points alone with the multiplier
   dropped (correct on double-counting but condition-blind, so it cannot tell a
   patch from a renewal), and a user-written formula in the criticality
   expression language (most power, most rope, and keeping the units
   commensurable becomes the author's problem). The weighted average with
   user-assignable weights reaches most of the second option's flexibility while
   the terms stay named and explainable.

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

5. ~~**Should `standaloneAllowed` default false for anything?**~~ **Settled
   2026-09-05: no flag at all.** "Abandonment and Replacement would be
   standalone" described what is typical, not a restriction — someone might
   still bundle either. Combinations are additive: defining a bundle never
   removes the option of applying its members alone.

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
