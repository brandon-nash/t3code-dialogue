# Voice mode handoff

Context for picking up voice work in `brandon-nash/t3code-dialogue`. Read this first, then
`scripts/voice/README.md` (setup and API) and the repo's `AGENTS.md` (conventions).

## Where things stand

- Branch `voice-spike`, two commits on top of `main` (`71ba6b37`):
  - `feat(voice): local push-to-talk dictation and spoken replies (spike)`
  - `fix(voice): move dictation shortcut to Cmd+' (macOS 27 owns Cmd+Shift+Space)`
- Running on Brandon's Mac via `pnpm dev`. Dictation works well in real use; the Cmd+' shortcut works.
- Not yet measured: real latency. Capture `decodeMs` from `/api/voice/transcribe` responses
  and the `x-t3-voice-synth-ms` header from `/api/voice/speak` before planning Phase 2 timing work.
- The branch may not be pushed yet: `git push -u origin voice-spike`.

## What we set out to do

Brandon works in Claude Code all day (terminal, VS Code, T3 Code) and wanted an "interactive"
voice mode:

- **Toggleable**, never the default. Keyboard input stays primary; voice is opt-in per moment.
- **Both directions**: speak prompts (speech-to-text) and hear replies read aloud (text-to-speech).
- **Local and open source.** Wispr Flow was the starting point: accuracy was mediocre and it keeps
  a web-based transcript, which he didn't want.
- **A phrase book**: spoken shortcuts that expand to text, e.g. "that's metal" -> 🤘, plus correct
  spelling of jargon (Alkami, jXchange, Pulumi, ...).
- Starting in **one surface is fine**. T3 Code was chosen because it is open source and forkable.

## Options considered

| Option                                                                    | Verdict                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| VoiceInk (native macOS, whisper.cpp/Parakeet, personal dictionary, GPLv3) | Best system-wide dictation; still the answer for terminal and VS Code. Input only.       |
| Claude Code built-in `/voice`                                             | Push-to-talk input only, transcribed in Anthropic's cloud. Ruled out (not local).        |
| VoiceMode MCP (local Whisper + Kokoro)                                    | Full conversation loop in Claude Code, but explicit `converse` mode and a known ESC bug. |
| Claude Code Stop hook + macOS `say`/Kokoro behind a flag file             | Light talk-back for the terminal. Still a good small project.                            |
| **Build into a T3 Code fork**                                             | **Chosen.** Owns the UI, works for every provider T3 drives.                             |

## Decisions

