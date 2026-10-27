/** Reads the agent's reply aloud when a run completes, via the server's Kokoro model. */
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { ThreadRunSummary } from "@t3tools/client-runtime/state/models";
import { useEffect, useRef } from "react";

import { useStableCallback } from "../hooks/useStableCallback";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentThreadDetails } from "../state/threads";
import { createSpokenRunTracker, pickSpokenReply } from "./spokenReplies.logic";
import { synthesizeReply } from "./voiceApi";

// The run summary can settle a beat before the last streamed delta lands in the detail.
const FINAL_TEXT_WAIT_MS = 4000;

interface Playback {
  readonly abort: AbortController;
  audio: HTMLAudioElement | null;
  url: string | null;
}

function readFinalReply(
  threadRef: ScopedThreadRef,
  run: ThreadRunSummary,
  signal: AbortSignal,
): Promise<string | null> {
  const atom = environmentThreadDetails.threadAtom(threadRef);
  const read = () => {
    const thread = appAtomRegistry.get(atom);
    if (!thread) return undefined;
    return pickSpokenReply(thread.projection.messages, run.runId, run.assistantMessageId);
  };

  const current = read();
  if (current && !current.streaming) return Promise.resolve(current.text);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (text: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(text);
    };
    const unsubscribe = appAtomRegistry.subscribe(atom, () => {
      const reply = read();
      if (reply && !reply.streaming) settle(reply.text);
    });
    const timer = setTimeout(() => settle(read()?.text ?? null), FINAL_TEXT_WAIT_MS);
    signal.addEventListener("abort", () => settle(null), { once: true });
  });
}

export function useSpokenReplies(options: {
  readonly threadRef: ScopedThreadRef;
  readonly latestRun: ThreadRunSummary | null;
  readonly enabled: boolean;
  readonly onError: (message: string) => void;
}) {
  const { threadRef, latestRun, enabled } = options;
  const playbackRef = useRef<Playback | null>(null);
  const threadKey = `${threadRef.environmentId}:${threadRef.threadId}`;
  const trackerRef = useRef<{
    readonly key: string;
    readonly tracker: ReturnType<typeof createSpokenRunTracker>;
  } | null>(null);

  const stop = useStableCallback(() => {
    const playback = playbackRef.current;
    if (!playback) return;
    playbackRef.current = null;
    playback.abort.abort();
    playback.audio?.pause();
    if (playback.url) URL.revokeObjectURL(playback.url);
  });

  const speak = useStableCallback(async (run: ThreadRunSummary) => {
    stop();
    const playback: Playback = { abort: new AbortController(), audio: null, url: null };
    playbackRef.current = playback;
    try {
      const text = await readFinalReply(threadRef, run, playback.abort.signal);
      if (!text || playback.abort.signal.aborted) return;
      const wav = await synthesizeReply(threadRef.environmentId, text);
      if (!wav || playback.abort.signal.aborted) return;
      playback.url = URL.createObjectURL(wav);
      playback.audio = new Audio(playback.url);
      playback.audio.addEventListener("ended", () => {
        if (playbackRef.current === playback) stop();
      });
      await playback.audio.play();
    } catch (cause) {
      if (playback.abort.signal.aborted) return;
      stop();
      options.onError(cause instanceof Error ? cause.message : "Could not read the reply aloud.");
    }
  });

  // oxlint-disable-next-line t3code/react-effect-budget -- Run completion arrives from the server push, not from a handler in this component.
  useEffect(() => {
    // A new thread gets a fresh tracker (so its existing reply is never read) and silences
    // whatever the previous thread was still saying; so does muting.
    if (trackerRef.current?.key !== threadKey) {
      stop();
      trackerRef.current = { key: threadKey, tracker: createSpokenRunTracker() };
    }
    if (!enabled) stop();
    if (trackerRef.current.tracker.observe(latestRun, enabled) && latestRun) {
      void speak(latestRun);
    }
  }, [threadKey, latestRun, enabled, speak, stop]);

  // oxlint-disable-next-line t3code/react-effect-budget -- Unmounting must not leave a reply playing.
  useEffect(() => stop, [stop]);

  return { stop };
}
