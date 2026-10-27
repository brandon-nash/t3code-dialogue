import { describe, expect, it } from "vite-plus/test";

import { applyPhraseBook, parsePhraseBook } from "./phraseBook.ts";

const book = parsePhraseBook({
  replacements: {
    "that's metal": "🤘",
    metal: "METAL",
    "new paragraph": "\n\n",
    "ship it": "🚢",
  },
  vocabulary: ["Alkami", "jXchange", "T3 Code"],
});

describe("applyPhraseBook", () => {
  it("replaces a phrase and swallows the period the recognizer adds", () => {
    expect(applyPhraseBook("That's metal.", book)).toBe("🤘");
  });

  it("matches curly apostrophes and extra whitespace", () => {
    expect(applyPhraseBook("Honestly, that’s   metal!", book)).toBe("Honestly, 🤘");
  });

  it("prefers the longest phrase so a short one never splits a longer one", () => {
    expect(applyPhraseBook("that's metal and metal", book)).toBe("🤘 and METAL");
  });

  it("only matches whole words", () => {
    expect(applyPhraseBook("metallic gutters", book)).toBe("metallic gutters");
  });

  it("does not re-match text produced by a replacement", () => {
    const echo = parsePhraseBook({ replacements: { alpha: "beta", beta: "gamma" } });
    expect(applyPhraseBook("alpha", echo)).toBe("beta");
  });

  it("can insert line breaks without leaving stray spaces", () => {
    expect(applyPhraseBook("First point. New paragraph. Second point.", book)).toBe(
      "First point.\n\nSecond point.",
    );
  });

  it("restores canonical casing for vocabulary terms", () => {
    expect(applyPhraseBook("wire alkami to the JXCHANGE call in t3 code", book)).toBe(
      "wire Alkami to the jXchange call in T3 Code",
    );
  });
});

describe("parsePhraseBook", () => {
  it("drops malformed entries instead of failing", () => {
    expect(
      parsePhraseBook({
        replacements: { ok: "fine", bad: 3, "  ": "blank" },
        vocabulary: [1, "Q2"],
      }),
    ).toEqual({ replacements: [["ok", "fine"]], vocabulary: ["Q2"] });
    expect(parsePhraseBook(null)).toEqual({ replacements: [], vocabulary: [] });
  });
});
