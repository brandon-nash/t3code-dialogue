# 0008. Spoken turns ask for a `<speak>` summary; the written reply hides it

- Status: accepted (refines [0005](./0005-speakable-text-and-speak-tag.md))
- Date: 2026-10-27

## Context

[0005](./0005-speakable-text-and-speak-tag.md) made `<speak>…</speak>` the spoken reply when an
agent writes one, but nothing told agents to write it, and the block showed up in the rendered
message. Spoken replies are a per-browser setting, so the server cannot know from its own state
whether anyone is listening to a given turn.

Where the instruction could live differs by provider. Claude Code takes an appended system
prompt at query launch; Codex takes per-turn `additionalContext`; the ACP-based providers
(Cursor, OpenCode, Grok, Antigravity) have neither and forward only the user text.

## Decision

- The client marks each message it sends while the speaker is on with `spokenReply: true`. The
  flag is stored on the message so a queued or steered message keeps it.
- When the server hands that message to a provider, on the run-start and steer paths alike, it
  appends `SPOKEN_REPLY_INSTRUCTIONS` to the provider's copy of the text. The stored message, and
  what the user sees, is unchanged. One place, every provider, no per-adapter decision. Slash
  commands such as `/compact` and `/goal` are sent bare, since providers parse them verbatim.
- The instruction asks for one or two plain sentences at the end of the reply, with no markdown,
  code, paths, or URLs. It is sent only on turns the user will hear, so silent turns cost nothing.
- Web and desktop hide the block when rendering an assistant message, including an unterminated
  block while the reply streams. Copying a message still copies the raw text. Mobile has no
  voice and shows the reply as written; a trailing summary sentence there is acceptable.
- An eval case under `evals/mcp-tool-use/cases/voice.jsonl` fails without the instruction and
  guards that silent turns get no block.

## Consequences

- Agents started by other agents, scheduled tasks, or `t3_thread_send` never carry the flag, so
  their replies fall back to the reduced prose of 0005 when spoken.
- The instruction rides in user text, which models weight heavily, at the cost of about sixty
  tokens per spoken turn. A provider that quotes user text back verbatim would expose it; none
  of the current adapters do.
- Hiding happens at render time, so search and copy still see the block. If that bothers, the
  projection could strip it instead; that is a later decision.

## Alternatives considered

- **System prompt addition per provider.** Covers only Claude and Codex and needs an adapter
  change each; Claude's append is fixed at launch.
- **MCP tool description.** Static and shared by every client of the environment; it cannot
  follow a per-browser toggle.
- **Always instruct when the server has voice models.** Every reply on every client would carry
  a summary nobody asked for.
