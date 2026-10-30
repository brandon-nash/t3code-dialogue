/**
 * `<speak>…</speak>` is the agent's spoken summary: the voice reads only it, and the written
 * reply hides it. The block is expected at the end of a reply, so an unterminated tail while
 * streaming is treated as the block in progress.
 */

const SPEAK_BLOCK = /<speak>([\s\S]*?)<\/speak>/gi;
const OPEN_SPEAK_TAIL = /<speak>(?![\s\S]*<\/speak>)[\s\S]*$/i;

export function extractSpeakBlocks(text: string): ReadonlyArray<string> {
  return [...text.matchAll(SPEAK_BLOCK)].map((match) => (match[1] ?? "").trim());
}

export function stripSpeakBlocks(text: string): string {
  return text.replace(SPEAK_BLOCK, "").replace(OPEN_SPEAK_TAIL, "").trimEnd();
}
