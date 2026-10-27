# 0007. Voice routes live in the typed environment HTTP API

- Status: accepted (refines [0003](./0003-voice-routes-are-raw-http.md))
- Date: 2026-10-27

## Context

[0003](./0003-voice-routes-are-raw-http.md) kept voice off the WebSocket RPC because the payloads
are audio. The spike implemented that as hand-rolled raw routes, which left the client with a
hand-rolled fetch that only knew the primary environment's origin and credentials. A thread in a
remote environment therefore spoke to the wrong server. The repo already has one typed path for
per-environment HTTP: `EnvironmentHttpApi` in contracts, served by `HttpApiBuilder` on the server
and called through `executeAuthenticatedEnvironmentHttpRequest` on the client, which handles
cookie, bearer, and DPoP sessions including token renewal over T3 Connect.

## Decision

Voice is a group in `EnvironmentHttpApi` with three endpoints: `status`, `transcribe` (binary
PCM payload), and `speak` (WAV body with the synthesis time in a response header; an empty body
means nothing was speakable). Errors are typed: `VoiceUnavailableError` for setup problems and
`VoiceFailedError` for engine failures, beside the shared auth and scope errors. The client
helper in `packages/client-runtime/src/state/voiceHttp.ts` takes a `PreparedConnection`, so web
and mobile call whichever environment owns the thread.

The transport is still HTTP, not RPC. What changes from 0003 is that the routes are typed in
contracts and discovered through the shared client instead of a bespoke probe.

## Consequences

- The web composer probes the thread's environment and re-probes when the thread moves to
  another environment. Read-only sessions and servers without the routes show no controls.
- Mobile gets the same client for free once it supplies a recorder (issue #17).
- Request body size is no longer capped at the route; the handler rejects oversize payloads with
  `payload_too_large` after reading them. Acceptable for a maintainer-only feature.
- Streaming in either direction (issues #5 and #6) can use `HttpApiSchema.StreamUint8Array` on
  the same endpoints or a dedicated socket; that choice still needs its own record.
