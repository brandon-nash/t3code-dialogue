import { describe, expect, it } from "vite-plus/test";

import { transcriptReplacement } from "./draftReplacement";

describe("transcriptReplacement", () => {
  it("finds an insertion at the end, including the boundary space the controller adds", () => {
    expect(transcriptReplacement("fix the test", "fix the test and ship it")).toEqual({
      start: 12,
      end: 12,
      insertion: " and ship it",
    });
  });

  it("finds an insertion in the middle", () => {
    expect(transcriptReplacement("fix  now", "fix the test now")).toEqual({
      start: 4,
      end: 4,
      insertion: "the test",
    });
  });

  it("keeps a replaced selection as one edit", () => {
    expect(transcriptReplacement("run the old plan", "run the new plan")).toEqual({
      start: 8,
      end: 11,
      insertion: "new",
    });
  });

  it("leaves an unchanged draft alone and handles an empty one", () => {
    expect(transcriptReplacement("same", "same")).toEqual({ start: 4, end: 4, insertion: "" });
    expect(transcriptReplacement("", "hello")).toEqual({ start: 0, end: 0, insertion: "hello" });
  });

  it("yields the same text when the insertion repeats its neighbours", () => {
    const current = "aaa";
    const next = "aaaa";
    const { start, end, insertion } = transcriptReplacement(current, next);
    expect(current.slice(0, start) + insertion + current.slice(end)).toBe(next);
  });
});
