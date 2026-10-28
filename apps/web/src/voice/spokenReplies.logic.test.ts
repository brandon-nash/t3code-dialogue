import type { MessageId, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createSpokenRunTracker, resolveSpokenReplyText } from "./spokenReplies.logic";

const run = (id: string) => id as RunId;
const message = (id: string) => id as MessageId;

describe("createSpokenRunTracker", () => {
  it("never reads the reply that was already there when the thread opened", () => {
    const tracker = createSpokenRunTracker();
    expect(tracker.observe({ runId: run("r1"), status: "completed" }, true)).toBeNull();
    expect(tracker.observe({ runId: run("r1"), status: "completed" }, true)).toBeNull();
  });

  it("reads a run once, when it completes", () => {
    const tracker = createSpokenRunTracker();
    tracker.observe(null, true);
    expect(tracker.observe({ runId: run("r2"), status: "running" }, true)).toBeNull();
    expect(tracker.observe({ runId: run("r2"), status: "completed" }, true)).toBe("r2");
    expect(tracker.observe({ runId: run("r2"), status: "completed" }, true)).toBeNull();
  });

  it("stays quiet for interrupted and failed runs", () => {
    const tracker = createSpokenRunTracker();
    tracker.observe(null, true);
    expect(tracker.observe({ runId: run("r3"), status: "interrupted" }, true)).toBeNull();
    expect(tracker.observe({ runId: run("r4"), status: "failed" }, true)).toBeNull();
  });

  it("consumes runs that finish while muted so unmuting does not replay them", () => {
    const tracker = createSpokenRunTracker();
    tracker.observe({ runId: run("r1"), status: "running" }, false);
    expect(tracker.observe({ runId: run("r1"), status: "completed" }, false)).toBeNull();
    expect(tracker.observe({ runId: run("r1"), status: "completed" }, true)).toBeNull();
  });
});

describe("resolveSpokenReplyText", () => {
  const messages = [
    { id: message("u1"), role: "user", runId: run("r1"), text: "Fix the tests.", streaming: false },
    {
      id: message("a1"),
      role: "assistant",
      runId: run("r1"),
      text: "Let me look at the tests.",
      streaming: false,
    },
    {
      id: message("a2"),
      role: "assistant",
      runId: run("r1"),
      text: "Fixed. Tests pass.",
      streaming: false,
    },
  ] as const;
  const runs = (status: "running" | "completed") => [{ id: run("r1"), status }];

  it("waits while the detail still shows the run in progress", () => {
    expect(resolveSpokenReplyText({ runs: runs("running"), messages }, run("r1"), null)).toEqual({
      settled: false,
    });
    expect(resolveSpokenReplyText({ runs: [], messages }, run("r1"), null)).toEqual({
      settled: false,
    });
  });

  it("prefers the message the run summary names once the run is terminal", () => {
    expect(
      resolveSpokenReplyText({ runs: runs("completed"), messages }, run("r1"), message("a1")),
    ).toEqual({ settled: true, text: "Let me look at the tests." });
  });

  it("falls back to the run's last assistant message", () => {
    expect(resolveSpokenReplyText({ runs: runs("completed"), messages }, run("r1"), null)).toEqual({
      settled: true,
      text: "Fixed. Tests pass.",
    });
    expect(
      resolveSpokenReplyText({ runs: runs("completed"), messages }, run("r1"), message("missing")),
    ).toEqual({ settled: true, text: "Fixed. Tests pass." });
  });

  it("settles with nothing to say when the run has no assistant reply", () => {
    expect(
      resolveSpokenReplyText(
        { runs: [{ id: run("r9"), status: "completed" }], messages },
        run("r9"),
        null,
      ),
    ).toEqual({ settled: true, text: null });
  });
});
