/**
 * Voice for a thread's environment. Requests go through the connection runtime, so the server
 * that owns the thread does the work with the credentials the rest of its traffic uses.
 */
import {
  createRuntimeCommand,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { VoiceClient } from "@t3tools/client-runtime/state/voiceHttp";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type VoiceStatus,
  type VoiceTranscription,
} from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AtomRegistry } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentSession, readEnvironmentScope } from "../state/session";

export type VoiceAvailability =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly status: VoiceStatus };

class VoiceRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceRequestError";
  }
}

class VoiceEnvironmentDisconnectedError extends Data.TaggedError(
  "VoiceEnvironmentDisconnectedError",
)<{}> {}

const preparedConnection = (environmentId: EnvironmentId, registry: AtomRegistry.AtomRegistry) =>
  Effect.suspend(() =>
    Effect.fromOption(
      registry.get(environmentSession.preparedConnectionValueAtom(environmentId)),
      () => new VoiceEnvironmentDisconnectedError(),
    ),
  );

const statusCommand = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:voice:status",
  execute: Effect.fn("web.voice.status")(function* (
    input: { readonly environmentId: EnvironmentId },
    registry: AtomRegistry.AtomRegistry,
  ) {
    const prepared = yield* preparedConnection(input.environmentId, registry);
    return yield* (yield* VoiceClient).status(prepared);
  }),
});

const transcribeCommand = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:voice:transcribe",
  execute: Effect.fn("web.voice.transcribe")(function* (
    input: { readonly environmentId: EnvironmentId; readonly pcm: Uint8Array },
    registry: AtomRegistry.AtomRegistry,
  ) {
    const prepared = yield* preparedConnection(input.environmentId, registry);
    return yield* (yield* VoiceClient).transcribe(prepared, input.pcm);
  }),
});

const speakCommand = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:voice:speak",
  execute: Effect.fn("web.voice.speak")(function* (
    input: { readonly environmentId: EnvironmentId; readonly text: string },
    registry: AtomRegistry.AtomRegistry,
  ) {
    const prepared = yield* preparedConnection(input.environmentId, registry);
    return yield* (yield* VoiceClient).speak(prepared, input.text);
  }),
});

const QUIET = { reportFailure: false, reportDefect: false } as const;

const tagOf = (cause: unknown): string | null =>
  typeof cause === "object" && cause !== null && "_tag" in cause && typeof cause._tag === "string"
    ? cause._tag
    : null;

/** An environment that cannot serve voice at all, as opposed to one whose request failed. */
function isVoiceAbsent(cause: unknown): boolean {
  switch (tagOf(cause)) {
    case "VoiceEnvironmentDisconnectedError":
    case "EnvironmentScopeRequiredError":
      return true;
    case "RemoteEnvironmentAuthUndeclaredStatusError":
      return (cause as { readonly status: number }).status === 404;
    default:
      return false;
  }
}

function describeFailure(cause: unknown): VoiceRequestError {
  switch (tagOf(cause)) {
    case "VoiceUnavailableError":
    case "VoiceFailedError":
      return new VoiceRequestError((cause as { readonly detail: string }).detail);
    case "VoiceEnvironmentDisconnectedError":
      return new VoiceRequestError("The environment is not connected.");
    case "EnvironmentScopeRequiredError":
      return new VoiceRequestError("This connection cannot use voice.");
    case "RemoteEnvironmentAuthTimeoutError":
      return new VoiceRequestError("The voice request timed out.");
    default:
      return new VoiceRequestError(
        cause instanceof Error && cause.message.length > 0
          ? cause.message
          : "Voice request failed.",
      );
  }
}

/** Absent covers servers without voice routes and sessions that may not operate them. */
export async function fetchVoiceStatus(environmentId: EnvironmentId): Promise<VoiceAvailability> {
  if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) {
    return { kind: "absent" };
  }
  const result = await runAtomCommand(appAtomRegistry, statusCommand, { environmentId }, QUIET);
  if (result._tag === "Success") return { kind: "present", status: result.value };
  const cause = squashAtomCommandFailure(result);
  if (isVoiceAbsent(cause)) return { kind: "absent" };
  throw describeFailure(cause);
}

/** `pcm` is mono PCM16LE at 16 kHz. */
export async function transcribeSpeech(
  environmentId: EnvironmentId,
  pcm: Uint8Array,
): Promise<VoiceTranscription> {
  const result = await runAtomCommand(
    appAtomRegistry,
    transcribeCommand,
    { environmentId, pcm },
    QUIET,
  );
  if (result._tag === "Success") return result.value;
  throw describeFailure(squashAtomCommandFailure(result));
}

/** Returns WAV audio, or null when the reply had nothing worth saying. */
export async function synthesizeReply(
  environmentId: EnvironmentId,
  text: string,
): Promise<Blob | null> {
  const result = await runAtomCommand(
    appAtomRegistry,
    speakCommand,
    { environmentId, text },
    QUIET,
  );
  if (result._tag !== "Success") throw describeFailure(squashAtomCommandFailure(result));
  return Option.isSome(result.value)
    ? new Blob([result.value.value.wav as BlobPart], { type: "audio/wav" })
    : null;
}
