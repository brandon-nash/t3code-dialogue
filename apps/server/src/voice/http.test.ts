import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  AuthSessionId,
  type AuthEnvironmentScope,
  EnvironmentAuthenticatedAuth,
  EnvironmentAuthenticatedPrincipal,
  EnvironmentHttpApi,
  VOICE_STT_SAMPLE_RATE,
  VOICE_SYNTH_MS_HEADER,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import * as VoiceHttp from "./http.ts";
import * as VoiceEngine from "./voiceEngine.ts";

class VoiceTestApi extends HttpApi.make("environment").add(EnvironmentHttpApi.groups.voice) {}

const WAV = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const ONE_SECOND_OF_PCM = new Uint8Array(VOICE_STT_SAMPLE_RATE * 2);

// Serves the voice routes over a recording engine; `scopes` decides what the caller may do.
const serveVoiceHttp = (scopes: ReadonlyArray<AuthEnvironmentScope>) =>
  Effect.gen(function* () {
    const transcribed: Array<{ readonly samples: number; readonly sampleRate: number }> = [];
    const spoken: Array<string> = [];
    const engine = VoiceEngine.VoiceEngine.of({
      voiceDir: "/tmp/voice",
      status: Effect.succeed({
        voiceDir: "/tmp/voice",
        stt: { state: "idle" },
        tts: { state: "missing_models", detail: "Kokoro model not found." },
      }),
      transcribe: (samples, sampleRate) =>
        Effect.sync(() => {
          transcribed.push({ samples: samples.length, sampleRate });
          return { text: "Ship it 🚢", rawText: "ship it.", audioMs: 1000, decodeMs: 42 };
        }),
      speak: (markdown) =>
        Effect.sync(() => {
          spoken.push(markdown);
          return markdown.includes("```")
            ? Option.none()
            : Option.some({ wav: WAV, spokenText: markdown, synthMs: 17 });
        }),
    });
    const routes = HttpApiBuilder.layer(VoiceTestApi).pipe(
      Layer.provide(VoiceHttp.layerRoutes),
      Layer.provide(Layer.succeed(VoiceEngine.VoiceEngine, engine)),
      Layer.provide(
        Layer.succeed(EnvironmentAuthenticatedAuth, (effect) =>
          Effect.suspend(() =>
            effect.pipe(
              Effect.provideService(EnvironmentAuthenticatedPrincipal, {
                sessionId: AuthSessionId.make("test-session"),
                subject: "test",
                method: "bearer-access-token",
                scopes: new Set<AuthEnvironmentScope>(scopes),
              }),
            ),
          ),
        ),
      ),
      Layer.provide(HttpPlatform.layer),
      Layer.provide(Etag.layerWeak),
      Layer.provide(NodeServices.layer),
    );
    const { handler, dispose } = HttpRouter.toWebHandler(routes, { disableLogger: true });
    yield* Effect.addFinalizer(() => Effect.promise(dispose));
    const send = (path: string, init?: RequestInit) =>
      Effect.promise(() => handler(new Request(`http://localhost${path}`, init)));
    return { send, transcribed, spoken };
  });

it.effect("serves status, transcription, and speech to an operator", () =>
  Effect.gen(function* () {
    const { send, transcribed, spoken } = yield* serveVoiceHttp(["orchestration:operate"]);

    const status = yield* send("/api/voice/status");
    expect(status.status).toBe(200);
    expect(yield* Effect.promise(() => status.json())).toMatchObject({
      stt: { state: "idle" },
      tts: { state: "missing_models" },
    });

    const transcription = yield* send("/api/voice/transcribe", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: ONE_SECOND_OF_PCM,
    });
    expect(transcription.status).toBe(200);
    expect(yield* Effect.promise(() => transcription.json())).toMatchObject({
      text: "Ship it 🚢",
      decodeMs: 42,
    });
    expect(transcribed).toEqual([
      { samples: VOICE_STT_SAMPLE_RATE, sampleRate: VOICE_STT_SAMPLE_RATE },
    ]);

    const speech = yield* send("/api/voice/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "All tests pass." }),
    });
    expect(speech.status).toBe(200);
    expect(speech.headers.get("content-type")).toContain("audio/wav");
    expect(speech.headers.get(VOICE_SYNTH_MS_HEADER)).toBe("17");
    expect(new Uint8Array(yield* Effect.promise(() => speech.arrayBuffer()))).toEqual(WAV);
    expect(spoken).toEqual(["All tests pass."]);
  }),
);

it.effect("skips the engine for a mis-click and answers an unspeakable reply with no audio", () =>
  Effect.gen(function* () {
    const { send, transcribed } = yield* serveVoiceHttp(["orchestration:operate"]);

    const tap = yield* send("/api/voice/transcribe", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array(100),
    });
    expect(yield* Effect.promise(() => tap.json())).toEqual({
      text: "",
      rawText: "",
      audioMs: 0,
      decodeMs: 0,
    });
    expect(transcribed).toEqual([]);

    const silent = yield* send("/api/voice/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "```ts\nconst x = 1;\n```" }),
    });
    expect(silent.status).toBe(200);
    expect(silent.headers.get(VOICE_SYNTH_MS_HEADER)).toBe("0");
    expect((yield* Effect.promise(() => silent.arrayBuffer())).byteLength).toBe(0);
  }),
);

it.effect("requires the operate scope", () =>
  Effect.gen(function* () {
    const { send, transcribed } = yield* serveVoiceHttp(["orchestration:read"]);
    const status = yield* send("/api/voice/status");
    expect(status.status).toBe(403);
    expect(yield* Effect.promise(() => status.json())).toMatchObject({
      _tag: "EnvironmentScopeRequiredError",
    });
    const transcription = yield* send("/api/voice/transcribe", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: ONE_SECOND_OF_PCM,
    });
    expect(transcription.status).toBe(403);
    expect(transcribed).toEqual([]);
  }),
);
