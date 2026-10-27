/** Push-to-talk dictation: record, convert to 16 kHz PCM, transcribe on the server's Parakeet. */
import { useEffect, useRef, useState } from "react";

import { useStableCallback } from "../hooks/useStableCallback";
import { recordingToSpeechPcm } from "./pcm";
import { transcribeSpeech, VoiceRequestError } from "./voiceApi";

// Matches the server's body cap; push-to-talk past five minutes is a stuck key.
const MAX_RECORDING_MS = 5 * 60 * 1000;

export type VoiceInputPhase = "idle" | "starting" | "recording" | "transcribing";

interface ActiveRecording {
  readonly recorder: MediaRecorder;
  readonly stream: MediaStream;
  readonly chunks: Blob[];
  readonly limitTimer: ReturnType<typeof setTimeout>;
  readonly onEscape: (event: KeyboardEvent) => void;
  discard: boolean;
}

function describeVoiceError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it in your browser or system settings.";
  }
  if (cause instanceof DOMException && cause.name === "NotFoundError") {
    return "No microphone found.";
  }
  if (cause instanceof VoiceRequestError) return cause.message;
  return cause instanceof Error ? cause.message : "Voice input failed.";
}

export function useVoiceInput(options: {
  readonly onTranscript: (text: string) => void;
  readonly onRecordingStart?: () => void;
  readonly onError: (message: string) => void;
}) {
  const [phase, setPhase] = useState<VoiceInputPhase>("idle");
  const phaseRef = useRef<VoiceInputPhase>("idle");
  const activeRef = useRef<ActiveRecording | null>(null);

  const updatePhase = (next: VoiceInputPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const release = (recording: ActiveRecording) => {
    clearTimeout(recording.limitTimer);
    window.removeEventListener("keydown", recording.onEscape, { capture: true });
    for (const track of recording.stream.getTracks()) track.stop();
    if (activeRef.current === recording) activeRef.current = null;
  };

  const finish = useStableCallback(async (recording: ActiveRecording) => {
    release(recording);
    if (recording.discard) {
      updatePhase("idle");
      return;
    }
    updatePhase("transcribing");
    try {
      const blob = new Blob(recording.chunks, { type: recording.recorder.mimeType });
      const result = await transcribeSpeech(await recordingToSpeechPcm(blob));
      if (result.text.length > 0) options.onTranscript(result.text);
    } catch (cause) {
      options.onError(describeVoiceError(cause));
    } finally {
      updatePhase("idle");
    }
  });

  const cancel = useStableCallback(() => {
    const recording = activeRef.current;
    if (!recording) return;
    recording.discard = true;
    if (recording.recorder.state === "recording") recording.recorder.stop();
    else release(recording);
  });

  const start = useStableCallback(async () => {
    if (phaseRef.current !== "idle") return;
    updatePhase("starting");
    options.onRecordingStart?.();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const recorder = new MediaRecorder(stream);
      const recording: ActiveRecording = {
        recorder,
        stream,
        chunks: [],
        discard: false,
        limitTimer: setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, MAX_RECORDING_MS),
        onEscape: (event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          cancel();
        },
      };
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recording.chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => void finish(recording), { once: true });
      window.addEventListener("keydown", recording.onEscape, { capture: true });
      activeRef.current = recording;
      recorder.start();
      updatePhase("recording");
    } catch (cause) {
      updatePhase("idle");
      options.onError(describeVoiceError(cause));
    }
  });

  const stop = useStableCallback(() => {
    const recording = activeRef.current;
    if (recording?.recorder.state === "recording") recording.recorder.stop();
  });

  const toggle = useStableCallback(() => {
    if (phaseRef.current === "idle") void start();
    else if (phaseRef.current === "recording") stop();
  });

  // oxlint-disable-next-line t3code/react-effect-budget -- Leaving the thread mid-sentence must drop the recording and release the microphone.
  useEffect(() => cancel, [cancel]);

  return { phase, phaseRef, start, stop, cancel, toggle };
}
