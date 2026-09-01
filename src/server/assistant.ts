import Anthropic from "@anthropic-ai/sdk";
import {
  getFilterSchema,
  loadFilterRows,
  applyCriteria,
  fieldIndex,
  OPERATORS,
  ROW_ASSET_ID,
  type Criterion,
  type FilterRow,
  type FilterTable,
} from "@/server/filter-schema";

/**
 * Answers questions about the network in plain English.
 *
 * The model never writes SQL and never touches the database. It fills in the
 * same criteria structure the Filters page produces, over the same curated
 * schema — which deliberately excludes credentials and database plumbing — and
 * this module runs it through `loadFilterRows` / `applyCriteria`, the code the
 * Filters page already uses. Two consequences worth stating plainly:
 *
 *  - The worst a badly-worded or hostile question can do is select the wrong
 *    segments. There is no query it can write that reaches a field an
 *    administrator has not already made filterable.
 *  - Every field and operator coming back from the model is checked against
 *    the live schema before it runs. A hallucinated field name is rejected
 *    rather than silently ignored, so a wrong answer cannot look like a
 *    confident one.
 *
 * The criteria are returned alongside the rows so the UI can show its working,
 * the same way the decision-tree traces do.
 */

/** Opus by default. Set ASSISTANT_MODEL to trade quality for cost — this
 * workload is a short structured extraction, so cheaper models do well at it,
 * but that is a decision for whoever pays the bill rather than a default. */
const MODEL = process.env.ASSISTANT_MODEL || "claude-opus-5";

/** Rows sent to the browser. The count reported is the true total. */
const MAX_ROWS = 200;

export type AssistantResult =
  | {
      kind: "segments";
      /** What the model understood the question to mean. */
      note: string;
      criteria: Criterion[];
      matchAll: boolean;
      columns: Array<{ key: string; label: string }>;
      rows: Array<{ assetId: string | null; values: Record<string, string> }>;
      total: number;
      truncated: boolean;
    }
  | { kind: "message"; text: string }
  | { kind: "unavailable"; text: string };

export function assistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** The schema, rendered for the prompt. Built from the live schema, so a field
 * added under Settings → Fields becomes askable with no code change. */
function describeSchema(schema: FilterTable[]): string {
  return schema
    .map((table) => {
      const fields = table.fields
        .map((f) => {
          const options = f.options?.length ? ` — one of: ${f.options.join(", ")}` : "";
          return `  ${f.key} (${f.type}) — ${f.label}${options}`;
        })
        .join("\n");
      return `${table.label}:\n${fields}`;
    })
    .join("\n\n");
}

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_segments",
  description:
    "Find waterline segments matching a set of criteria. Use this whenever the question asks which, how many, or for a list of segments.",
  input_schema: {
    type: "object",
    properties: {
      note: {
        type: "string",
        description:
          "One short sentence restating what you searched for, in the user's own terms. Shown to them so they can check you understood.",
      },
      match_all: {
        type: "boolean",
        description: "true when every criterion must hold, false when any one is enough. Usually true.",
      },
      criteria: {
        type: "array",
        description: "The criteria. An empty array means every segment.",
        items: {
          type: "object",
          properties: {
            field: { type: "string", description: "A field key from the schema, exactly as written." },
            operator: { type: "string", enum: OPERATORS.map((o) => o.key) },
            value: {
              type: "string",
              description:
                "The value to compare against. For 'in' and 'nin', a comma-separated list. For 'between', the low end. Empty string for 'empty' and 'notEmpty'.",
            },
            value2: { type: "string", description: "The high end, for 'between' only." },
          },
          required: ["field", "operator", "value"],
          additionalProperties: false,
        },
      },
      columns: {
        type: "array",
        description:
          "Field keys to show as columns, in order. Pick what answers the question. asset.assetCode is added automatically.",
        items: { type: "string" },
      },
    },
    required: ["note", "match_all", "criteria", "columns"],
    additionalProperties: false,
  },
  strict: true,
};

function systemPrompt(schema: FilterTable[], today: string): string {
  return `You help staff at a water utility ask questions about their waterline network in CARNAC, an asset management system.

When the question asks which segments, how many, or for a list, call search_segments. Translate the question into criteria over the schema below.

Rules that matter:
- Use only field keys that appear in the schema, spelled exactly as shown. Never invent one.
- Diameters are in inches, lengths in feet, ages in years. A question about 12" pipe means attribute.DIAMETER equals 12.
- Where a field lists its allowed values, match one of them. If the user's wording is close but not exact ("cast iron"), use the schema's spelling ("Cast Iron").
- "Old", "aging" or "near end of life" is asset.ageYears or asset.agePercentOfLife, not a guess at an install year.
- "Poor condition" or "bad" is condition.score, where lower is worse.
- Today is ${today}. Work relative dates out from that — "the last 10 years" means on or after ${Number(today.slice(0, 4)) - 10}${today.slice(4)}, not a round number you picked.
- There is no sorting. A question like "the oldest" or "the largest" cannot be ordered, so filter to a sensible range instead and include the field in question as a column, and say in your note that this is what you did.
- If the question is about the network but you genuinely cannot map it to these fields, say so in plain words instead of guessing at a close-but-wrong field.
- If the question is not about this water network, do not answer it. Say that you only answer questions about the water network, in one sentence. This applies to general knowledge, current events, and anything else outside this utility — being helpful about them is not what this tool is for.

Schema:

${describeSchema(schema)}`;
}

