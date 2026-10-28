import { describe, expect, it } from "vite-plus/test";

import { extractSpeakBlocks, stripSpeakBlocks } from "./speakBlock.ts";

describe("extractSpeakBlocks", () => {
  it("returns every block's inner text", () => {
    expect(extractSpeakBlocks("Done.\n\n<speak>All green.</speak>")).toEqual(["All green."]);
    expect(extractSpeakBlocks("<SPEAK>one</SPEAK> and <speak> two </speak>")).toEqual([
      "one",
      "two",
    ]);
    expect(extractSpeakBlocks("no block")).toEqual([]);
  });
});

describe("stripSpeakBlocks", () => {
  it("removes the block and the blank lines before it", () => {
    expect(stripSpeakBlocks("## Changes\n- four files\n\n<speak>Done, four files.</speak>\n")).toBe(
      "## Changes\n- four files",
    );
  });

  it("removes an unterminated block while it streams", () => {
    expect(stripSpeakBlocks("Fixed it.\n\n<speak>Fixed the null ch")).toBe("Fixed it.");
  });

  it("leaves text without a block untouched", () => {
    expect(stripSpeakBlocks("Plain reply.")).toBe("Plain reply.");
  });
});
