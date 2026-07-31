const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

/**
 * Milkdown's ProseMirror → markdown serializer re-emits the list `spread`
 * attribute as the string `"false"`, which mdast/remark treats as truthy and
 * therefore renders every list as "loose" (a blank line between items). This
 * turns "tight" lists from the source file into "loose" ones on round-trip,
 * even when the user made no edits.
 *
 * This helper collapses that spurious separation: a blank line is removed only
 * when the nearest non-blank line before it and the nearest non-blank line
 * after it are BOTH list-item markers. Multi-paragraph items (blank line
 * followed by indented continuation) and the separation between a list and the
 * following block are preserved, and content inside fenced code blocks is never
 * touched. The transform is idempotent: `f(f(x)) === f(x)`.
 */
export function tightenListSerialization(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceLen = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLen && line.trim() === marker) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
      result.push(line);
      continue;
    }

    if (!inFence && line.trim() === '') {
      const prev = result.length > 0 ? result[result.length - 1] : '';
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      const next = j < lines.length ? lines[j] : '';
      if (LIST_ITEM_RE.test(prev) && LIST_ITEM_RE.test(next)) {
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}