/** Field keys and operators are checked against the live schema. A field the
 * model invented is an error the user sees, not a filter that quietly does
 * nothing. */
function validateCriteria(
  raw: unknown,
  byKey: Map<string, { key: string; label: string; type: string }>
): { criteria: Criterion[]; rejected: string[] } {
  const operatorKeys = new Set<string>(OPERATORS.map((o) => o.key));
  const criteria: Criterion[] = [];
  const rejected: string[] = [];

  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const field = typeof c.field === "string" ? c.field : "";
    const operator = typeof c.operator === "string" ? c.operator : "";

    if (!byKey.has(field)) {
      rejected.push(`unknown field "${field}"`);
      continue;
    }
    if (!operatorKeys.has(operator)) {
      rejected.push(`unknown operator "${operator}" on ${field}`);
      continue;
    }

    criteria.push({
      field,
      operator: operator as Criterion["operator"],
      value: typeof c.value === "string" ? c.value : "",
      value2: typeof c.value2 === "string" ? c.value2 : undefined,
    });
  }

  return { criteria, rejected };
}

function formatCell(value: string | number | boolean | null): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return value;
}

/** API failures reach a water engineer, not a developer, so they are
 * translated. The distinction that matters to them is whether this is
 * something they can fix (billing, a bad key) or something to wait out. */
function explainApiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY is current and has not been revoked.";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "Too many questions at once. Wait a moment and ask again.";
  }
  if (e instanceof Anthropic.APIError) {
    // Billing arrives as a 400, not a dedicated class, so it is matched on the
    // server's own wording rather than guessed at from the status code.
    if (/credit balance is too low/i.test(e.message)) {
      return "The Anthropic account has no credits left. Add credits under Plans & Billing at console.anthropic.com, and this page starts working again — nothing here needs changing.";
    }
    if (e.status && e.status >= 500) {
      return "The Anthropic API is having trouble right now. Try again shortly.";
    }
    return `The Anthropic API refused that request (${e.status ?? "unknown"}). Everything else in CARNAC is unaffected.`;
  }
  return "Could not reach the Anthropic API. Check the connection and try again.";
}

export async function askAssistant(organizationId: string, question: string): Promise<AssistantResult> {
  if (!assistantConfigured()) {
    return {
      kind: "unavailable",
      text: "The assistant is not switched on yet — an ANTHROPIC_API_KEY needs adding to the environment.",
    };
  }

  const trimmed = question.trim();
  if (!trimmed) return { kind: "message", text: "Ask me something about the network." };

  // The model has no clock. Without this, "the last ten years" becomes a
  // guess, and a wrong date range looks exactly like a right one.
  const today = new Date().toISOString().slice(0, 10);

  const schema = await getFilterSchema(organizationId);
  const byKey = fieldIndex(schema);

  const client = new Anthropic();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      // A tool call carrying a handful of criteria is a deliberately short
      // output; this is not a case of lowballing a long answer.
      max_tokens: 4096,
      // The schema is the bulk of the prompt and changes only when an
      // administrator adds a field, so it caches across every question asked.
      // The date changes daily and the schema rarely, but both sit in the same
    // cached block: a prompt cache lasts minutes, so a once-a-day change costs
    // nothing, and splitting them would complicate the prefix for no gain.
    system: [
      { type: "text", text: systemPrompt(schema, today), cache_control: { type: "ephemeral" } },
    ],
      // Left on auto rather than forced: a question that is not about segment
      // data should come back as words, not a contorted search.
      tools: [SEARCH_TOOL],
      output_config: { effort: "low" },
      messages: [{ role: "user", content: trimmed }],
    });
  } catch (e) {
    return { kind: "unavailable", text: explainApiError(e) };
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "search_segments"
  );

  if (!toolUse) {
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return { kind: "message", text: text || "I could not work out what to look for there." };
  }

  const input = toolUse.input as Record<string, unknown>;
  const { criteria, rejected } = validateCriteria(input.criteria, byKey);

  if (rejected.length > 0) {
    return {
      kind: "message",
      text: `I tried to search on something this system does not record (${rejected.join("; ")}). Try naming the field as it appears on the Filters page.`,
    };
  }

  const matchAll = input.match_all !== false;
  const note = typeof input.note === "string" ? input.note : "";

  const typeByField = new Map(schema.flatMap((t) => t.fields.map((f) => [f.key, f.type] as const)));
  const allRows = await loadFilterRows(organizationId);
  const matched = applyCriteria(allRows, criteria, matchAll, typeByField);

  // Always lead with the segment code so every row can link to its page, then
  // whatever the question was actually about, then the fields it filtered on —
  // seeing the filtered values is how you check the answer is right.
  const requested = Array.isArray(input.columns) ? input.columns.filter((c): c is string => typeof c === "string") : [];
  const keys = ["asset.assetCode", ...requested, ...criteria.map((c) => c.field)].filter(
    (key, i, all) => byKey.has(key) && all.indexOf(key) === i
  );
  const columns = keys.map((key) => ({ key, label: byKey.get(key)!.label }));

  const rows = matched.slice(0, MAX_ROWS).map((row: FilterRow) => ({
    assetId: typeof row[ROW_ASSET_ID] === "string" ? (row[ROW_ASSET_ID] as string) : null,
    values: Object.fromEntries(columns.map((c) => [c.key, formatCell(row[c.key] ?? null)])),
  }));

  return {
    kind: "segments",
    note,
    criteria,
    matchAll,
    columns,
    rows,
    total: matched.length,
    truncated: matched.length > rows.length,
  };
}
