import { describe, expect, it } from "vite-plus/test";

import { toSpeakableText } from "./speechText.ts";

describe("toSpeakableText", () => {
  it("drops fenced code and keeps the surrounding prose", () => {
    const reply = [
      "I fixed the null check in `parseConfig`.",
      "",
      "```ts",
      "if (!config) return defaults;",
      "```",
      "",
      "Tests pass now.",
    ].join("\n");
    expect(toSpeakableText(reply)).toBe("I fixed the null check in parseConfig. Tests pass now.");
  });

  it("speaks only the <speak> block when the agent provides one", () => {
    const reply =
      "## Changes\n- edited 4 files\n\n<speak>Done. Four files changed, tests green.</speak>";
    expect(toSpeakableText(reply)).toBe("Done. Four files changed, tests green.");
  });

  it("turns headings and list items into separate sentences", () => {
    expect(toSpeakableText("## Summary\n- Added the route\n- Wrote tests")).toBe(
      "Summary. Added the route. Wrote tests.",
    );
  });

  it("keeps link labels, drops URLs, tables, and emphasis markers", () => {
    const reply = [
      "See the **migration guide** in [the docs](https://example.com/docs).",
      "| a | b |",
      "|---|---|",
      "Raw link: https://example.com/x",
    ].join("\n");
    expect(toSpeakableText(reply)).toBe("See the migration guide in the docs. Raw link: a link.");
  });

  it("leaves snake_case identifiers alone", () => {
    expect(toSpeakableText("Renamed user_id to account_id.")).toBe(
      "Renamed user_id to account_id.",
    );
  });

  it("returns nothing for a reply that is only code", () => {
    expect(toSpeakableText("```diff\n- a\n+ b\n```")).toBe("");
  });

  it("cuts long replies at a sentence boundary", () => {
    const reply = `${"This sentence is filler. ".repeat(10)}Last.`;
    const spoken = toSpeakableText(reply, 100);
    expect(spoken.length).toBeLessThanOrEqual(100);
    expect(spoken.endsWith("filler.")).toBe(true);
  });
});
