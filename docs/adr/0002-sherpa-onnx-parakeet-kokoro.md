# 0002. sherpa-onnx-node with Parakeet for STT and Kokoro for TTS

- Status: accepted
- Date: 2026-10-27

## Context

Given [0001](./0001-voice-models-run-on-the-server.md), the server needs one runtime that can run
both a recognizer and a synthesizer locally, without a Python sidecar, on Apple Silicon first and
on Linux and Windows eventually. Everything must be open source and run offline.

## Decision

- Runtime: `sherpa-onnx-node`, pinned to `1.13.8`. One native package covers both models and ships
  prebuilt binaries for macOS, Linux, and Windows. The pin exists because the repo's
  `minimumReleaseAge` rejected the days-old 2.0.x line at the time.
- Speech-to-text: **Parakeet TDT 0.6B v2, int8**. Fast and accurate English on CPU.
- Text-to-speech: **Kokoro-82M** (multi-lang v1.0, 53 voices). Real time on CPU, Apache 2.0.
- Models are not bundled. `scripts/voice/install-voice-models.sh` downloads them into
  `<T3 home>/voice/models` and the server loads them lazily on first use.

## Consequences

- Native addon rules apply: `sherpa-onnx` is listed in `CLI_RUNTIME_EXTERNAL_PREFIXES` so the
  server bundle leaves it external and desktop packaging stages it beside `node-pty`.
- The package is CommonJS. Under ESM dynamic import its classes arrive on `default`; a regression
  test covers this.
- A missing model is a typed error and a status, never a crash. The server starts fine without
  models and reports `missing_models` to clients.
- Upgrading to sherpa 2.x needs a Kokoro config recheck: 2.x deprecates `dataDir`.
- Both upstream dictation PRs (19273, 14882) also chose sherpa-onnx, so model and runtime
  knowledge transfers if this fork ever converges with upstream.

## Alternatives considered

- **whisper.cpp bindings.** Mature, but STT only; TTS would need a second runtime.
- **Apple Speech / native macOS.** Desktop only, see 0001.
- **Cloud transcription** (Claude Code `/voice`, Wispr Flow). Ruled out: transcripts leave the
  machine.
- **Python sidecar** (VoiceMode MCP style). Adds a second runtime and process to manage.