- **Speech-to-text: Parakeet TDT 0.6B v2 int8** (Brandon's pick). Fast and accurate English on Apple Silicon.
- **Text-to-speech: Kokoro-82M** (multi-lang v1.0, 53 voices). Small, real-time on CPU, Apache 2.0.
- **Runtime: `sherpa-onnx-node`**, one native package for both models, no Python sidecar.
  Pinned to **1.13.8** because the repo enforces a minimum package release age (2.0.x was days old).
- **Models run on the server**, not in the browser: they load once, every client (web, desktop,
  eventually mobile) shares them, and the phrase book lives in one place.
- **Raw HTTP routes**, not RPC, because payloads are audio. Same auth as other raw routes
  (`orchestration operate` scope).
- **Push-to-talk only** for now. Hands-free (voice activity detection, echo cancellation) is later.
- **What gets spoken**: markdown reduced to prose (no code, tables, URLs), capped ~1200 chars.
  A `<speak>…</speak>` block in a reply wins, so an agent can write its own spoken summary.

## What the spike contains

```
apps/server/src/voice/
  voiceEngine.ts        Effect service: lazy model loads, status, transcribe, speak; one decode at a time
  http.ts               GET /api/voice/status, POST /api/voice/transcribe, POST /api/voice/speak
  phraseBook.ts         replacements + vocabulary casing, applied to every transcript
  speechText.ts         reply markdown -> speakable text (<speak> wins)
  wav.ts                PCM16 <-> Float32, WAV encoding
  sherpa-onnx-node.d.ts types for the slice of sherpa we use (it ships JSDoc only)
  *.test.ts             26 tests incl. a regression for the CommonJS import bug below
apps/web/src/voice/
  voiceApi.ts           fetch client for /api/voice (primary environment, same auth as other HTTP)
  pcm.ts                MediaRecorder blob -> 16 kHz mono PCM16 via OfflineAudioContext
  useVoiceInput.ts      record/stop/cancel (Esc), 5-minute cap, mic released on unmount
  useSpokenReplies.ts   reads a run's reply once when it completes; silences on thread switch/mute
  spokenReplies.logic.ts  pure rules: which runs to speak, which message is "the reply"
apps/web/src/components/chat/ComposerVoiceControls.tsx   mic + speaker buttons, tooltips, shortcut
scripts/voice/          install-voice-models.sh, voice.example.json, README.md, this file
```

Small edits elsewhere: `apps/server/src/http.ts` (exported `authenticateRawRouteWithScope`),
`apps/server/src/server.ts` (registers `VoiceHttp.layer`), `ChatComposer.tsx` (renders the
controls, inserts transcripts at the caret), `composer.voiceInput` command in
`packages/contracts/src/keybindings.ts` with default `mod+'` in `packages/shared/src/keybindings.ts`.

Behavior:

- Mic: tap to toggle, hold to talk, Esc discards. Starting to talk silences playback.
- Speaker toggle (persisted per browser in localStorage): speaks each newly completed run once;
  never the reply already on screen when a thread opens; runs that finish while muted are skipped.
- Controls hide on servers without voice routes; a missing model disables the button with the
  server's reason in the tooltip.
- `~/.t3/voice/voice.json` is re-read whenever it changes (phrase book, `tts.speakerId`, `tts.speed`).

## Setup on the Mac (and what bit us)

```sh
git clone https://github.com/brandon-nash/t3code-dialogue.git ~/repos/t3code-dialogue
cd ~/repos/t3code-dialogue && git checkout voice-spike
nvm install 26.12.1 && nvm use 26.12.1
npm install -g pnpm@12.14.0         # not corepack, see below
pnpm install
./scripts/voice/install-voice-models.sh   # ~830 MB into ~/.t3/voice
pnpm dev                                  # open the printed `pairingUrl:` once
```

Issues hit, in order:

1. **`.claude/skills` came through as an empty file.** The repo tracks it as a symlink to
   `.agents/skills`; the tool that copied the clone couldn't write that path.
   Fix: `rm .claude/skills && git checkout -- .claude/skills`.
2. **Corepack can't run pnpm 12.** It looks for `bin/pnpm.cjs`; pnpm 12 ships `bin/pnpm.mjs`.
   Fix: `corepack disable pnpm`, clear `~/.cache/node/corepack/v1/pnpm/12.14.0`,
   `npm install -g pnpm@12.14.0`.
3. **"Claude isn't found on PATH" in T3.** nvm's default alias is `node` (= latest installed),
   so installing Node 26 silently moved every new shell off v23.3.0, where Claude Code was an npm
   global. Fix: Claude Code's native installer (`~/.local/bin/claude`, independent of nvm).
   T3 resolves `claude` from the PATH of the shell that ran `pnpm dev`, or from Settings ->
   Claude -> Binary path.
4. **Dev mode has its own settings.** In a plain clone, dev state lives in `~/.t3/dev`, separate
   from the real `~/.t3/userdata`. Provider paths and keybindings set in the installed T3 app
   don't carry over (and dev can't damage real data).
