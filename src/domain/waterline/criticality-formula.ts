/**
 * The criticality formula language.
 *
 * A small arithmetic language over an asset's own fields — enough to say
 * "hospitals on big mains matter more than houses on small ones" and no more:
 *
 *   (CUSTOMERS_SERVED / 50) + CRITICALITY * 10 + clamp(AGE_YEARS / 2, 0, 20)
 *
 * Parsed into a tree and walked, never evaluated as JavaScript. That is not
 * caution for its own sake: these expressions are typed by one administrator
 * but run against every asset on every model run, so a formula must be unable
 * to reach anything except the numbers it was given. A hand-written parser is
 * also what makes an error message able to say *where* the problem is, which
 * `eval` in a try/catch never could.
 */

export type Token =
  | { kind: "number"; value: number; at: number }
  | { kind: "field"; name: string; at: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/"; at: number }
  | { kind: "paren"; value: "(" | ")"; at: number }
  | { kind: "comma"; at: number };

export type Node =
  | { kind: "number"; value: number }
  | { kind: "field"; name: string }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node }
  | { kind: "negate"; operand: Node }
  | { kind: "call"; name: FunctionName; args: Node[] };

export const FUNCTIONS = {
  min: { arity: 2, help: "min(a, b) — the smaller of two values" },
  max: { arity: 2, help: "max(a, b) — the larger of two values" },
  clamp: { arity: 3, help: "clamp(value, low, high) — hold a value inside a range" },
  round: { arity: 1, help: "round(value) — to the nearest whole number" },
} as const;

export type FunctionName = keyof typeof FUNCTIONS;

export class FormulaError extends Error {
  constructor(
    message: string,
    /** Character offset the problem starts at, for pointing at it. */
    readonly at: number
  ) {
    super(message);
    this.name = "FormulaError";
  }
}

const FIELD_START = /[A-Za-z_]/;
const FIELD_CHAR = /[A-Za-z0-9_]/;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const c = input[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === "(" || c === ")") {
      tokens.push({ kind: "paren", value: c, at: i++ });
      continue;
    }

    if (c === ",") {
      tokens.push({ kind: "comma", at: i++ });
      continue;
    }

    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ kind: "op", value: c, at: i++ });
      continue;
    }

    if (/[0-9.]/.test(c)) {
      const start = i;
      while (i < input.length && /[0-9.]/.test(input[i])) i++;
      const raw = input.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new FormulaError(`"${raw}" is not a number`, start);
      tokens.push({ kind: "number", value, at: start });
      continue;
    }

    if (FIELD_START.test(c)) {
      const start = i;
      while (i < input.length && FIELD_CHAR.test(input[i])) i++;
      tokens.push({ kind: "field", name: input.slice(start, i), at: start });
      continue;
    }

    throw new FormulaError(`"${c}" is not something this formula can use`, i);
  }

  return tokens;
}

/**
 * Recursive descent, lowest precedence first, so multiplication binds tighter
 * than addition without any precedence table to keep in step.
 */
