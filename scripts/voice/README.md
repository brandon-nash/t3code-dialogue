# Voice spike (Phase 1)

Push-to-talk dictation and spoken replies in the T3 Code composer, running entirely on the
machine that hosts the T3 server. Speech-to-text is Parakeet TDT 0.6B, text-to-speech is
Kokoro, both through `sherpa-onnx-node`. Nothing leaves the machine.

## Setup

```sh
pnpm install                                # picks up sherpa-onnx-node
./scripts/voice/install-voice-models.sh     # ~1 GB into ~/.t3/voice
vp run dev
```

`T3CODE_VOICE_DIR` overrides the voice directory. Layout:

```
~/.t3/voice/
  voice.json            phrase book + TTS settings (re-read on every save)
  models/parakeet/      encoder*.onnx decoder*.onnx joiner*.onnx tokens.txt
  models/kokoro/        model*.onnx voices.bin tokens.txt lexicon*.txt espeak-ng-data/
```

The installer takes `PARAKEET_ARCHIVE` / `KOKORO_ARCHIVE` overrides (for example
`sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` for the multilingual model), pulled from
sherpa-onnx's GitHub releases (`asr-models`, `tts-models`).

## Using it

- **Mic button** (left of the attach button) or **Cmd+'**: tap to start, tap again
  to stop, or hold and release. **Esc** discards the recording. The transcript lands at the
  caret. Rebind via `composer.voiceInput` in keybindings.json.
- **Speaker button**: reads each completed reply aloud. Code blocks, tables, and URLs are
  skipped. If a reply contains `<speak>…</speak>`, only that is read. Starting to dictate
  silences playback.

## Phrase book (`voice.json`)

```json
{
  "tts": { "speakerId": 0, "speed": 1.1 },
  "replacements": { "that's metal": "🤘", "new paragraph": "\n\n" },
  "vocabulary": ["Alkami", "jXchange", "Pulumi"]
}
```

`replacements` match whole words, ignore case and apostrophe style, and swallow the period
Parakeet adds ("That's metal." becomes "🤘"). `vocabulary` fixes casing. `speakerId` picks a
Kokoro voice (the multi-lang v1.0 model ships 53).

## Server API

All routes need an authenticated session with the orchestration operate scope.

| Route                        | Body                       | Response                                                                           |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/voice/status`      |                            | `{ voiceDir, stt, tts }`, each `ready`, `idle`, `missing_models`, or `unavailable` |
| `POST /api/voice/transcribe` | mono PCM16LE @ 16 kHz      | `{ text, rawText, audioMs, decodeMs }`                                             |
| `POST /api/voice/speak`      | `{ "text": "<markdown>" }` | `audio/wav`, or 204 if nothing speakable                                           |

Setup problems return 503 with a `detail`; the composer shows it in the button tooltip.
