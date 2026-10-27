/**
 * One NDJSON line per model load, transcription, and synthesis, so real latency can be read
 * off a week of use. `scripts/voice/summarize-timings.ts` reads the file back.
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export const VOICE_TIMINGS_FILE = "voice-timings.ndjson";

const loadFields = {
  kind: Schema.Literal("load"),
  model: Schema.Literals(["stt", "tts"]),
  ms: Schema.Number,
};
const transcribeFields = {
  kind: Schema.Literal("transcribe"),
  audioMs: Schema.Number,
  decodeMs: Schema.Number,
  chars: Schema.Number,
};
const speakFields = {
  kind: Schema.Literal("speak"),
  chars: Schema.Number,
  synthMs: Schema.Number,
  audioMs: Schema.Number,
};

const VoiceTimingRecord = Schema.Union([
  Schema.Struct(loadFields),
  Schema.Struct(transcribeFields),
  Schema.Struct(speakFields),
]);
export type VoiceTimingRecord = typeof VoiceTimingRecord.Type;

const VoiceTimingLine = Schema.Union([
  Schema.Struct({ at: Schema.String, ...loadFields }),
  Schema.Struct({ at: Schema.String, ...transcribeFields }),
  Schema.Struct({ at: Schema.String, ...speakFields }),
]);
const encodeLine = Schema.encodeSync(Schema.fromJsonString(VoiceTimingLine));

/** Best effort: a timing that cannot be written must never fail the voice request. */
export const appendVoiceTiming = Effect.fn("voice.appendTiming")(function* (
  filePath: string,
  record: VoiceTimingRecord,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const at = DateTime.formatIso(yield* DateTime.now);
  const line = `${encodeLine({ at, ...record })}\n`;
  yield* fs
    .makeDirectory(path.dirname(filePath), { recursive: true })
    .pipe(Effect.andThen(fs.writeFileString(filePath, line, { flag: "a" })), Effect.ignore);
});
