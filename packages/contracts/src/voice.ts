import * as Schema from "effect/Schema";
import * as HttpServerRespondable from "effect/http/HttpServerRespondable";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

/** Mono PCM16LE at this rate is the only audio the transcribe route accepts. */
export const VOICE_STT_SAMPLE_RATE = 16_000;

export const VoiceComponentState = Schema.Union([
  Schema.Struct({ state: Schema.Literals(["ready", "idle"]) }),
  Schema.Struct({
    state: Schema.Literals(["missing_models", "unavailable"]),
    detail: Schema.String,
  }),
]);
export type VoiceComponentState = typeof VoiceComponentState.Type;

export const VoiceStatus = Schema.Struct({
  voiceDir: Schema.String,
  stt: VoiceComponentState,
  tts: VoiceComponentState,
});
export type VoiceStatus = typeof VoiceStatus.Type;

export const VoiceTranscription = Schema.Struct({
  text: Schema.String,
  rawText: Schema.String,
  audioMs: Schema.Number,
  decodeMs: Schema.Number,
});
export type VoiceTranscription = typeof VoiceTranscription.Type;

export const VoiceSpeakRequest = Schema.Struct({ text: Schema.String });
export type VoiceSpeakRequest = typeof VoiceSpeakRequest.Type;

export const VOICE_SYNTH_MS_HEADER = "x-t3-voice-synth-ms";

export const VoiceUnavailableReason = Schema.Literals(["missing_models", "runtime_unavailable"]);
export type VoiceUnavailableReason = typeof VoiceUnavailableReason.Type;

/** Setup problems: the environment can run without voice and says what is missing. */
export class VoiceUnavailableError extends Schema.TaggedError<VoiceUnavailableError>()(
  "VoiceUnavailableError",
  {
    reason: VoiceUnavailableReason,
    detail: Schema.String,
  },
  { httpApiStatus: 503 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(VoiceUnavailableError)(this, { status: 503 });
  }

  override get message(): string {
    return this.detail;
  }
}

export class VoiceFailedError extends Schema.TaggedError<VoiceFailedError>()(
  "VoiceFailedError",
  {
    detail: Schema.String,
  },
  { httpApiStatus: 500 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(VoiceFailedError)(this, { status: 500 });
  }

  override get message(): string {
    return this.detail;
  }
}
