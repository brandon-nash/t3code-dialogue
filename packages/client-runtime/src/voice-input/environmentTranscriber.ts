import type { VoiceTranscription } from "@t3tools/contracts";

import {
  throwIfVoiceTranscriptionAborted,
  VoiceTranscriptionError,
  type VoiceTranscriber,
} from "./transcription.ts";

/**
 * A transcriber backed by an environment's speech model. Decoding the recording to 16 kHz
 * PCM16 is platform work the caller supplies; the environment does the recognition. The
 * request cannot be interrupted once sent, so a cancelled signal is honored after it settles.
 */
export function createEnvironmentVoiceTranscriber(input: {
  readonly locale?: string;
  readonly decodeRecording: (uri: string, signal: AbortSignal) => Promise<Uint8Array>;
  readonly transcribe: (pcm: Uint8Array) => Promise<VoiceTranscription>;
}): VoiceTranscriber {
  return {
    prepare: async ({ signal }) => {
      throwIfVoiceTranscriptionAborted(signal);
      return {
        locale: input.locale ?? "en-US",
        transcribe: async (uri, options) => {
          throwIfVoiceTranscriptionAborted(options.signal);
          const pcm = await input.decodeRecording(uri, options.signal);
          throwIfVoiceTranscriptionAborted(options.signal);
          let result: VoiceTranscription;
          try {
            result = await input.transcribe(pcm);
          } catch (cause) {
            throw new VoiceTranscriptionError(
              "transcription-failed",
              cause instanceof Error ? cause.message : "Transcription failed.",
              { cause },
            );
          }
          throwIfVoiceTranscriptionAborted(options.signal);
          return result.text;
        },
      };
    },
  };
}