export function parse(input: string): Node {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = () => tokens[pos];
  const end = () => pos >= tokens.length;

  function expect(predicate: (t: Token) => boolean, what: string): Token {
    const token = peek();
    if (!token) throw new FormulaError(`The formula ends where ${what} was expected`, input.length);
    if (!predicate(token)) throw new FormulaError(`Expected ${what} here`, token.at);
    pos++;
    return token;
  }

  function parseExpression(): Node {
    let left = parseTerm();
    while (!end()) {
      const token = peek();
      if (token.kind !== "op" || (token.value !== "+" && token.value !== "-")) break;
      pos++;
      left = { kind: "binary", op: token.value, left, right: parseTerm() };
    }
    return left;
  }

  function parseTerm(): Node {
    let left = parseUnary();
    while (!end()) {
      const token = peek();
      if (token.kind !== "op" || (token.value !== "*" && token.value !== "/")) break;
      pos++;
      left = { kind: "binary", op: token.value, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary(): Node {
    const token = peek();
    if (token && token.kind === "op" && token.value === "-") {
      pos++;
      return { kind: "negate", operand: parseUnary() };
    }
    // A leading "+" is harmless and people type it; accept and ignore.
    if (token && token.kind === "op" && token.value === "+") {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
    const token = peek();
    if (!token) throw new FormulaError("The formula ends unexpectedly", input.length);

    if (token.kind === "number") {
      pos++;
      return { kind: "number", value: token.value };
    }

    if (token.kind === "paren" && token.value === "(") {
      pos++;
      const inner = parseExpression();
      expect((t) => t.kind === "paren" && t.value === ")", "a closing bracket");
      return inner;
    }

    if (token.kind === "field") {
      pos++;
      const next = peek();

      // A name followed by "(" is a function call; anything else is a field.
      if (next && next.kind === "paren" && next.value === "(") {
        const lower = token.name.toLowerCase();
        if (!(lower in FUNCTIONS)) {
          throw new FormulaError(
            `There is no function called "${token.name}". Available: ${Object.keys(FUNCTIONS).join(", ")}`,
            token.at
          );
        }
        const name = lower as FunctionName;
        pos++;

        const args: Node[] = [];
        if (peek() && peek().kind === "paren" && (peek() as { value: string }).value === ")") {
          pos++;
        } else {
          for (;;) {
            args.push(parseExpression());
            const after = peek();
            if (!after) throw new FormulaError(`${name}( is never closed`, token.at);
            if (after.kind === "comma") {
              pos++;
              continue;
            }
            expect((t) => t.kind === "paren" && t.value === ")", "a closing bracket");
            break;
          }
        }

        const arity = FUNCTIONS[name].arity;
        if (args.length !== arity) {
          throw new FormulaError(
            `${name}() takes ${arity} value${arity === 1 ? "" : "s"}, not ${args.length}`,
            token.at
          );
        }
        return { kind: "call", name, args };
      }

      return { kind: "field", name: token.name };
    }

    throw new FormulaError("Expected a number, a field or a bracket here", token.at);
  }

  if (tokens.length === 0) throw new FormulaError("The formula is empty", 0);

  const tree = parseExpression();
  if (!end()) throw new FormulaError("There is something left over after the formula ends", peek().at);
  return tree;
}

/** Every field name the expression reads, in the order first seen. */
export function fieldsUsed(node: Node): string[] {
  const found: string[] = [];
  const walk = (n: Node) => {
    switch (n.kind) {
      case "field":
        if (!found.includes(n.name)) found.push(n.name);
        break;
      case "binary":
        walk(n.left);
        walk(n.right);
        break;
      case "negate":
        walk(n.operand);
        break;
      case "call":
        n.args.forEach(walk);
        break;
    }
  };
  walk(node);
  return found;
}

export type EvaluateResult =
  | { ok: true; value: number }
  | { ok: false; reason: string };

/**
 * Walks the tree against one asset's values.
 *
 * A field with no value is a real situation — not every asset has every
 * attribute recorded — so it reads as 0 rather than throwing. Callers count
 * how often that happened and show it, because a formula quietly scoring on
 * absent data is worse than one that says so.
 */
export function evaluate(node: Node, values: Record<string, number>): EvaluateResult {
  try {
    return { ok: true, value: walk(node, values) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not evaluate" };
  }
}

function walk(node: Node, values: Record<string, number>): number {
  switch (node.kind) {
    case "number":
      return node.value;

    case "field": {
      const value = values[node.name];
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }

    case "negate":
      return -walk(node.operand, values);

    case "binary": {
      const left = walk(node.left, values);
      const right = walk(node.right, values);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          // Dividing by zero yields Infinity in JavaScript, which would then
          // survive a clamp as the maximum score. Zero is the honest answer for
          // "this could not be worked out".
          if (right === 0) return 0;
          return left / right;
      }
      break;
    }

    case "call": {
      const args = node.args.map((a) => walk(a, values));
      switch (node.name) {
        case "min":
          return Math.min(args[0], args[1]);
        case "max":
          return Math.max(args[0], args[1]);
        case "clamp":
          return Math.min(Math.max(args[0], args[1]), args[2]);
        case "round":
          return Math.round(args[0]);
      }
    }
  }
  throw new Error("Unreachable node");
}

/** The published range for a criticality score. Everything lands here so two
 * asset types with different formulas still rank against each other. */
export const CRITICALITY_MIN = 0;
export const CRITICALITY_MAX = 100;

export function toCriticalityScore(raw: number): number {
  if (!Number.isFinite(raw)) return CRITICALITY_MIN;
  const clamped = Math.min(Math.max(raw, CRITICALITY_MIN), CRITICALITY_MAX);
  return Math.round(clamped * 10) / 10;
}
