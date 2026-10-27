/**
 * Voice routes. Raw HTTP because the payloads are audio; recognition and synthesis run on the
 * machine that owns the environment, so every client shares its models and phrase book.
 */
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import * as ByteSize from "effect/ByteSize";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/http";
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage";

import { authenticateRawRouteWithScope } from "../http.ts";
import * as VoiceEngine from "./voiceEngine.ts";
import { pcm16leToFloat32 } from "./wav.ts";

const VOICE_ROUTE_PREFIX = "/api/voice";
// Five minutes of 16 kHz PCM16 (~9.6 MB) matches the client recording cap.
const MAX_TRANSCRIBE_BYTES = VoiceEngine.STT_SAMPLE_RATE * 2 * 300;
const MAX_SPEAK_BYTES = 256 * 1024;
// Under ~0.2 s is a mis-click on the push-to-talk key, not speech.
const MIN_SPEECH_BYTES = VoiceEngine.STT_SAMPLE_RATE * 2 * 0.2;

const decodeSpeakBody = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ text: Schema.String })),
);

const authenticate = authenticateRawRouteWithScope(AuthOrchestrationOperateScope);

const authFailures = {
  EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
  EnvironmentInternalError: HttpServerRespondable.toResponse,
  EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
} as const;

const readBody = (maxBytes: number) =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
    request.arrayBuffer.pipe(
      Effect.map((buffer) => new Uint8Array(buffer)),
      Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(maxBytes)),
      Effect.option,
    ),
  );

const bodyTooLarge = HttpServerResponse.jsonUnsafe(
  { error: "body_too_large_or_unreadable" },
  { status: 413 },
);

/** Setup problems are 503 so the client can tell "not installed" from "broke". */
const voiceFailureResponse = (error: VoiceEngine.VoiceFailure) => {
  switch (error._tag) {
    case "VoiceModelsMissingError":
      return HttpServerResponse.jsonUnsafe(
        { error: "missing_models", detail: error.detail },
        { status: 503 },
      );
    case "VoiceRuntimeUnavailableError":
      return HttpServerResponse.jsonUnsafe(
        { error: "unavailable", detail: error.detail },
        { status: 503 },
      );
    case "VoiceEngineError":
      return HttpServerResponse.jsonUnsafe(
        { error: "voice_failed", detail: error.detail },
        { status: 500 },
      );
  }
};

const makeRoutes = (engine: VoiceEngine.VoiceEngine["Service"]) => {
  const statusRoute = HttpRouter.add(
    "GET",
    `${VOICE_ROUTE_PREFIX}/status`,
    Effect.gen(function* () {
      yield* authenticate;
      return HttpServerResponse.jsonUnsafe(yield* engine.status, {
        headers: { "cache-control": "no-store" },
      });
    }).pipe(Effect.catchTags(authFailures)),
  );

  const transcribeRoute = HttpRouter.add(
    "POST",
    `${VOICE_ROUTE_PREFIX}/transcribe`,
    Effect.gen(function* () {
      yield* authenticate;
      const body = yield* readBody(MAX_TRANSCRIBE_BYTES);
      if (Option.isNone(body)) return bodyTooLarge;
      if (body.value.byteLength < MIN_SPEECH_BYTES) {
        return HttpServerResponse.jsonUnsafe({ text: "", rawText: "", audioMs: 0, decodeMs: 0 });
      }
      const result = yield* engine.transcribe(
        pcm16leToFloat32(body.value),
        VoiceEngine.STT_SAMPLE_RATE,
      );
      return HttpServerResponse.jsonUnsafe(result, { headers: { "cache-control": "no-store" } });
    }).pipe(
      Effect.catchTags({
        ...authFailures,
        VoiceModelsMissingError: (error) => Effect.succeed(voiceFailureResponse(error)),
        VoiceRuntimeUnavailableError: (error) => Effect.succeed(voiceFailureResponse(error)),
        VoiceEngineError: (error) => Effect.succeed(voiceFailureResponse(error)),
      }),
    ),
  );

  const speakRoute = HttpRouter.add(
    "POST",
    `${VOICE_ROUTE_PREFIX}/speak`,
    Effect.gen(function* () {
      yield* authenticate;
      const body = yield* readBody(MAX_SPEAK_BYTES);
      if (Option.isNone(body)) return bodyTooLarge;
      const request = yield* decodeSpeakBody(new TextDecoder().decode(body.value)).pipe(
        Effect.option,
      );
      if (Option.isNone(request)) {
        return HttpServerResponse.jsonUnsafe({ error: "expected_text" }, { status: 400 });
      }
      const speech = yield* engine.speak(request.value.text);
      if (Option.isNone(speech)) return HttpServerResponse.empty({ status: 204 });
      return HttpServerResponse.uint8Array(speech.value.wav, {
        contentType: "audio/wav",
        headers: {
          "cache-control": "no-store",
          "x-t3-voice-synth-ms": String(speech.value.synthMs),
        },
      });
    }).pipe(
      Effect.catchTags({
        ...authFailures,
        VoiceModelsMissingError: (error) => Effect.succeed(voiceFailureResponse(error)),
        VoiceRuntimeUnavailableError: (error) => Effect.succeed(voiceFailureResponse(error)),
        VoiceEngineError: (error) => Effect.succeed(voiceFailureResponse(error)),
      }),
    ),
  );

  return Layer.mergeAll(statusRoute, transcribeRoute, speakRoute);
};

// Routes close over the engine so its service never leaks into the router's request context.
export const layer = Layer.unwrap(
  Effect.gen(function* () {
    return makeRoutes(yield* VoiceEngine.VoiceEngine);
  }),
).pipe(Layer.provide(VoiceEngine.layer));
