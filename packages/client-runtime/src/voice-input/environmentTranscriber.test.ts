import { describe, expect, it, vi } from "vite-plus/test";

import { createEnvironmentVoiceTranscriber } from "./environmentTranscriber.ts";
import { VoiceTranscriptionError } from "./transcription.ts";

const PCM = new Uint8Array([1, 0, 2, 0]);
const RESULT = { text: "Ship it 🚢", rawText: "ship it.", audioMs: 1000, decodeMs: 42 };

describe("createEnvironmentVoiceTranscriber", () => {
  it("decodes the recording, sends the PCM, and returns the text", async () => {
    const decodeRecording = vi.fn(async () => PCM);
    const transcribe = vi.fn(async () => RESULT);
    const transcriber = createEnvironmentVoiceTranscriber({ decodeRecording, transcribe });
    const signal = new AbortController().signal;

    const prepared = await transcriber.prepare({ signal });
    expect(prepared.locale).toBe("en-US");
    await expect(prepared.transcribe("blob:recording", { signal })).resolves.toBe("Ship it 🚢");
    expect(decodeRecording).toHaveBeenCalledWith("blob:recording", signal);
    expect(transcribe).toHaveBeenCalledWith(PCM);
  });

  it("drops a result that arrives after cancellation", async () => {
    const controller = new AbortController();
    const transcriber = createEnvironmentVoiceTranscriber({
      decodeRecording: async () => PCM,
      transcribe: async () => {
        controller.abort();
        return RESULT;
      },
    });
    const prepared = await transcriber.prepare({ signal: controller.signal });
    await expect(
      prepared.transcribe("blob:recording", { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("reports a failed request as a transcription error with the server's reason", async () => {
    const transcriber = createEnvironmentVoiceTranscriber({
      decodeRecording: async () => PCM,
      transcribe: async () => {
        throw new Error("Parakeet failed to load.");
      },
    });
    const signal = new AbortController().signal;
    const prepared = await transcriber.prepare({ signal });
    const error = await prepared.transcribe("blob:recording", { signal }).catch((cause) => cause);
    expect(error).toBeInstanceOf(VoiceTranscriptionError);
    expect(error).toMatchObject({
      code: "transcription-failed",
      message: "Parakeet failed to load.",
    });
  });
});
