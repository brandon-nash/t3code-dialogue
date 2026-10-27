/**
 * MediaRecorder behind the shared voice-input controller's recorder contract. A finished
 * recording is a blob: URL, so the controller can hand it to a transcriber and revoke it like
 * a file.
 */
import type { VoiceRecorder, VoiceRecorderStatus } from "@t3tools/client-runtime/voice-input";

export class BrowserVoiceRecorder implements VoiceRecorder {
  uri: string | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private limitTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping: Promise<void> | null = null;
  private readonly onStatus: (status: VoiceRecorderStatus) => void;

  constructor(onStatus: (status: VoiceRecorderStatus) => void) {
    this.onStatus = onStatus;
  }

  /** Opens the microphone; the browser's permission prompt happens here, not at record time. */
  async acquireMicrophone(): Promise<{ readonly granted: boolean; readonly canAskAgain: boolean }> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      return { granted: true, canAskAgain: true };
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        return { granted: false, canAskAgain: true };
      }
      throw cause;
    }
  }

  async prepareToRecordAsync(): Promise<void> {
    if (!this.stream) throw new Error("The microphone is not open.");
    const recorder = new MediaRecorder(this.stream);
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      this.onStatus({ isFinished: false, hasError: true, error: null, url: null });
    });
    this.recorder = recorder;
    this.chunks = [];
    this.uri = null;
    this.stopping = null;
  }

  record(options: { readonly forDuration: number }): void {
    const recorder = this.recorder;
    if (!recorder) return;
    recorder.start();
    this.limitTimer = setTimeout(() => {
      if (recorder.state !== "recording") return;
      void this.finish(recorder).then(() => {
        this.onStatus({ isFinished: true, hasError: false, error: null, url: this.uri });
      });
    }, options.forDuration * 1000);
  }

  async stop(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return;
    await this.finish(recorder);
  }

  release(): void {
    if (this.limitTimer) clearTimeout(this.limitTimer);
    this.limitTimer = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }

  private finish(recorder: MediaRecorder): Promise<void> {
    if (this.limitTimer) clearTimeout(this.limitTimer);
    this.limitTimer = null;
    this.stopping ??= new Promise((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          this.uri = URL.createObjectURL(new Blob(this.chunks, { type: recorder.mimeType }));
          resolve();
        },
        { once: true },
      );
      recorder.stop();
    });
    return this.stopping;
  }
}