5. **Cmd+Shift+Space never reached T3.** macOS 27 binds it to Visual Intelligence (the Claude
   desktop app's Quick Access was moved off it for the same reason). Default is now Cmd+'.
   User overrides live in `~/.t3/dev/keybindings.json` and beat the default.
6. **Fixed before handoff:** `sherpa-onnx-node` is CommonJS, so under ESM `import()` its classes
   arrive on `default`; without that every model load failed. Covered by a regression test.

Also: `node-pty` compiles natively during `pnpm install` (needs Xcode Command Line Tools), and the
browser needs microphone permission (System Settings -> Privacy & Security -> Microphone).

## Repo conventions that matter here

From `AGENTS.md` and what lint enforced on the spike:

- Run `vp run check:changed` before pushing. In a small machine its parallel typecheck can be
  OOM-killed (exit 137); run `vp run --filter t3 typecheck` / `--filter @t3tools/web typecheck` instead.
- Server code is Effect: typed `Data.TaggedError`s, `Effect.catchTags`, `FileSystem`/`Path`
  instead of `node:fs`/`node:path`, `Schema` instead of `JSON.parse`, `Context.Service` + `Layer`.
- Web lint: `t3code/react-effect-budget` (every `useEffect` needs a one-line justification),
  `react(refs)` (no ref reads during render), `shadcn(no-restyle)` (use Button variants),
  `no-low-value-comments` (file headers 4 lines max), no em dashes in UI copy.
- `knip` fails on unused exports.
- Tests: no sleeps, polling, or wall-clock deltas; bug fixes get a failing test first.
- Never point a dev server at `~/.t3/userdata`; never kill processes by name pattern.

## Known limits of the spike

- **Primary environment only.** `voiceApi.ts` always talks to the primary server, even for a
  thread in a remote environment.
- **Desktop packaging untested.** Works under `pnpm dev`/desktop dev, but the packaged app would
  need `sherpa-onnx-node` and its `sherpa-onnx-darwin-arm64` binary unpacked from asar
  (see how `scripts/build-desktop-artifact.ts` handles `node-pty`).
- **Whole-reply synthesis.** A reply is synthesized in full, then played. Long replies wait.
- **Mobile not wired.** `packages/client-runtime/src/voice-input/` is an existing shared
  controller the mobile app uses with on-device transcription; the web spike doesn't use it yet.
- **No settings UI.** Phrase book and voice are edited in `voice.json` by hand.
- If upgrading `sherpa-onnx-node` to 2.x, recheck Kokoro config: 2.x marks `dataDir` deprecated.

## Future phases (as discussed)

**Phase 2: make talk-back pleasant**

- Sentence-level streaming: synthesize and queue audio per sentence as text streams in
  (sherpa's `generateAsync` has an `onProgress` chunk callback), so speech starts in ~1 s.
- The `<speak>` convention: when replies are on, tell the agent to end with a 1-2 sentence
  `<speak>` summary (speech logic already honors it; this is the instruction side). Decide
  whether the block should be hidden in the rendered message.
- Interrupt: any keypress or mic press stops playback immediately (mic already does).
- Fold web dictation into the shared `client-runtime` voice-input controller so web, desktop,
  and mobile share one state machine, and mobile can use the server's Parakeet.
- Use the measured timings to decide whether Parakeet v3 (multilingual) or a different Kokoro
  voice/speed is worth it.

**Phase 3: voice as a mode**

- Voice commands ("send it", "stop", "new thread") as a separate layer from dictation, with
  confirmation for anything that approves tool calls or is destructive. Upstream discussion
  pingdotgg/t3code#17317 proposes an interpreter for this; read it before designing.
- Hands-free mode: VAD (sherpa ships Silero VAD) plus echo handling so it doesn't hear itself.
- Global hotkey in the desktop app (Electron `globalShortcut`) that works when T3 isn't focused.
- Settings UI: phrase book editor, voice picker with preview, speed.
- Remote environments and mobile.
- Optionally upstream: T3 wants features to cover web, desktop, mobile, and remote, so mobile and
  remote support are the bar for a PR.

Outside T3: VoiceInk still covers terminal/VS Code dictation; a Claude Code Stop hook with a
flag file is the cheapest talk-back there.

## Suggested opening prompt for the next session

> Read scripts/voice/HANDOFF.md and AGENTS.md. We're on branch voice-spike. Start Phase 2 with
> sentence-level streaming playback for spoken replies. First propose the design (server
> streaming format, client playback queue, interruption), then implement with tests.
