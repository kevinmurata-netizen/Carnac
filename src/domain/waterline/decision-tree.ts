/**
 * Decision trees for treatment qualification.
 *
 * A treatment's condition/material/diameter window says whether it is
 * *technically* possible. A decision tree says whether it should be
 * *considered* — the policy layer on top: "only reline a main that serves
 * enough customers to justify the bypass", "never upsize unless there is a
 * capacity trigger".
 *
 * A tree is a group of conditions joined by AND or OR, and a group may hold
 * further groups, so precedence is explicit in the structure rather than
 * implied by an operator ranking nobody can see. Evaluation is deterministic
 * and returns a trace of every test taken: §32 requires every recommendation
 * be explainable, and a rule that silently excluded a treatment would be
 * exactly the kind of hidden reasoning that forbids.
 */

export type DecisionField =
  | "condition"
  | "ageYears"
  | "ageRatio"
  | "diameterInches"
  | "lengthFt"
  | "customersServed"
  | "riskScore"
  | "pof"
  | "cof"
  | "failuresLast10Years"
  | "material"
  | "criticality"
  | "serviceArea"
  | "pressureZone";

export const NUMERIC_FIELDS: DecisionField[] = [
  "condition",
  "ageYears",
  "ageRatio",
  "diameterInches",
  "lengthFt",
  "customersServed",
  "riskScore",
  "pof",
  "cof",
  "failuresLast10Years",
];

export const TEXT_FIELDS: DecisionField[] = ["material", "criticality", "serviceArea", "pressureZone"];

export const FIELD_LABELS: Record<DecisionField, string> = {
  condition: "Condition (WCI)",
  ageYears: "Age (years)",
  ageRatio: "Age ÷ expected life",
  diameterInches: "Diameter (in)",
  lengthFt: "Length (ft)",
  customersServed: "Customers served",
  riskScore: "Risk score",
  pof: "Probability of failure",
  cof: "Consequence of failure",
  failuresLast10Years: "Failures in last 10 years",
  material: "Material",
  criticality: "Criticality",
  // Named for what an operator calls it, qualified so it is traceable to the
  // stored field every other screen labels "Service Area".
  serviceArea: "District (service area)",
  pressureZone: "Pressure zone",
};

export function fieldType(field: DecisionField): "number" | "text" {
  return NUMERIC_FIELDS.includes(field) ? "number" : "text";
}

/** Inputs a tree can test. Mirrors AssetTreatmentContext, flattened. */
export type DecisionInput = {
  condition: number | null;
  ageYears: number | null;
  ageRatio: number | null;
  diameterInches: number | null;
  lengthFt: number | null;
  customersServed: number | null;
  riskScore: number | null;
  pof: number | null;
  cof: number | null;
  failuresLast10Years: number;
  material: string | null;
  criticality: string | null;
  serviceArea: string | null;
  pressureZone: string | null;
};

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export type Comparator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "notIn"
  | "isEmpty"
  | "notEmpty";

export type OperatorDef = {
  key: Comparator;
  label: string;
  types: Array<"number" | "text">;
  /** How many value inputs the condition needs. */
  values: 0 | 1 | 2;
};

export const OPERATORS: OperatorDef[] = [
  { key: "eq", label: "is", types: ["number", "text"], values: 1 },
  { key: "ne", label: "is not", types: ["number", "text"], values: 1 },
  { key: "gt", label: "is greater than", types: ["number"], values: 1 },
  { key: "gte", label: "is at least", types: ["number"], values: 1 },
  { key: "lt", label: "is less than", types: ["number"], values: 1 },
  { key: "lte", label: "is at most", types: ["number"], values: 1 },
  { key: "between", label: "is between", types: ["number"], values: 2 },
  { key: "in", label: "is one of", types: ["number", "text"], values: 1 },
  { key: "notIn", label: "is not one of", types: ["number", "text"], values: 1 },
  { key: "isEmpty", label: "has no value", types: ["number", "text"], values: 0 },
  { key: "notEmpty", label: "has a value", types: ["number", "text"], values: 0 },
];

export function operatorsFor(field: DecisionField): OperatorDef[] {
  const type = fieldType(field);
  return OPERATORS.filter((o) => o.types.includes(type));
}

