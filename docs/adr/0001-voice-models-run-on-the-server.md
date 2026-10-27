# 0001. Voice models run on the server, not in the client

- Status: accepted
- Date: 2026-10-27

## Context

Voice mode needs speech-to-text and text-to-speech. The models could run in the browser
(WebGPU or WASM), in the Electron shell, or in the Node server that every T3 client already
talks to. T3 Code has three client surfaces plus remote connections, and the phrase book and
voice settings must mean the same thing on all of them.

## Decision

Both models load inside the T3 server process and are exposed to clients through the server.
Clients capture audio and play audio; they never run a model.

## Consequences

- Models load once per environment and are shared by web, desktop, mobile, and remote clients.
- The phrase book and TTS settings live in one place, beside the models.
- Voice is unavailable on a client whose server lacks the models, and the UI must say so rather
  than fail. The composer probes the server and hides or disables the controls accordingly.
- Audio crosses the network. Local and Tailscale links make this invisible; T3 Connect tunnels
  add latency that a browser-side model would not.
- The server gains a native dependency and roughly 1 GB of model files. See
  [0002](./0002-sherpa-onnx-parakeet-kokoro.md).
- A thread in a remote environment should use that environment's models. The Phase 1 spike
  always talks to the primary environment; fixing that is tracked as Phase 2 work.

## Alternatives considered

- **In-browser models.** No install step and no network hop, but one model copy per client,
  no mobile story, and the phrase book would need its own sync.
- **Electron-only native speech.** Covers desktop only. Upstream issue 24938 asked for this and
  it would leave web and mobile without voice.
