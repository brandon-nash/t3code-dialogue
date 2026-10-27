/**
 * Client for the server's /api/voice routes (spike). Talks to the primary environment, the
 * same server the desktop app runs or the browser was opened from, with the same
 * credentials the rest of the primary HTTP client uses.
 */
import { readDesktopPrimaryBearerToken } from "../environments/primary/desktopAuth";
import { resolvePrimaryEnvironmentHttpUrl } from "../environments/primary/target";

export type VoiceComponentState =
  | { readonly state: "ready" | "idle" }
  | { readonly state: "missing_models" | "unavailable"; readonly detail: string };

export interface VoiceStatus {
  readonly voiceDir: string;
  readonly stt: VoiceComponentState;
  readonly tts: VoiceComponentState;
}

export interface VoiceTranscription {
  readonly text: string;
  readonly rawText: string;
  readonly audioMs: number;
  readonly decodeMs: number;
}

export class VoiceRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "VoiceRequestError";
    this.status = status;
  }
}

async function voiceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = resolvePrimaryEnvironmentHttpUrl(`/api/voice/${path}`);
  const sameOrigin =
    typeof window !== "undefined" &&
    window.desktopBridge === undefined &&
    new URL(url).origin === window.location.origin;
  const headers = new Headers(init.headers);
  if (!sameOrigin) {
    const token = await readDesktopPrimaryBearerToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, {
    ...init,
    headers,
    credentials: sameOrigin ? "include" : "omit",
  });
  if (!response.ok && response.status !== 204) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new VoiceRequestError(
      body?.detail ?? `Voice request failed (${response.status}).`,
      response.status,
    );
  }
  return response;
}

export async function fetchVoiceStatus(signal?: AbortSignal): Promise<VoiceStatus> {
  const response = await voiceFetch("status", signal ? { signal } : {});
  return (await response.json()) as VoiceStatus;
}

/** `pcm` is mono PCM16LE at 16 kHz. */
export async function transcribeSpeech(
  pcm: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<VoiceTranscription> {
  const response = await voiceFetch("transcribe", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: pcm,
    ...(signal ? { signal } : {}),
  });
  return (await response.json()) as VoiceTranscription;
}

/** Returns WAV bytes, or null when the reply had nothing worth saying. */
export async function synthesizeReply(text: string, signal?: AbortSignal): Promise<Blob | null> {
  const response = await voiceFetch("speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    ...(signal ? { signal } : {}),
  });
  if (response.status === 204) return null;
  return await response.blob();
}
