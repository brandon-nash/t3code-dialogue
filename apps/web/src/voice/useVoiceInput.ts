/**
 * Push-to-talk dictation on web: the shared voice-input controller drives a MediaRecorder and
 * the thread environment's speech model, and commits into the composer draft it captured.
 */
import {
  createEnvironmentVoiceTranscriber,
  VoiceInputController,
  type VoiceDraftSnapshot,
  type VoiceInputPhase,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useStableCallback } from "../hooks/useStableCallback";
import { BrowserVoiceRecorder } from "./browserRecorder";
import { transcriptReplacement } from "./draftReplacement";
import { recordingToSpeechPcm } from "./pcm";
import { transcribeSpeech } from "./voiceApi";

export type { VoiceInputPhase };

export interface VoiceDraftAdapter {
  readonly ownerKey: string;
  /** Text and caret in the same coordinates `replaceRange` takes. */
  readonly read: () => { readonly text: string; readonly cursor: number };
  /** False when the composer cannot take input right now. */
  readonly replaceRange: (
    start: number,
    end: number,
    insertion: string,
    cursorAfter: number,
  ) => boolean;
}

export interface VoiceInputOptions {
  readonly environmentId: EnvironmentId;
  readonly draft: VoiceDraftAdapter;
  readonly onRecordingStart?: () => void;
  readonly onError: (message: string) => void;
}

function describeMicrophoneError(cause: unknown): string | null {
  return cause instanceof DOMException && cause.name === "NotFoundError"
    ? "No microphone found."
    : null;
}

function createController(
  latest: RefObject<VoiceInputOptions>,
  onStateChange: (state: VoiceInputState) => void,
): VoiceInputController {
  let controller: VoiceInputController;
  const recorder = new BrowserVoiceRecorder((status) => {
    void controller.handleRecorderStatus(status);
  });
  const decodeRecording = async (uri: string) =>
    recordingToSpeechPcm(await (await fetch(uri)).blob());
  controller = new VoiceInputController({
    recorder,
    // The environment is fixed when recording starts, so the transcript lands where it began.
    getTranscriber: () => {
      const environmentId = latest.current.environmentId;
      return createEnvironmentVoiceTranscriber({
        decodeRecording,
        transcribe: (pcm) => transcribeSpeech(environmentId, pcm),
      });
    },
    requestPermission: () =>
      recorder.acquireMicrophone().catch((cause: unknown) => {
        const message = describeMicrophoneError(cause);
        if (message) latest.current.onError(message);
        throw cause;
      }),
    configureRecording: async () => {},
    releaseRecording: async () => recorder.release(),
    deleteRecording: (uri) => URL.revokeObjectURL(uri),
    readDraft: (): VoiceDraftSnapshot => {
      const draft = latest.current.draft;
      const { text, cursor } = draft.read();
      return {
        ownerKey: draft.ownerKey,
        text,
        selection: { start: cursor, end: cursor },
        revision: 0,
      };
    },
    commitDraft: (text, selection) => {
      const draft = latest.current.draft;
      const { start, end, insertion } = transcriptReplacement(draft.read().text, text);
      if (!draft.replaceRange(start, end, insertion, selection.start)) {
        latest.current.onError("The composer is busy, so the transcript was not inserted.");
      }
    },
    onStateChange: (state) => {
      onStateChange(state);
      if (state.phase !== "error") return;
      if (state.error) latest.current.onError(state.error);
      // The controller releases the microphone after reporting; clear the error once it has.
      queueMicrotask(() => controller.cancel());
    },
  });
  return controller;
}

export function useVoiceInput(options: VoiceInputOptions) {
  const [phase, setPhase] = useState<VoiceInputPhase>("idle");
  const latest = useRef(options);
  // oxlint-disable-next-line react/refs -- Transcription finishes later and must commit through the composer's current adapter, not the one captured at start.
  latest.current = options;
  // Built on first use, in a handler, so the microphone is never touched by a render.
  const controllerRef = useRef<VoiceInputController | null>(null);
  /** The controller's phase right now, for handlers that must not read a stale render. */
  const readPhase = useStableCallback(() => controllerRef.current?.currentState.phase ?? "idle");

  const stop = useStableCallback(() => {
    void controllerRef.current?.stop();
  });

  const cancel = useStableCallback(() => {
    controllerRef.current?.cancel();
  });

  const start = useStableCallback(() => {
    controllerRef.current ??= createController(latest, (state) => setPhase(state.phase));
    if (controllerRef.current.currentState.phase !== "idle") return;
    latest.current.onRecordingStart?.();
    void controllerRef.current.start();
  });

  const toggle = useStableCallback(() => {
    const current = readPhase();
    if (current === "idle") start();
    else if (current === "recording") stop();
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Esc must discard a recording from anywhere on the page, and only while one is active.
  useEffect(() => {
    if (phase !== "recording") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [phase, cancel]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Leaving the thread mid-sentence must release the microphone and stop any transcription from committing.
  useEffect(() => () => controllerRef.current?.dispose(), []);

  return { phase, readPhase, start, stop, cancel, toggle };
}
