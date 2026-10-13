/**
 * What the screens call a condition index and its score.
 *
 * Each modelled asset type has its own index, named in Settings › Condition
 * Index — "Waterline Condition Index (WCI)", "Pole Condition Index". The
 * screens need it two ways: the full name for titles, and a short form to sit
 * beside a score ("WCI 62", "Start WCI"). The short form is the one written in
 * brackets after the name, or else the name's initials, so an index named
 * without one still reads sensibly.
 *
 * Kept free of the database so client components can use it.
 */

export type IndexWords = {
  /** The full name, without the bracketed short form: "Waterline Condition Index". */
  name: string;
  /** The short form beside a score: "WCI". */
  short: string;
};

/** For a screen spanning indexes that don't share a name. */
export const GENERIC_INDEX_WORDS: IndexWords = { name: "Condition Index", short: "CI" };

const BRACKETED = /^(.*?)\s*\(([^()]+)\)\s*$/;

export function indexWords(modelName: string): IndexWords {
  const trimmed = modelName.trim();
  if (!trimmed) return GENERIC_INDEX_WORDS;
  const match = trimmed.match(BRACKETED);
  if (match && match[1] && match[2].trim()) return { name: match[1], short: match[2].trim() };
  const initials = trimmed
    .split(/\s+/)
    .map((word) => word[0])
    .filter((c) => /[A-Za-z0-9]/.test(c))
    .join("")
    .toUpperCase();
  return { name: trimmed, short: initials || GENERIC_INDEX_WORDS.short };
}

/** The words for several indexes read together — a scenario over two
 * asset types, the dashboard's network average. Their own when they agree,
 * the generic words when they don't. */
export function sharedIndexWords(modelNames: string[]): IndexWords {
  const all = modelNames.map(indexWords);
  if (all.length === 0) return GENERIC_INDEX_WORDS;
  const [first] = all;
  return all.every((w) => w.short === first.short && w.name === first.name) ? first : GENERIC_INDEX_WORDS;
}

/** Text written with "{index}" where the short form goes — a column heading
 * kept as a constant, a description written once for every index. */
export function withIndex(text: string, words: IndexWords): string {
  return text.replaceAll("{index}", words.short);
}
