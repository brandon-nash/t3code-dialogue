/**
 * Voice routes in the typed environment HTTP API. Recognition and synthesis run on the machine
 * that owns the environment, so every client shares its models and phrase book.
 */
import {
  AuthOrchestrationOperateScope,
  EnvironmentHttpApi,
  VOICE_STT_SAMPLE_RATE,
  VOICE_SYNTH_MS_HEADER,
  VoiceFailedError,
  VoiceUnavailableError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";

import {
  annotateEnvironmentRequest,
  failEnvironmentInvalidRequest,
  requireEnvironmentScope,
} from "../auth/http.ts";
import * as VoiceEngine from "./voiceEngine.ts";
import { pcm16leToFloat32 } from "./wav.ts";

// Five minutes of 16 kHz PCM16 (~9.6 MB) matches the client recording cap.
const MAX_TRANSCRIBE_BYTES = VOICE_STT_SAMPLE_RATE * 2 * 300;
// Under ~0.2 s is a mis-click on the push-to-talk key, not speech.
const MIN_SPEECH_BYTES = VOICE_STT_SAMPLE_RATE * 2 * 0.2;
const EMPTY_TRANSCRIPTION = { text: "", rawText: "", audioMs: 0, decodeMs: 0 };

const toRouteError = (error: VoiceEngine.VoiceFailure) => {
  switch (error._tag) {
    case "VoiceModelsMissingError":
      return new VoiceUnavailableError({ reason: "missing_models", detail: error.detail });
    case "VoiceRuntimeUnavailableError":
      return new VoiceUnavailableError({ reason: "runtime_unavailable", detail: error.detail });
    case "VoiceEngineError":
      return new VoiceFailedError({ detail: error.detail });
  }
};

export const layerRoutes = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "voice",
  Effect.fnUntraced(function* (handlers) {
    const engine = yield* VoiceEngine.VoiceEngine;
    return handlers
      .handle(
        "status",
        Effect.fn("environment.voice.status")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          return yield* engine.status;
        }),
      )
      .handle(
        "transcribe",
        Effect.fn("environment.voice.transcribe")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          if (args.payload.byteLength > MAX_TRANSCRIBE_BYTES) {
            return yield* failEnvironmentInvalidRequest("payload_too_large");
          }
          if (args.payload.byteLength < MIN_SPEECH_BYTES) return EMPTY_TRANSCRIPTION;
          return yield* engine
            .transcribe(pcm16leToFloat32(args.payload), VOICE_STT_SAMPLE_RATE)
            .pipe(Effect.mapError(toRouteError));
        }),
      )
      .handle(
        "speak",
        Effect.fn("environment.voice.speak")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          const speech = yield* engine.speak(args.payload.text).pipe(Effect.mapError(toRouteError));
          // An empty body means the reply had nothing worth saying.
          return HttpApiSchema.withHeaders({
            body: Option.isSome(speech) ? speech.value.wav : new Uint8Array(0),
            headers: {
              [VOICE_SYNTH_MS_HEADER]: Option.isSome(speech) ? speech.value.synthMs : 0,
            },
          });
        }),
      );
  }),
);

export const layer = layerRoutes.pipe(Layer.provide(VoiceEngine.layer));
