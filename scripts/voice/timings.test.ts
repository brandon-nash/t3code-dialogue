import { describe, expect, it } from "vite-plus/test";

import { renderVoiceTimingSummary, summarizeVoiceTimings } from "./timings.ts";

const line = (record: Record<string, unknown>) =>
  JSON.stringify({ at: "2026-10-27T00:00:00.000Z", ...record });

describe("summarizeVoiceTimings", () => {
  it("groups loads by model and derives real-time factors", () => {
    const summary = summarizeVoiceTimings([
      line({ kind: "load", model: "stt", ms: 1500 }),
      line({ kind: "load", model: "tts", ms: 900 }),
      line({ kind: "transcribe", audioMs: 4000, decodeMs: 400, chars: 60 }),
      line({ kind: "transcribe", audioMs: 2000, decodeMs: 300, chars: 30 }),
      line({ kind: "speak", chars: 200, synthMs: 1000, audioMs: 8000 }),
      "",
    ]);

    expect(summary.loads.stt).toMatchObject({ count: 1, p50: 1500, max: 1500 });
    expect(summary.loads.tts).toMatchObject({ count: 1, p50: 900 });
    expect(summary.transcribe?.decodeMs).toMatchObject({ count: 2, p50: 400, max: 400 });
    expect(summary.transcribe?.realTimeFactor.max).toBeCloseTo(0.15);
    expect(summary.speak?.realTimeFactor.p50).toBeCloseTo(0.125);
    expect(summary.speak?.msPer100Chars.p50).toBeCloseTo(500);
    expect(summary.skippedLines).toBe(0);
  });

  it("skips unreadable or incomplete lines instead of failing", () => {
    const summary = summarizeVoiceTimings([
      "not json",
      line({ kind: "transcribe", audioMs: 0, decodeMs: 10, chars: 0 }),
      line({ kind: "mystery" }),
    ]);
    expect(summary.transcribe).toBeNull();
    expect(summary.skippedLines).toBe(3);
    expect(renderVoiceTimingSummary(summary)).toContain("No voice timings recorded yet.");
    expect(renderVoiceTimingSummary(summary)).toContain("3 unreadable lines skipped");
  });
});
