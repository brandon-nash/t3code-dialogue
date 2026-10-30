import { describe, expect, it } from "vite-plus/test";

import { SPOKEN_REPLY_INSTRUCTIONS, spokenReplyTurnText } from "./spokenReplyInstructions.ts";

describe("spokenReplyTurnText", () => {
  it("keeps the user's text first and the instruction last on a spoken turn", () => {
    const text = spokenReplyTurnText({ spokenReply: true }, "Why did the build fail?");
    expect(text.startsWith("Why did the build fail?\n\n")).toBe(true);
    expect(text.endsWith(SPOKEN_REPLY_INSTRUCTIONS)).toBe(true);
  });

  it("leaves silent turns and slash commands untouched", () => {
    expect(spokenReplyTurnText({}, "Why did the build fail?")).toBe("Why did the build fail?");
    expect(spokenReplyTurnText({ spokenReply: false }, "Hi")).toBe("Hi");
    expect(spokenReplyTurnText({ spokenReply: true }, "/compact")).toBe("/compact");
    expect(spokenReplyTurnText({ spokenReply: true }, "  /goal ship it")).toBe("  /goal ship it");
  });

  it("asks for a closed speak block in plain prose", () => {
    expect(SPOKEN_REPLY_INSTRUCTIONS).toContain("<speak>…</speak>");
    expect(SPOKEN_REPLY_INSTRUCTIONS).toContain("No markdown, code, file paths, or URLs");
  });
});
