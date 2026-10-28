# Architecture decision records

Decisions made in this fork that upstream T3 Code did not make for us. Each record states the
context, the decision, and what it costs. A record is never edited to say something different;
when a decision changes, a new record supersedes it and the old one's status says so.

Format: [MADR](https://adr.github.io/madr/), kept short. Status is one of `proposed`, `accepted`,
`superseded by NNNN`, or `rejected`.

| ADR                                                         | Title                                                     | Status                    |
| ----------------------------------------------------------- | --------------------------------------------------------- | ------------------------- |
| [0001](./0001-voice-models-run-on-the-server.md)            | Voice models run on the server, not in the client         | accepted                  |
| [0002](./0002-sherpa-onnx-parakeet-kokoro.md)               | sherpa-onnx-node with Parakeet for STT and Kokoro for TTS | accepted                  |
| [0003](./0003-voice-routes-are-raw-http.md)                 | Voice audio travels over raw HTTP routes, not RPC         | accepted, refined by 0007 |
| [0004](./0004-push-to-talk-before-hands-free.md)            | Push-to-talk first; hands-free is a later mode            | accepted                  |
| [0005](./0005-speakable-text-and-speak-tag.md)              | Replies are reduced to speakable prose; `<speak>` wins    | accepted                  |
| [0006](./0006-fork-first-voice-mode.md)                     | Voice mode is fork-first, not an upstream PR              | accepted                  |
| [0007](./0007-voice-routes-in-the-typed-environment-api.md) | Voice routes live in the typed environment HTTP API       | accepted                  |
| [0009](./0009-fork-desktop-identity.md)                     | The fork installs as "T3 Dialogue" with its own T3 home   | accepted                  |
