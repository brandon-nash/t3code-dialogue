/**
 * Appended to the provider's copy of a user message when the sender has spoken replies on.
 * It travels in the turn text rather than the system prompt because every adapter forwards
 * that text, while only Claude and Codex have a per-turn instruction channel.
 */
export const SPOKEN_REPLY_INSTRUCTIONS = `<spoken_reply>
The user is listening to your reply read aloud. End your reply with a <speak>…</speak> block holding one or two plain sentences: what you did or found, and what the user should do next. No markdown, code, file paths, or URLs inside it. The block is spoken, not shown; keep the written reply as it would otherwise be.
</spoken_reply>`;

/** Slash commands such as /compact and /goal are parsed verbatim by providers, so they stay bare. */
export function spokenReplyTurnText(
  message: { readonly spokenReply?: boolean | undefined },
  text: string,
): string {
  if (message.spokenReply !== true || text.trimStart().startsWith("/")) return text;
  return `${text}\n\n${SPOKEN_REPLY_INSTRUCTIONS}`;
}
