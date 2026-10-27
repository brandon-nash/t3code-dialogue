# 0005. Replies are reduced to speakable prose; `<speak>` wins

- Status: accepted
- Date: 2026-10-27

## Context

Agent replies are Markdown full of code blocks, tables, file paths, and URLs. Reading them
verbatim is useless, and a long reply synthesized in full delays the first word by many seconds.
The agent is the only party that knows what the one-sentence takeaway is.

## Decision

- The server reduces reply Markdown to prose before synthesis: code blocks, tables, and URLs are
  dropped, formatting is stripped, and the result is capped at about 1200 characters. A reply
  with nothing left to say produces no audio (HTTP 204).
- If a reply contains a `<speak>…</speak>` block, only that block is spoken. An agent can use
  it to author its own spoken summary.
- Each completed run is spoken at most once. A reply already on screen when a thread opens is
  never read; runs that finish while muted are skipped, not queued.

## Consequences

- Spoken output is useful by default and bounded in length.
- The `<speak>` convention has a listening side but no instruction side yet. Telling agents to
  emit it when replies are on, and deciding whether to hide the block in the rendered message,
  is Phase 2 work.
- Reduction heuristics will sometimes drop content a user wanted to hear. The phrase book does
  not apply to output; voice and speed come from `voice.json`.

## Alternatives considered

- **Speak everything.** Rejected for obvious reasons.
- **LLM summarization before synthesis.** Adds a model call and latency to every reply; the
  agent can already do this via `<speak>`.
