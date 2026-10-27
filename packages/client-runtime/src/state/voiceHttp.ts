/**
 * Voice over the environment HTTP API. Audio is transcribed and synthesized by the environment
 * that owns the thread, with the same cookie, bearer, or DPoP credentials as its other requests.
 */
import type { VoiceStatus, VoiceTranscription } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpClient } from "effect/http";

import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import * as ManagedRelay from "../relay/managedRelay.ts";
import type { RemoteEnvironmentRequestError } from "../rpc/http.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";

const STATUS_TIMEOUT_MS = 8_000;
// Parakeet decodes well under real time, but a five-minute utterance on a slow CPU takes a while.
const TRANSCRIBE_TIMEOUT_MS = 120_000;
const SPEAK_TIMEOUT_MS = 60_000;

interface VoiceRequestInput {
  readonly prepared: PreparedConnection;
  readonly signer: Option.Option<ManagedRelay.ManagedRelayDpopSigner["Service"]>;
  readonly remoteAuthorization?: Option.Option<
    RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization["Service"]
  >;
}

export interface VoiceSpeech {
  readonly wav: Uint8Array;
  readonly synthMs: number;
}

export const fetchEnvironmentVoiceStatus = Effect.fn(
  "clientRuntime.state.fetchEnvironmentVoiceStatus",
)(function* (input: VoiceRequestInput) {
  return yield* executeAuthenticatedEnvironmentHttpRequest({
    ...input,
    group: "voice",
    method: "GET",
    url: (urls) => urls.status(),
    timeoutMs: STATUS_TIMEOUT_MS,
    request: ({ client, headers }) => client.status({ headers }),
  });
});

/** `pcm` is mono PCM16LE at the contract's sample rate. */
export const transcribeEnvironmentSpeech = Effect.fn(
  "clientRuntime.state.transcribeEnvironmentSpeech",
)(function* (input: VoiceRequestInput & { readonly pcm: Uint8Array }) {
  return yield* executeAuthenticatedEnvironmentHttpRequest({
    ...input,
    group: "voice",
    method: "POST",
    url: (urls) => urls.transcribe(),
    timeoutMs: TRANSCRIBE_TIMEOUT_MS,
    request: ({ client, headers }) => client.transcribe({ payload: input.pcm, headers }),
  });
});

/** None when the reply had nothing worth saying. */
export const synthesizeEnvironmentSpeech = Effect.fn(
  "clientRuntime.state.synthesizeEnvironmentSpeech",
)(function* (input: VoiceRequestInput & { readonly text: string }) {
  const response = yield* executeAuthenticatedEnvironmentHttpRequest({
    ...input,
    group: "voice",
    method: "POST",
    url: (urls) => urls.speak(),
    timeoutMs: SPEAK_TIMEOUT_MS,
    request: ({ client, headers }) => client.speak({ payload: { text: input.text }, headers }),
  });
  return response.body.byteLength === 0
    ? Option.none<VoiceSpeech>()
    : Option.some<VoiceSpeech>({
        wav: response.body,
        synthMs: response.headers["x-t3-voice-synth-ms"],
      });
});

export class VoiceClient extends Context.Service<
  VoiceClient,
  {
    readonly status: (
      prepared: PreparedConnection,
    ) => Effect.Effect<VoiceStatus, RemoteEnvironmentRequestError>;
    readonly transcribe: (
      prepared: PreparedConnection,
      pcm: Uint8Array,
    ) => Effect.Effect<VoiceTranscription, RemoteEnvironmentRequestError>;
    readonly speak: (
      prepared: PreparedConnection,
      text: string,
    ) => Effect.Effect<Option.Option<VoiceSpeech>, RemoteEnvironmentRequestError>;
  }
>()("@t3tools/client-runtime/state/voiceHttp/VoiceClient") {}

export const layer: Layer.Layer<VoiceClient, never, HttpClient.HttpClient> = Layer.effect(
  VoiceClient,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const signer = yield* Effect.serviceOption(ManagedRelay.ManagedRelayDpopSigner);
    const remoteAuthorization = yield* Effect.serviceOption(
      RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization,
    );
    const auth = { signer, remoteAuthorization };
    // Each HTTP fetch owns its span.
    return VoiceClient.of({
      status: Effect.fnUntraced(
        function* (prepared) {
          return yield* fetchEnvironmentVoiceStatus({ prepared, ...auth });
        },
        Effect.provideService(HttpClient.HttpClient, httpClient),
      ),
      transcribe: Effect.fnUntraced(
        function* (prepared, pcm) {
          return yield* transcribeEnvironmentSpeech({ prepared, pcm, ...auth });
        },
        Effect.provideService(HttpClient.HttpClient, httpClient),
      ),
      speak: Effect.fnUntraced(
        function* (prepared, text) {
          return yield* synthesizeEnvironmentSpeech({ prepared, text, ...auth });
        },
        Effect.provideService(HttpClient.HttpClient, httpClient),
      ),
    });
  }),
);
