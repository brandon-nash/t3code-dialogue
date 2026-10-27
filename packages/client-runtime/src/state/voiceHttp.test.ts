import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, VOICE_SYNTH_MS_HEADER } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { BearerConnectionTarget, type PreparedConnection } from "../connection/model.ts";
import * as RpcHttp from "../rpc/http.ts";
import {
  fetchEnvironmentVoiceStatus,
  synthesizeEnvironmentSpeech,
  transcribeEnvironmentSpeech,
} from "./voiceHttp.ts";

const TARGET = new BearerConnectionTarget({
  environmentId: EnvironmentId.make("remote-environment"),
  label: "Build box",
  connectionId: "connection-1",
});
const PREPARED: PreparedConnection = {
  environmentId: TARGET.environmentId,
  label: TARGET.label,
  httpBaseUrl: "https://remote.example.test",
  socketUrl: "wss://remote.example.test/ws",
  httpAuthorization: { _tag: "Bearer", token: "remote-token" },
  target: TARGET,
};
const COOKIE_PREPARED: PreparedConnection = { ...PREPARED, httpAuthorization: null };
const STATUS = {
  voiceDir: "/home/brandon/.t3/voice",
  stt: { state: "ready" },
  tts: { state: "missing_models", detail: "Kokoro model not found." },
};
const PCM = new Uint8Array([1, 0, 2, 0, 3, 0]);
const WAV = new Uint8Array([82, 73, 70, 70]);

function makeHarness(reply: (request: Request) => Response | Promise<Response>) {
  const calls: Array<Request> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push(request);
    return reply(request);
  };
  return { calls, httpLayer: RpcHttp.layerRemoteHttpClient(fetchFn) };
}

describe("voice over the environment HTTP API", () => {
  it.effect("asks the thread's environment, not the page origin, with its own credentials", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => Response.json(STATUS));
      const status = yield* fetchEnvironmentVoiceStatus({
        prepared: PREPARED,
        signer: Option.none(),
      }).pipe(Effect.provide(harness.httpLayer));

      expect(status).toEqual(STATUS);
      const request = harness.calls[0]!;
      expect(request.url).toBe("https://remote.example.test/api/voice/status");
      expect(request.headers.get("authorization")).toBe("Bearer remote-token");
    }),
  );

  it.effect("posts raw PCM and reads the transcription", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() =>
        Response.json({ text: "Ship it 🚢", rawText: "ship it.", audioMs: 1000, decodeMs: 42 }),
      );
      const transcription = yield* transcribeEnvironmentSpeech({
        prepared: PREPARED,
        signer: Option.none(),
        pcm: PCM,
      }).pipe(Effect.provide(harness.httpLayer));

      expect(transcription.text).toBe("Ship it 🚢");
      const request = harness.calls[0]!;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://remote.example.test/api/voice/transcribe");
      expect(request.headers.get("content-type")).toBe("application/octet-stream");
      expect(new Uint8Array(yield* Effect.promise(() => request.arrayBuffer()))).toEqual(PCM);
    }),
  );

  it.effect("returns WAV bytes with the synthesis time, or nothing for an empty body", () =>
    Effect.gen(function* () {
      const harness = makeHarness((request) =>
        request.url.endsWith("/speak")
          ? new Response(WAV, {
              headers: { "content-type": "audio/wav", [VOICE_SYNTH_MS_HEADER]: "17" },
            })
          : Response.error(),
      );
      const speech = yield* synthesizeEnvironmentSpeech({
        prepared: PREPARED,
        signer: Option.none(),
        text: "All tests pass.",
      }).pipe(Effect.provide(harness.httpLayer));
      expect(speech).toEqual(Option.some({ wav: WAV, synthMs: 17 }));
      expect(JSON.parse(yield* Effect.promise(() => harness.calls[0]!.text()))).toEqual({
        text: "All tests pass.",
      });

      const silentHarness = makeHarness(
        () =>
          new Response(new Uint8Array(0), {
            headers: { "content-type": "audio/wav", [VOICE_SYNTH_MS_HEADER]: "0" },
          }),
      );
      const silence = yield* synthesizeEnvironmentSpeech({
        prepared: PREPARED,
        signer: Option.none(),
        text: "```ts\nconst x = 1;\n```",
      }).pipe(Effect.provide(silentHarness.httpLayer));
      expect(Option.isNone(silence)).toBe(true);
    }),
  );

  it.effect("sends cookies to a cookie-authenticated environment", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => Response.json(STATUS));
      yield* fetchEnvironmentVoiceStatus({ prepared: COOKIE_PREPARED, signer: Option.none() }).pipe(
        Effect.provide(harness.httpLayer),
      );
      const request = harness.calls[0]!;
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.credentials).toBe("include");
    }),
  );

  it.effect("reports an older server without voice routes as a 404, not a decode error", () =>
    Effect.gen(function* () {
      const harness = makeHarness(() => new Response("Not found", { status: 404 }));
      const error = yield* fetchEnvironmentVoiceStatus({
        prepared: PREPARED,
        signer: Option.none(),
      }).pipe(Effect.provide(harness.httpLayer), Effect.flip);
      expect(error).toMatchObject({
        _tag: "RemoteEnvironmentAuthUndeclaredStatusError",
        status: 404,
      });
    }),
  );
});
