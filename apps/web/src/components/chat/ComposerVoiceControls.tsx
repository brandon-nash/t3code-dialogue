/**
 * Mic (tap to toggle, hold to talk, Esc discards) and a speaker toggle for spoken replies.
 * Both use the server's local models; the controls hide on servers without voice routes.
 */
import type { ResolvedKeybindingsConfig, ScopedThreadRef } from "@t3tools/contracts";
import type { ThreadRunSummary } from "@t3tools/client-runtime/state/models";
import * as Schema from "effect/Schema";
import { MicIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useStableCallback } from "../../hooks/useStableCallback";
import { shortcutLabelForCommand } from "../../keybindings";
import { registerCommands } from "../../shortcuts/dispatcher";
import { useSpokenReplies } from "../../voice/useSpokenReplies";
import { useVoiceInput } from "../../voice/useVoiceInput";
import { fetchVoiceStatus, type VoiceStatus } from "../../voice/voiceApi";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BackgroundThreadContext } from "./backgroundThread";

// A press shorter than this is a tap (toggle); longer is hold-to-talk.
const HOLD_THRESHOLD_MS = 350;

type VoiceAvailability =
  | { readonly kind: "checking" }
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly status: VoiceStatus };

function componentHint(component: VoiceStatus["stt"]): string | null {
  return component.state === "missing_models" || component.state === "unavailable"
    ? component.detail
    : null;
}

export function ComposerVoiceControls(props: {
  readonly threadRef: ScopedThreadRef;
  readonly latestRun: ThreadRunSummary | null;
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly onTranscript: (text: string) => boolean;
}) {
  const backgroundThread = use(BackgroundThreadContext);
  const [availability, setAvailability] = useState<VoiceAvailability>({ kind: "checking" });
  const [repliesEnabled, setRepliesEnabled] = useLocalStorage(
    "t3code.voiceRepliesEnabled",
    false,
    Schema.Boolean,
  );
  const pressRef = useRef<{ readonly startedRecording: boolean; readonly at: number } | null>(null);

  const showError = (message: string) => {
    toastManager.add({ type: "error", title: "Voice", description: message });
  };

  // oxlint-disable-next-line t3code/react-effect-budget -- Probe the connected server once; older or remote servers have no voice routes.
  useEffect(() => {
    const controller = new AbortController();
    fetchVoiceStatus(controller.signal).then(
      (status) => setAvailability({ kind: "present", status }),
      () => {
        if (!controller.signal.aborted) setAvailability({ kind: "absent" });
      },
    );
    return () => controller.abort();
  }, []);

  const spokenReplies = useSpokenReplies({
    threadRef: props.threadRef,
    latestRun: props.latestRun,
    enabled: repliesEnabled && !backgroundThread && availability.kind === "present",
    onError: showError,
  });

  const voiceInput = useVoiceInput({
    onTranscript: (text) => {
      if (!props.onTranscript(text)) {
        showError("The composer is busy, so the transcript was not inserted.");
      }
    },
    // Talking over the agent should silence it.
    onRecordingStart: spokenReplies.stop,
    onError: showError,
  });

  const pressStart = useStableCallback(() => {
    const phase = voiceInput.phaseRef.current;
    if (phase === "idle") {
      pressRef.current = { startedRecording: true, at: performance.now() };
      void voiceInput.start();
    } else if (phase === "recording" || phase === "starting") {
      pressRef.current = { startedRecording: false, at: performance.now() };
      voiceInput.stop();
    }
  });

  const pressEnd = useStableCallback(() => {
    const press = pressRef.current;
    pressRef.current = null;
    if (press?.startedRecording && performance.now() - press.at >= HOLD_THRESHOLD_MS) {
      voiceInput.stop();
    }
  });

  const handleShortcut = useStableCallback((event: KeyboardEvent) => {
    if (event.repeat) return true;
    pressStart();
    // The dispatcher only routes keydown; releasing any key of the chord ends a hold.
    window.addEventListener("keyup", pressEnd, { once: true });
    return true;
  });

  const sttReady =
    availability.kind === "present" && componentHint(availability.status.stt) === null;

  // oxlint-disable-next-line t3code/react-effect-budget -- The shortcut scope lives exactly as long as a foreground composer with working dictation.
  useEffect(() => {
    if (backgroundThread || !sttReady) return;
    return registerCommands({ "composer.voiceInput": handleShortcut }, { capture: true });
  }, [backgroundThread, sttReady, handleShortcut]);

  if (availability.kind !== "present") return null;

  const sttHint = componentHint(availability.status.stt);
  const ttsHint = componentHint(availability.status.tts);
  const shortcut = shortcutLabelForCommand(props.keybindings, "composer.voiceInput");
  const micLabel =
    sttHint ??
    (voiceInput.phase === "recording"
      ? "Stop dictation (Esc to discard)"
      : voiceInput.phase === "transcribing"
        ? "Transcribing"
        : `Dictate: tap or hold${shortcut ? ` (${shortcut})` : ""}`);
  const speakerLabel =
    ttsHint ?? (repliesEnabled ? "Stop reading replies aloud" : "Read replies aloud");

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={speakerLabel}
              aria-pressed={repliesEnabled}
              disabled={ttsHint !== null}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (repliesEnabled) spokenReplies.stop();
                setRepliesEnabled(!repliesEnabled);
              }}
            />
          }
        >
          {repliesEnabled ? <Volume2Icon /> : <VolumeXIcon />}
        </TooltipTrigger>
        <TooltipPopup>{speakerLabel}</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant={voiceInput.phase === "recording" ? "ghost-destructive" : "ghost"}
              size="icon-sm"
              aria-label={micLabel}
              aria-pressed={voiceInput.phase === "recording"}
              disabled={sttHint !== null || voiceInput.phase === "transcribing"}
              onPointerDown={(event) => {
                // Keep focus in the composer so the transcript lands at the caret.
                event.preventDefault();
                pressStart();
              }}
              onPointerUp={pressEnd}
              onPointerCancel={pressEnd}
              onClick={(event) => {
                // Pointer presses are handled above; detail 0 means Enter or Space.
                if (event.detail === 0) voiceInput.toggle();
              }}
            />
          }
        >
          {voiceInput.phase === "transcribing" || voiceInput.phase === "starting" ? (
            <Spinner />
          ) : (
            <MicIcon />
          )}
        </TooltipTrigger>
        <TooltipPopup>{micLabel}</TooltipPopup>
      </Tooltip>
    </>
  );
}
