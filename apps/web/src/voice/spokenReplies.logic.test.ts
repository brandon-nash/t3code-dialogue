import type { MessageId, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createSpokenRunTracker, isInterruptingKey, pickSpokenReply } from "./spokenReplies.logic";

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

describe("pickSpokenReply", () => {
  const messages = [
    {
      id: message("u1"),
      role: "user" as const,
      runId: run("r1"),
      text: "fix it",
      streaming: false,
    },
    {
      id: message("a1"),
      role: "assistant" as const,
      runId: run("r1"),
      text: "Let me look at the tests.",
      streaming: false,
    },
    {
      id: message("a2"),
      role: "assistant" as const,
      runId: run("r1"),
      text: "Fixed. Tests pass.",
      streaming: false,
    },
  ];

  it("prefers the message the run summary names", () => {
    expect(pickSpokenReply(messages, run("r1"), message("a1"))?.text).toBe(
      "Let me look at the tests.",
    );
  });

  it("falls back to the run's last assistant message", () => {
    expect(pickSpokenReply(messages, run("r1"), null)?.text).toBe("Fixed. Tests pass.");
    expect(pickSpokenReply(messages, run("r1"), message("missing"))?.text).toBe(
      "Fixed. Tests pass.",
    );
  });

  it("returns null when the run has no assistant reply", () => {
    expect(pickSpokenReply(messages, run("r9"), null)).toBeNull();
  });
});

describe("isInterruptingKey", () => {
  const key = (key: string, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
    key,
    metaKey: mods.metaKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
  });

  it("treats typing, Enter, Backspace, and Escape as an answer", () => {
    expect(isInterruptingKey(key("a"))).toBe(true);
    expect(isInterruptingKey(key(" "))).toBe(true);
    expect(isInterruptingKey(key("Enter"))).toBe(true);
    expect(isInterruptingKey(key("Backspace"))).toBe(true);
    expect(isInterruptingKey(key("Escape"))).toBe(true);
  });

  it("lets bare modifiers, Tab, and shortcut chords leave the reply playing", () => {
    expect(isInterruptingKey(key("Shift"))).toBe(false);
    expect(isInterruptingKey(key("Meta"))).toBe(false);
    expect(isInterruptingKey(key("Tab"))).toBe(false);
    expect(isInterruptingKey(key("k", { metaKey: true }))).toBe(false);
    expect(isInterruptingKey(key("Enter", { ctrlKey: true }))).toBe(false);
  });
});
