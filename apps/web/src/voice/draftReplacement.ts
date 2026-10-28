/**
 * The shared controller commits a whole draft; the composer edits by range so chips and undo
 * survive. Recover the range from the common prefix and suffix of the two texts.
 */
export function transcriptReplacement(
  current: string,
  next: string,
): { readonly start: number; readonly end: number; readonly insertion: string } {
  let prefix = 0;
  const maxPrefix = Math.min(current.length, next.length);
  while (prefix < maxPrefix && current[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (
    suffix < maxSuffix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    start: prefix,
    end: current.length - suffix,
    insertion: next.slice(prefix, next.length - suffix),
  };
}
