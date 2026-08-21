/**
 * Decision trees for treatment applicability.
 *
 * A treatment's condition/material/diameter window says whether it is
 * *technically* possible. A decision tree says whether it should be
 * *considered* — the policy layer on top: "only reline a main that serves
 * enough customers to justify the bypass", "never upsize unless there is a
 * capacity trigger".
 *
 * The tree is a plain binary tree so evaluation is deterministic and the path
 * taken can be replayed back to the user. That matters: §32 requires every
 * recommendation be explainable, and a rule that silently excluded a
 * treatment would be exactly the kind of hidden reasoning that forbids.
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
  | "criticality";

export type NumericOperator = "<" | "<=" | ">" | ">=" | "==" | "!=";
export type SetOperator = "in" | "not in";
export type DecisionOperator = NumericOperator | SetOperator;

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

export const TEXT_FIELDS: DecisionField[] = ["material", "criticality"];

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
};

export type DecisionLeaf = {
  kind: "leaf";
  id: string;
  /** Whether the treatment should be considered when evaluation lands here. */
  consider: boolean;
  note?: string;
};

export type DecisionBranch = {
  kind: "branch";
  id: string;
  field: DecisionField;
  operator: DecisionOperator;
  value: number | string | string[];
  whenTrue: DecisionNode;
  whenFalse: DecisionNode;
};

export type DecisionNode = DecisionLeaf | DecisionBranch;

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
};

export type DecisionOutcome = {
  consider: boolean;
  /** Human-readable trace of every test taken, for explainability. */
  path: string[];
  /** Note from the leaf that decided it, when present. */
  note?: string;
};

export function newLeafId(): string {
  return `n${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultTree(): DecisionNode {
  return { kind: "leaf", id: newLeafId(), consider: true };
}

function describeValue(value: number | string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function describeTest(node: DecisionBranch): string {
  return `${FIELD_LABELS[node.field]} ${node.operator} ${describeValue(node.value)}`;
}

function compare(actual: number | string | null, operator: DecisionOperator, value: number | string | string[]): boolean {
  if (operator === "in" || operator === "not in") {
    const list = (Array.isArray(value) ? value : String(value).split(",")).map((v) => String(v).trim());
    const hit = actual != null && list.includes(String(actual));
    return operator === "in" ? hit : !hit;
  }

  // An unknown input cannot satisfy a numeric comparison. Treating null as 0
  // would silently make "condition < 25" true for never-inspected assets.
  if (actual == null) return false;

  const a = typeof actual === "number" ? actual : String(actual);
  const b = typeof actual === "number" ? Number(value) : String(value);
  if (typeof a === "number" && Number.isNaN(b as number)) return false;

  switch (operator) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    default:
      return false;
  }
}

export function evaluateTree(node: DecisionNode | null | undefined, input: DecisionInput): DecisionOutcome {
  // No tree means no extra policy gate — the treatment is considered.
  if (!node) return { consider: true, path: [] };

  const path: string[] = [];
  let current: DecisionNode = node;
  // Depth guard: a hand-edited tree could in principle be malformed.
  for (let depth = 0; depth < 64; depth++) {
    if (current.kind === "leaf") {
      return { consider: current.consider, path, note: current.note };
    }
    const actual = input[current.field] as number | string | null;
    const result = compare(actual, current.operator, current.value);
    path.push(
      `${describeTest(current)} → ${result ? "yes" : "no"} (observed ${actual ?? "unknown"})`
    );
    current = result ? current.whenTrue : current.whenFalse;
  }
  return { consider: true, path: [...path, "stopped: tree nested too deeply"] };
}

/** Split a leaf into a branch, keeping the old leaf on the true side. */
export function splitLeaf(tree: DecisionNode, leafId: string, test: Omit<DecisionBranch, "kind" | "id" | "whenTrue" | "whenFalse">): DecisionNode {
  return mapNode(tree, (node) => {
    if (node.id !== leafId || node.kind !== "leaf") return node;
    return {
      kind: "branch",
      id: newLeafId(),
      ...test,
      whenTrue: { ...node, id: newLeafId() },
      whenFalse: { kind: "leaf", id: newLeafId(), consider: !node.consider },
    };
  });
}

/** Collapse a branch back to a single leaf, discarding both subtrees. */
export function collapseBranch(tree: DecisionNode, branchId: string): DecisionNode {
  if (tree.kind === "branch" && tree.id === branchId) {
    return { kind: "leaf", id: newLeafId(), consider: true };
  }
  return mapNode(tree, (node) => {
    if (node.id !== branchId || node.kind !== "branch") return node;
    return { kind: "leaf", id: newLeafId(), consider: true };
  });
}

export function updateNode(
  tree: DecisionNode,
  nodeId: string,
  patch: Partial<DecisionBranch> & Partial<DecisionLeaf>
): DecisionNode {
  return mapNode(tree, (node) =>
    node.id === nodeId ? ({ ...node, ...(patch as object) } as DecisionNode) : node
  );
}

function mapNode(node: DecisionNode, fn: (n: DecisionNode) => DecisionNode): DecisionNode {
  const mapped = fn(node);
  if (mapped.kind === "branch") {
    return {
      ...mapped,
      whenTrue: mapNode(mapped.whenTrue, fn),
      whenFalse: mapNode(mapped.whenFalse, fn),
    };
  }
  return mapped;
}

export function countLeaves(node: DecisionNode): number {
  return node.kind === "leaf" ? 1 : countLeaves(node.whenTrue) + countLeaves(node.whenFalse);
}

/** Structural validation of a tree parsed from stored JSON. */
export function isValidTree(value: unknown, depth = 0): value is DecisionNode {
  if (depth > 64 || !value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (node.kind === "leaf") return typeof node.consider === "boolean" && typeof node.id === "string";
  if (node.kind === "branch") {
    return (
      typeof node.id === "string" &&
      typeof node.field === "string" &&
      typeof node.operator === "string" &&
      node.value !== undefined &&
      isValidTree(node.whenTrue, depth + 1) &&
      isValidTree(node.whenFalse, depth + 1)
    );
  }
  return false;
}
