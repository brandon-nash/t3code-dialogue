# 0003. Voice audio travels over raw HTTP routes, not RPC

- Status: accepted
- Date: 2026-10-27

## Context

T3 clients talk to the server over a typed WebSocket RPC defined in `packages/contracts`. Voice
moves audio: up to five minutes of 16 kHz PCM in, and WAV out. The RPC layer is JSON over the
same socket the UI depends on for responsiveness.

## Decision

Voice uses three raw HTTP routes under `/api/voice` (`status`, `transcribe`, `speak`). They reuse
the existing raw-route authentication helper and require the `orchestration operate` scope, the
same as other raw routes. Status is JSON; audio bodies are binary.

## Consequences

- Audio never competes with UI traffic on the WebSocket, which protects the "performance without
  compromise" rule.
- The routes are not in the contracts package, so clients discover voice by probing `status`
  rather than through typed capability flags. Older or remote servers without the routes return
  404 and the client hides the controls.
- Each request is one utterance. Streaming (phrase-by-phrase transcription while recording,
  sentence-by-sentence synthesis) will need either chunked HTTP or a dedicated binary WebSocket.
  That decision is deferred to Phase 2 and should produce a new record.
- Permission checks follow the raw-route path, not `CLIENT_GUARDED_RPC_SCOPES`, so the composer
  cannot use a command `permissionAtom` for availability and uses the probe instead.

## Alternatives considered

- **RPC with base64 audio.** Simple to type, but inflates payloads by a third and puts megabytes
  on the UI socket.
- **Binary WebSocket from day one.** Right for streaming, premature for a push-to-talk spike.
