/**
 * Phrase book applied to every transcript: spoken phrases become replacement text, and
 * vocabulary terms get their canonical casing. Longest phrase wins; output is never re-matched.
 */

export interface PhraseBook {
  readonly replacements: ReadonlyArray<readonly [phrase: string, replacement: string]>;
  readonly vocabulary: ReadonlyArray<string>;
}

export const EMPTY_PHRASE_BOOK: PhraseBook = { replacements: [], vocabulary: [] };

const APOSTROPHES = "'‘’ʼ";
const WORD_CHAR = "\\p{L}\\p{N}";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, " ");
}

/** Builds a regex source for a phrase that tolerates apostrophe variants and whitespace runs. */
function phrasePattern(phrase: string): string {
  return normalizePhrase(phrase)
    .split("")
    .map((char) => {
      if (APOSTROPHES.includes(char)) return `[${APOSTROPHES}]`;
      if (char === " ") return "\\s+";
      return escapeRegExp(char);
    })
    .join("");
}

/** Accepts the on-disk JSON shape and drops anything malformed rather than failing. */
export function parsePhraseBook(input: unknown): PhraseBook {
  if (typeof input !== "object" || input === null) return EMPTY_PHRASE_BOOK;
  const record = input as Record<string, unknown>;

  const replacements: Array<readonly [string, string]> = [];
  const rawReplacements = record.replacements;
  if (typeof rawReplacements === "object" && rawReplacements !== null) {
    for (const [phrase, replacement] of Object.entries(rawReplacements)) {
      if (typeof replacement !== "string") continue;
      const normalized = normalizePhrase(phrase);
      if (normalized.length === 0) continue;
      replacements.push([normalized, replacement]);
    }
  }

  const vocabulary = Array.isArray(record.vocabulary)
    ? record.vocabulary
        .filter((term): term is string => typeof term === "string")
        .map(normalizePhrase)
        .filter((term) => term.length > 0)
    : [];

  return { replacements, vocabulary };
}

export function applyPhraseBook(text: string, book: PhraseBook): string {
  let result = text;

  if (book.replacements.length > 0) {
    const ordered = [...book.replacements].sort(([a], [b]) => b.length - a.length);
    const byLowerPhrase = new Map<string, string>();
    for (const [phrase, replacement] of ordered) {
      const key = phrase.toLowerCase();
      if (!byLowerPhrase.has(key)) byLowerPhrase.set(key, replacement);
    }
    const alternation = ordered.map(([phrase]) => `(${phrasePattern(phrase)})`).join("|");
    const matcher = new RegExp(
      `(?<![${WORD_CHAR}])(?:${alternation})(?![${WORD_CHAR}])[.,!?]?`,
      "giu",
    );
    result = result.replace(matcher, (...args: Array<unknown>) => {
      const groups = args.slice(1, 1 + ordered.length) as Array<string | undefined>;
      const index = groups.findIndex((group) => group !== undefined);
      const phrase = ordered[index]?.[0];
      if (phrase === undefined) return String(args[0]);
      return byLowerPhrase.get(phrase.toLowerCase()) ?? String(args[0]);
    });
  }

  for (const term of book.vocabulary) {
    const matcher = new RegExp(
      `(?<![${WORD_CHAR}])${phrasePattern(term)}(?![${WORD_CHAR}])`,
      "giu",
    );
    result = result.replace(matcher, term);
  }

  return tidyWhitespace(result);
}

/** Collapses the doubled spaces a replacement can leave behind, without touching newlines. */
function tidyWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