export function operatorDef(key: Comparator): OperatorDef | undefined {
  return OPERATORS.find((o) => o.key === key);
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

export type Join = "AND" | "OR";

export type Condition = {
  kind: "condition";
  id: string;
  field: DecisionField;
  operator: Comparator;
  /** Kept as entered. Coerced at evaluation according to the field's type, so
   * the stored rule reads the way it was written. */
  value?: string;
  /** Upper bound, for `between`. */
  value2?: string;
};

export type Group = {
  kind: "group";
  id: string;
  join: Join;
  children: TreeNode[];
};

export type TreeNode = Condition | Group;

export type DecisionTree = {
  id: string;
  name: string;
  description?: string;
  /** A disabled tree is kept but takes no part in qualification, so a rule can
   * be parked without being lost. */
  enabled: boolean;
  root: Group;
};

/** How a treatment's allow rules combine. "any" reads each as an alternative
 * route to qualifying; "all" reads each as a separate gate every asset must
 * clear. Block rules ignore this — see `qualifiesUnderRules`. */
export type QualifyMode = "any" | "all";

/**
 * "allow" — an asset must match to qualify.
 * "block" — a match disqualifies it, whatever the allow rules say.
 *
 * Blocks are not sugar. Every gate here was originally phrased as a
 * permission, so writing an exclusion meant inverting each condition by hand
 * and getting `NOT (a AND b)` right. People get that wrong, and the mistake is
 * silent: the rule still evaluates, just against the wrong assets.
 */
export type RuleEffect = "allow" | "block";

/** A named, reusable qualification rule. Structurally a DecisionTree that
 * knows which way it points and who owns it. */
export type Rule = DecisionTree & {
  effect: RuleEffect;
  /** True for rules generated by the Phase 1 migration from the old technical
   * window and hard-coded gates. Only affects how they are explained. */
  isGenerated?: boolean;
};

export function newId(): string {
  return `n${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyGroup(join: Join = "AND"): Group {
  return { kind: "group", id: newId(), join, children: [] };
}

export function newCondition(field: DecisionField = "condition"): Condition {
  return { kind: "condition", id: newId(), field, operator: fieldType(field) === "number" ? "lt" : "eq", value: "" };
}

export function newTree(name: string): DecisionTree {
  return { id: newId(), name, enabled: true, root: emptyGroup("AND") };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type Trace = {
  label: string;
  pass: boolean;
  /** Present on conditions: what the asset actually held. */
  observed?: string;
  children?: Trace[];
};

export type TreeOutcome = { pass: boolean; trace: Trace };

function describeValue(condition: Condition): string {
  const def = operatorDef(condition.operator);
  if (!def || def.values === 0) return "";
  if (def.values === 2) return `${condition.value ?? "?"} and ${condition.value2 ?? "?"}`;
  return condition.value ?? "";
}

export function describeCondition(condition: Condition): string {
  const label = FIELD_LABELS[condition.field] ?? condition.field;
  const op = operatorDef(condition.operator)?.label ?? condition.operator;
  const value = describeValue(condition);
  return value ? `${label} ${op} ${value}` : `${label} ${op}`;
}

/** Human-readable rendering of a whole tree, for summaries and traces. */
export function describeNode(node: TreeNode): string {
  if (node.kind === "condition") return describeCondition(node);
  if (node.children.length === 0) return "no conditions";
  const parts = node.children.map((c) => (c.kind === "group" && c.children.length > 1 ? `(${describeNode(c)})` : describeNode(c)));
  return parts.join(node.join === "AND" ? " and " : " or ");
}

function observedOf(input: DecisionInput, field: DecisionField): number | string | null {
  const value = input[field];
  return value == null || value === "" ? null : (value as number | string);
}

function evaluateCondition(condition: Condition, input: DecisionInput): Trace {
  const observed = observedOf(input, condition.field);
  const type = fieldType(condition.field);
  const shown = observed == null ? "no value" : String(observed);

  const done = (pass: boolean): Trace => ({ label: describeCondition(condition), pass, observed: shown });

  if (condition.operator === "isEmpty") return done(observed == null);
  if (condition.operator === "notEmpty") return done(observed != null);

  // A segment with no recorded value fails every remaining test. Treating a
  // missing value as zero would make "condition is less than 25" true for
  // every never-inspected segment, quietly recommending capital work off data
  // that does not exist.
  if (observed == null) return done(false);

  if (condition.operator === "in" || condition.operator === "notIn") {
    const list = String(condition.value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const hit = list.some((v) => (type === "number" ? Number(v) === Number(observed) : v === String(observed)));
    return done(condition.operator === "in" ? hit : !hit);
  }

  if (type === "text") {
    const a = String(observed);
    const b = String(condition.value ?? "");
    switch (condition.operator) {
      case "eq":
        return done(a === b);
      case "ne":
        return done(a !== b);
      default:
        return done(false);
    }
  }

  const a = Number(observed);
  const b = Number(condition.value);
  if (Number.isNaN(b)) return done(false);

  switch (condition.operator) {
    case "eq":
      return done(a === b);
    case "ne":
      return done(a !== b);
    case "gt":
      return done(a > b);
    case "gte":
      return done(a >= b);
    case "lt":
      return done(a < b);
    case "lte":
      return done(a <= b);
    case "between": {
      const c = Number(condition.value2);
      if (Number.isNaN(c)) return done(false);
      // Written either way round: "between 20 and 5" means the same window.
      const [lo, hi] = b <= c ? [b, c] : [c, b];
      return done(a >= lo && a <= hi);
    }
    default:
      return done(false);
  }
}

function evaluateNode(node: TreeNode, input: DecisionInput, depth = 0): Trace {
  if (depth > 32) return { label: "stopped: nested too deeply", pass: true };
  if (node.kind === "condition") return evaluateCondition(node, input);

  const children = node.children.map((c) => evaluateNode(c, input, depth + 1));

  // A group with nothing in it constrains nothing, so it passes. That makes a
  // half-built rule permissive rather than silently excluding every asset.
  const pass =
    children.length === 0 ? true : node.join === "AND" ? children.every((c) => c.pass) : children.some((c) => c.pass);

  return { label: node.join === "AND" ? "All of" : "Any of", pass, children };
}

export function evaluateTree(tree: DecisionTree, input: DecisionInput): TreeOutcome {
  const trace = evaluateNode(tree.root, input);
  return { pass: trace.pass, trace };
}

/**
 * Whether an asset qualifies under a treatment's trees.
 *
 * No trees, or none enabled, means no policy gate at all — the treatment is
 * considered on its technical window alone.
 */
export function qualifies(
  trees: DecisionTree[],
  mode: QualifyMode,
  input: DecisionInput
): { pass: boolean; results: Array<{ tree: DecisionTree; outcome: TreeOutcome }> } {
  const active = trees.filter((t) => t.enabled);
  if (active.length === 0) return { pass: true, results: [] };

  const results = active.map((tree) => ({ tree, outcome: evaluateTree(tree, input) }));
  const pass = mode === "all" ? results.every((r) => r.outcome.pass) : results.some((r) => r.outcome.pass);
  return { pass, results };
}

export type RuleOutcome = {
  pass: boolean;
  /** The block rule that disqualified the asset, if one did. Named so the
   * refusal can be explained rather than merely asserted (SPEC §32). */
  blockedBy: Rule | null;
  /** Every rule that took part, with its trace. Disabled rules are absent. */
  results: Array<{ rule: Rule; outcome: TreeOutcome }>;
};

/**
 * Whether an asset qualifies under a set of rules.
 *
 * Blocks are evaluated first and are always AND-ed: one match is enough to
 * refuse, and `mode` does not soften that. An exclusion competing with
 * permissions on equal terms would mean "never abandon a main serving more
 * than 25 customers" could be overridden by any unrelated rule that happened
 * to pass, which is not what anyone writing that sentence means.
 *
 * With no allow rules at all there is no gate, so everything qualifies. That
 * makes a half-built configuration permissive rather than silently excluding
 * every asset — the same choice an empty group already makes.
 */
export function qualifiesUnderRules(rules: Rule[], mode: QualifyMode, input: DecisionInput): RuleOutcome {
  const active = rules.filter((r) => r.enabled);
  const results: RuleOutcome["results"] = [];

  for (const rule of active.filter((r) => r.effect === "block")) {
    const outcome = evaluateTree(rule, input);
    results.push({ rule, outcome });
    if (outcome.pass) return { pass: false, blockedBy: rule, results };
  }

  const allows = active.filter((r) => r.effect === "allow");
  if (allows.length === 0) return { pass: true, blockedBy: null, results };

  for (const rule of allows) results.push({ rule, outcome: evaluateTree(rule, input) });

  const allowResults = results.filter((r) => r.rule.effect === "allow");
  const pass =
    mode === "all" ? allowResults.every((r) => r.outcome.pass) : allowResults.some((r) => r.outcome.pass);

  return { pass, blockedBy: null, results };
}

export function countConditions(node: TreeNode): number {
  if (node.kind === "condition") return 1;
  return node.children.reduce((sum, c) => sum + countConditions(c), 0);
}

// ---------------------------------------------------------------------------
// Structural editing. Every operation returns a new tree.
// ---------------------------------------------------------------------------

function mapGroup(node: TreeNode, fn: (g: Group) => Group): TreeNode {
  if (node.kind === "condition") return node;
  const mapped = fn(node);
  return { ...mapped, children: mapped.children.map((c) => mapGroup(c, fn)) };
}

export function addToGroup(root: Group, groupId: string, child: TreeNode): Group {
  return mapGroup(root, (g) => (g.id === groupId ? { ...g, children: [...g.children, child] } : g)) as Group;
}

export function removeNode(root: Group, nodeId: string): Group {
  return mapGroup(root, (g) => ({ ...g, children: g.children.filter((c) => c.id !== nodeId) })) as Group;
}

export function updateCondition(root: Group, conditionId: string, patch: Partial<Condition>): Group {
  const walk = (node: TreeNode): TreeNode => {
    if (node.kind === "condition") return node.id === conditionId ? { ...node, ...patch } : node;
    return { ...node, children: node.children.map(walk) };
  };
  return walk(root) as Group;
}

export function setGroupJoin(root: Group, groupId: string, join: Join): Group {
  return mapGroup(root, (g) => (g.id === groupId ? { ...g, join } : g)) as Group;
}

// ---------------------------------------------------------------------------
// Validation of anything parsed from stored JSON
// ---------------------------------------------------------------------------

const COMPARATORS = new Set<string>(OPERATORS.map((o) => o.key));
const FIELDS = new Set<string>(Object.keys(FIELD_LABELS));

export function isValidNode(value: unknown, depth = 0): value is TreeNode {
  if (depth > 32 || !value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;

  if (node.kind === "condition") {
    return (
      typeof node.id === "string" &&
      typeof node.field === "string" &&
      FIELDS.has(node.field) &&
      typeof node.operator === "string" &&
      COMPARATORS.has(node.operator)
    );
  }

  if (node.kind === "group") {
    return (
      typeof node.id === "string" &&
      (node.join === "AND" || node.join === "OR") &&
      Array.isArray(node.children) &&
      node.children.every((c) => isValidNode(c, depth + 1))
    );
  }

  return false;
}

export function isValidTree(value: unknown): value is DecisionTree {
  if (!value || typeof value !== "object") return false;
  const tree = value as Record<string, unknown>;
  return (
    typeof tree.id === "string" &&
    typeof tree.name === "string" &&
    tree.name.trim().length > 0 &&
    typeof tree.enabled === "boolean" &&
    isValidNode(tree.root) &&
    (tree.root as Record<string, unknown>).kind === "group"
  );
}

// ---------------------------------------------------------------------------
// Migration from the original binary decision tree
// ---------------------------------------------------------------------------

type LegacyNode =
  | { kind: "leaf"; consider: boolean; note?: string }
  | { kind: "branch"; field: string; operator: string; value: unknown; whenTrue: LegacyNode; whenFalse: LegacyNode };

const LEGACY_OPERATORS: Record<string, Comparator> = {
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
  "==": "eq",
  "!=": "ne",
  in: "in",
  "not in": "notIn",
};

/** The negation of a comparator, for the branch a legacy tree took when its
 * test was false. */
const NEGATED: Partial<Record<Comparator, Comparator>> = {
  lt: "gte",
  lte: "gt",
  gt: "lte",
  gte: "lt",
  eq: "ne",
  ne: "eq",
  in: "notIn",
  notIn: "in",
};

/**
 * Converts a binary decision tree into the grouped form.
 *
 * Every root-to-leaf path ending in "consider" becomes one AND group, and
 * those groups are OR'd together — the tree's disjunctive normal form, which
 * is exact rather than approximate. A test taken down the false branch is
 * recorded as its negation, so the converted rule accepts precisely the assets
 * the original did.
 */
export function fromLegacyTree(value: unknown, name: string): DecisionTree | null {
  if (!value || typeof value !== "object") return null;

  const paths: Condition[][] = [];

  const walk = (node: LegacyNode, taken: Condition[]): void => {
    if (node.kind === "leaf") {
      if (node.consider) paths.push(taken);
      return;
    }
    const base = LEGACY_OPERATORS[node.operator];
    if (!base || !FIELDS.has(node.field)) return;

    const raw = Array.isArray(node.value) ? node.value.join(", ") : String(node.value);
    const field = node.field as DecisionField;

    walk(node.whenTrue, [...taken, { kind: "condition", id: newId(), field, operator: base, value: raw }]);

    const inverse = NEGATED[base];
    if (inverse) {
      walk(node.whenFalse, [...taken, { kind: "condition", id: newId(), field, operator: inverse, value: raw }]);
    }
  };

  try {
    walk(value as LegacyNode, []);
  } catch {
    return null;
  }

  if (paths.length === 0) return null;

  // A single path needs no wrapping OR; its conditions sit straight in the root.
  const root: Group =
    paths.length === 1
      ? { kind: "group", id: newId(), join: "AND", children: paths[0] }
      : {
          kind: "group",
          id: newId(),
          join: "OR",
          children: paths.map((conditions) => ({
            kind: "group" as const,
            id: newId(),
            join: "AND" as const,
            children: conditions,
          })),
        };

  return { id: newId(), name, description: "Converted from the original decision tree", enabled: true, root };
}
