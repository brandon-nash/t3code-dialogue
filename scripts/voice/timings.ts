/** Pure summary of the server's voice-timings.ndjson lines. */

interface Stats {
  readonly count: number;
  readonly p50: number;
  readonly p90: number;
  readonly max: number;
}

export interface VoiceTimingSummary {
  readonly loads: Record<string, Stats>;
  readonly transcribe: {
    readonly decodeMs: Stats;
    /** Decode time per second of audio; under 1 means faster than real time. */
    readonly realTimeFactor: Stats;
  } | null;
  readonly speak: {
    readonly synthMs: Stats;
    /** Synthesis time per second of produced audio. */
    readonly realTimeFactor: Stats;
    readonly msPer100Chars: Stats;
  } | null;
  readonly skippedLines: number;
}

function stats(values: ReadonlyArray<number>): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
  return { count: sorted.length, p50: at(0.5), p90: at(0.9), max: sorted.at(-1) ?? 0 };
}

const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function summarizeVoiceTimings(lines: ReadonlyArray<string>): VoiceTimingSummary {
  const loads = new Map<string, number[]>();
  const decode: number[] = [];
  const decodeFactor: number[] = [];
  const synth: number[] = [];
  const synthFactor: number[] = [];
  const synthPerChars: number[] = [];
  let skippedLines = 0;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      skippedLines += 1;
      continue;
    }
    switch (record.kind) {
      case "load":
        if (typeof record.model === "string" && isFinitePositive(record.ms)) {
          loads.set(record.model, [...(loads.get(record.model) ?? []), record.ms]);
          continue;
        }
        break;
      case "transcribe":
        if (isFinitePositive(record.audioMs) && typeof record.decodeMs === "number") {
          decode.push(record.decodeMs);
          decodeFactor.push(record.decodeMs / record.audioMs);
          continue;
        }
        break;
      case "speak":
        if (
          isFinitePositive(record.audioMs) &&
          isFinitePositive(record.chars) &&
          typeof record.synthMs === "number"
        ) {
          synth.push(record.synthMs);
          synthFactor.push(record.synthMs / record.audioMs);
          synthPerChars.push((record.synthMs / record.chars) * 100);
          continue;
        }
        break;
    }
    skippedLines += 1;
  }

  return {
    loads: Object.fromEntries([...loads].map(([model, values]) => [model, stats(values)])),
    transcribe:
      decode.length === 0 ? null : { decodeMs: stats(decode), realTimeFactor: stats(decodeFactor) },
    speak:
      synth.length === 0
        ? null
        : {
            synthMs: stats(synth),
            realTimeFactor: stats(synthFactor),
            msPer100Chars: stats(synthPerChars),
          },
    skippedLines,
  };
}

const row = (label: string, value: Stats, unit = "") =>
  `${label.padEnd(28)} n=${String(value.count).padStart(4)}  p50=${format(value.p50)}${unit}  p90=${format(value.p90)}${unit}  max=${format(value.max)}${unit}`;

const format = (value: number) =>
  (Number.isInteger(value) ? String(value) : value.toFixed(2)).padStart(8);

export function renderVoiceTimingSummary(summary: VoiceTimingSummary): string {
  const out: string[] = [];
  for (const [model, value] of Object.entries(summary.loads)) {
    out.push(row(`load ${model}`, value, "ms"));
  }
  if (summary.transcribe) {
    out.push(row("transcribe decode", summary.transcribe.decodeMs, "ms"));
    out.push(row("transcribe real-time factor", summary.transcribe.realTimeFactor));
  }
  if (summary.speak) {
    out.push(row("speak synth", summary.speak.synthMs, "ms"));
    out.push(row("speak real-time factor", summary.speak.realTimeFactor));
    out.push(row("speak ms per 100 chars", summary.speak.msPer100Chars, "ms"));
  }
  if (out.length === 0) out.push("No voice timings recorded yet.");
  if (summary.skippedLines > 0) out.push(`(${summary.skippedLines} unreadable lines skipped)`);
  return out.join("\n");
}
