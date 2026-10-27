/**
 * Turns an assistant reply into text worth hearing: prose stays, code/tables/URLs go. A
 * `<speak>` block, when present, is the whole spoken reply.
 */

const DEFAULT_MAX_SPOKEN_CHARS = 1200;

const SPEAK_BLOCK = /<speak>([\s\S]*?)<\/speak>/gi;

export function toSpeakableText(
  markdown: string,
  maxChars: number = DEFAULT_MAX_SPOKEN_CHARS,
): string {
  const speakBlocks = [...markdown.matchAll(SPEAK_BLOCK)].map((match) => match[1] ?? "");
  const source = speakBlocks.length > 0 ? speakBlocks.join("\n") : markdown;
  return truncateAtSentence(cleanMarkdown(source), maxChars);
}

function cleanMarkdown(markdown: string): string {
  const lines: Array<string> = [];
  let inFence = false;

  for (const rawLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const trimmed = rawLine.trim();
    // Tables, rules, and raw HTML blocks have nothing to say aloud.
    if (/^\|/.test(trimmed) || /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) continue;

    let line = trimmed
      .replace(/^#{1,6}\s+/, "")
      .replace(/^>\s?/, "")
      .replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "");

    line = cleanInline(line);
    if (line.length === 0) {
      lines.push("");
      continue;
    }
    // A heading or list item with no closing punctuation would run into the next line.
    lines.push(/[.!?:;]$/.test(line) ? line : `${line}.`);
  }

  return lines
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanInline(line: string): string {
  return (
    line
      // Images say nothing useful; links keep their label.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<(https?:\/\/[^>]+)>/g, "a link")
      .replace(/https?:\/\/\S+/g, "a link")
      .replace(/<\/?[a-z][^>]*>/gi, "")
      // Short inline code reads fine ("useState"); long inline code is a command or path.
      .replace(/`([^`]+)`/g, (_match, code: string) => (code.length <= 40 ? code : ""))
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(?<![\p{L}\p{N}])([*_])(.+?)\1(?![\p{L}\p{N}])/gu, "$2")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastSentenceEnd > maxChars / 2) return slice.slice(0, lastSentenceEnd + 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : maxChars)}…`;
}
