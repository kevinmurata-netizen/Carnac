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

export type ArithOp = "+" | "-" | "*" | "/";
export type CompareOp = ">" | "<" | ">=" | "<=" | "==" | "!=";
export type LogicalOp = "and" | "or";

export type Token =
  | { kind: "number"; value: number; at: number }
  | { kind: "field"; name: string; at: number }
  | { kind: "op"; value: ArithOp; at: number }
  | { kind: "compare"; value: CompareOp; at: number }
  | { kind: "keyword"; value: LogicalOp; at: number }
  | { kind: "paren"; value: "(" | ")"; at: number }
  | { kind: "comma"; at: number };

export type Node =
  | { kind: "number"; value: number }
  | { kind: "field"; name: string }
  | { kind: "binary"; op: ArithOp; left: Node; right: Node }
  | { kind: "compare"; op: CompareOp; left: Node; right: Node }
  | { kind: "logical"; op: LogicalOp; left: Node; right: Node }
  | { kind: "negate"; operand: Node }
  | { kind: "call"; name: FunctionName; args: Node[] };

export const FUNCTIONS = {
  if: {
    arity: 3,
    help: "if(test, then, otherwise) — for example if(LENGTH > 20, 5, 10)",
  },
  min: { arity: 2, help: "min(a, b) — the smaller of two values" },
  max: { arity: 2, help: "max(a, b) — the larger of two values" },
  clamp: { arity: 3, help: "clamp(value, low, high) — hold a value inside a range" },
  round: { arity: 1, help: "round(value) — to the nearest whole number" },
} as const;

/**
 * A test is just a number: true is 1, false is 0.
 *
 * Keeping one type in the language means a comparison can be used wherever a
 * number can — `(LENGTH > 20) * 5` is a perfectly good way to add five to the
 * long ones — and `if` needs no separate notion of truth to check against.
 */
export const TRUE = 1;
export const FALSE = 0;

/** Reserved because the parser reads them as operators; a field could not be
 * told apart from them. */
export const RESERVED_WORDS = new Set(["and", "or"]);

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

    // Two-character comparisons first: reading ">" alone would leave the "="
    // of ">=" behind as a stray character.
    const pair = input.slice(i, i + 2);
    if (pair === ">=" || pair === "<=" || pair === "==" || pair === "!=") {
      tokens.push({ kind: "compare", value: pair, at: i });
      i += 2;
      continue;
    }
    // "<>" is how a spreadsheet spells "not equal", and people arrive here
    // from spreadsheets.
    if (pair === "<>") {
      tokens.push({ kind: "compare", value: "!=", at: i });
      i += 2;
      continue;
    }

    if (c === ">" || c === "<") {
      tokens.push({ kind: "compare", value: c, at: i++ });
      continue;
    }

    // A single "=" is what most people type for equality; accept it rather
    // than being right about a distinction this language does not have.
    if (c === "=") {
      tokens.push({ kind: "compare", value: "==", at: i++ });
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
      const word = input.slice(start, i);
      if (RESERVED_WORDS.has(word.toLowerCase())) {
        tokens.push({ kind: "keyword", value: word.toLowerCase() as LogicalOp, at: start });
      } else {
        tokens.push({ kind: "field", name: word, at: start });
      }
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

  /**
   * Loosest binding first, so each level only has to know the one below it:
   * or → and → comparison → + − → × ÷ → unary → primary.
   *
   * That ordering is what makes `if(LENGTH > 20 and DIAMETER > 12, 5, 10)`
   * read the way it looks, without any precedence table to keep in step.
   */
  function parseExpression(): Node {
    return parseOr();
  }

  function parseOr(): Node {
    let left = parseAnd();
    while (!end()) {
      const token = peek();
      if (token.kind !== "keyword" || token.value !== "or") break;
      pos++;
      left = { kind: "logical", op: "or", left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): Node {
    let left = parseComparison();
    while (!end()) {
      const token = peek();
      if (token.kind !== "keyword" || token.value !== "and") break;
      pos++;
      left = { kind: "logical", op: "and", left, right: parseComparison() };
    }
    return left;
  }

  function parseComparison(): Node {
    const left = parseAdditive();
    const token = peek();
    if (!token || token.kind !== "compare") return left;
    pos++;
    const node: Node = { kind: "compare", op: token.value, left, right: parseAdditive() };

    // `a < b < c` would compare a true/false to c, which is never what anyone
    // means. Refusing it is friendlier than quietly scoring on nonsense.
    const next = peek();
    if (next && next.kind === "compare") {
      throw new FormulaError("Comparisons cannot be chained — join them with \"and\" instead", next.at);
    }
    return node;
  }

  function parseAdditive(): Node {
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
      case "compare":
      case "logical":
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

    case "compare": {
      const left = walk(node.left, values);
      const right = walk(node.right, values);
      const yes = (() => {
        switch (node.op) {
          case ">":
            return left > right;
          case "<":
            return left < right;
          case ">=":
            return left >= right;
          case "<=":
            return left <= right;
          case "==":
            return left === right;
          case "!=":
            return left !== right;
        }
      })();
      return yes ? TRUE : FALSE;
    }

    case "logical": {
      // Anything other than exactly zero counts as true, so a comparison and a
      // plain number can both be used as a test.
      const left = walk(node.left, values) !== 0;
      // Short-circuits, so the untaken side cannot contribute a surprise.
      if (node.op === "and") return left && walk(node.right, values) !== 0 ? TRUE : FALSE;
      return left || walk(node.right, values) !== 0 ? TRUE : FALSE;
    }

    case "call": {
      // if() picks a branch before working it out, so the branch not taken is
      // never evaluated.
      if (node.name === "if") {
        return walk(node.args[0], values) !== 0 ? walk(node.args[1], values) : walk(node.args[2], values);
      }

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
