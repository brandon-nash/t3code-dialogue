# 0004. Push-to-talk first; hands-free is a later mode

- Status: accepted
- Date: 2026-10-27

## Context

Voice must be toggleable and never the default: keyboard input stays primary. A hands-free mode
needs voice activity detection, echo handling so the system does not transcribe its own speech,
and a way to tell dictation from commands. None of that is needed to make dictation useful.

## Decision

Phase 1 ships push-to-talk only. The mic button and the `composer.voiceInput` shortcut
(default `mod+'`) tap to toggle or hold to talk; Esc discards. Starting to talk silences any
reply being read aloud. Hands-free, voice activity detection, and voice commands are separate
later phases.

The default shortcut is `mod+'` because macOS 27 reserves Cmd+Shift+Space for Visual
Intelligence and the keystroke never reaches the app.

## Consequences

- The interaction is explicit and predictable, and a stuck key is bounded by a five-minute cap.
- No echo problem yet: the user chooses when the mic is open.
- Voice commands ("send it", "stop") are deliberately not interpreted. Upstream discussion 17317
  describes a working interpreter and should be read before designing that layer.
- Hands-free will need Silero VAD (shipped by sherpa-onnx) plus echo cancellation, and a
  confirmation step for anything destructive.

## Alternatives considered

- **Always-listening mode first.** Highest ceiling, but every unsolved problem lands at once.
- **Separate dictation app** (VoiceInk, Wispr Flow). Still the answer outside T3 Code, but it
  cannot read replies back or follow a remote thread.
