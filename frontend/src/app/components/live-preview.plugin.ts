import { $prose } from '@milkdown/utils';
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { Mark, Node as PMNode, Schema } from '@milkdown/prose/model';
import type { EditorState, Transaction } from '@milkdown/prose/state';

const key = new PluginKey<LPState>('live-preview');
const META_KEY = 'lp-meta';
const INLINE_MARKS = ['link', 'strong', 'emphasis', 'inlineCode'];

interface LPState {
  expanded: { from: number; to: number; originalRaw: string } | null;
}

// ─── Serializers ─────────────────────────────────────────────────────────────

export function serializeMarkToMarkdown(mark: Mark, text: string): string {
  const a = mark.attrs as Record<string, string>;
  switch (mark.type.name) {
    case 'link':   return a['title'] ? `[${text}](${a['href']} "${a['title']}")` : `[${text}](${a['href']})`;
    case 'strong':     return `**${text}**`;
    case 'emphasis':   return `_${text}_`;
    case 'inlineCode': return `\`${text}\``;
    default:       return text;
  }
}

export function serializeImageToMarkdown(node: PMNode): string {
  const a = node.attrs as Record<string, string>;
  return a['title'] ? `![${a['alt']}](${a['src']} "${a['title']}")` : `![${a['alt']}](${a['src']})`;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

interface ParsedMark  { text: string; mark: Mark }
interface ParsedImage { alt: string; src: string; title: string }

export function parseMarkdownToMark(raw: string, schema: Schema): ParsedMark | ParsedImage | null {
  const imgM = /^!\[([^\]]*)\]\(([^() ]+)(?:\s+"([^"]*)")?\)$/.exec(raw);
  if (imgM) return { alt: imgM[1], src: imgM[2], title: imgM[3] ?? '' };

  const linkM = /^\[([^\]]*)\]\(([^() ]+)(?:\s+"([^"]*)")?\)$/.exec(raw);
  if (linkM) {
    const mark = schema.marks['link']?.create({ href: linkM[2], title: linkM[3] ?? '' });
    if (mark) return { text: linkM[1], mark };
  }
  const strongM = /^\*\*(.+)\*\*$/s.exec(raw);
  if (strongM) {
    const mark = schema.marks['strong']?.create({});
    if (mark) return { text: strongM[1], mark };
  }
  const emM = /^_(.+)_$/s.exec(raw);
  if (emM) {
    const mark = schema.marks['emphasis']?.create({});
    if (mark) return { text: emM[1], mark };
  }
  const codeM = /^`(.+)`$/s.exec(raw);
  if (codeM) {
    const mark = schema.marks['inlineCode']?.create({});
    if (mark) return { text: codeM[1], mark };
  }
  return null;
}

function isImageParsed(p: ParsedMark | ParsedImage): p is ParsedImage {
  return 'src' in p;
}

// ─── Cursor detection ─────────────────────────────────────────────────────────

interface MarkRange  { from: number; to: number; mark: Mark; text: string }
interface ImageRange { from: number; to: number; node: PMNode }

function findMarkAtCursor(state: EditorState): MarkRange | null {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || !sel.$cursor) return null;
  const $c = sel.$cursor;
  const pos = $c.pos;
  const parent = $c.parent;
  const parentStart = pos - $c.parentOffset;

  for (const name of INLINE_MARKS) {
    const mt = state.schema.marks[name];
    if (!mt) continue;

    const hasBefore = $c.nodeBefore?.marks.some(m => m.type === mt) ?? false;
    const hasAfter  = $c.nodeAfter?.marks.some(m => m.type === mt) ?? false;
    if (!hasBefore && !hasAfter) continue;

    // Walk children to find the contiguous mark segment that contains pos
    let segStart = -1, segEnd = -1, foundMark: Mark | null = null, text = '';
    let inSeg = false;
    let offset = 0;

    for (let i = 0; i < parent.childCount; i++) {
      const child = parent.child(i);
      const cFrom = parentStart + offset;
      const cTo   = cFrom + child.nodeSize;
      const mk    = child.marks.find(m => m.type === mt) ?? null;

      if (mk) {
        if (!inSeg) { inSeg = true; segStart = cFrom; foundMark = mk; text = ''; }
        segEnd = cTo;
        if (child.isText) text += child.text ?? '';
      } else if (inSeg) {
        // Segment ended — check if pos was in it (exclusive upper bound to avoid boundary re-expansion)
        if (segStart <= pos && pos < segEnd) {
          return { from: segStart, to: segEnd, mark: foundMark!, text };
        }
        inSeg = false; segStart = -1; segEnd = -1; foundMark = null; text = '';
      }
      offset += child.nodeSize;
    }

    // Check last segment (paragraph ends with mark)
    if (inSeg && segStart <= pos && pos < segEnd) {
      return { from: segStart, to: segEnd, mark: foundMark!, text };
    }
  }
  return null;
}

function findImageAtCursor(state: EditorState): ImageRange | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === 'image') {
    return { from: sel.from, to: sel.to, node: sel.node };
  }
  return null;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export function createLivePreviewPlugin() {
  return $prose(() =>
    new Plugin<LPState>({
      key,

      state: {
        init: (): LPState => ({ expanded: null }),
        apply: (tr, prev): LPState => {
          const meta = tr.getMeta(META_KEY) as
            | { type: 'expand'; from: number; to: number; originalRaw: string }
            | { type: 'collapse' }
            | undefined;

          if (meta?.type === 'expand') {
            return { expanded: { from: meta.from, to: meta.to, originalRaw: meta.originalRaw } };
          }
          if (meta?.type === 'collapse') return { expanded: null };

          if (prev.expanded) {
            return {
              expanded: {
                from: tr.mapping.map(prev.expanded.from, -1),
                to:   tr.mapping.map(prev.expanded.to,    1),
                originalRaw: prev.expanded.originalRaw,
              },
            };
          }
          return prev;
        },
      },

      appendTransaction: (trs, _oldState, newState): Transaction | null => {
        // Prevent loops: all transactions already generated by this plugin → skip
        if (trs.every(tr => tr.getMeta(META_KEY) !== undefined)) return null;

        const lpState = key.getState(newState)!;
        const schema  = newState.schema;
        const sel     = newState.selection;
        const cursorPos =
          sel instanceof TextSelection && sel.$cursor ? sel.$cursor.pos : -1;

        // ── Currently expanded: detect cursor exit and commit ────────────
        if (lpState.expanded) {
          const { from, to, originalRaw } = lpState.expanded;

          if (from >= to) {
            // Degenerate range (all text was deleted) — just collapse
            const tr = newState.tr.setMeta(META_KEY, { type: 'collapse' });
            tr.setMeta('addToHistory', false);
            return tr;
          }

          const stillInside = cursorPos >= from && cursorPos < to;
          if (stillInside) return null;

          // Cursor left the expanded range — read the (possibly edited) raw text
          const rawText = newState.doc.textBetween(from, to, '', '');
          const changed  = rawText !== originalRaw;

          let tr: Transaction = newState.tr;

          if (rawText.length === 0) {
            tr = tr.delete(from, to);
          } else {
            const parsed = parseMarkdownToMark(rawText, schema);
            if (parsed && isImageParsed(parsed)) {
              const imgNode = schema.nodes['image']?.create(parsed);
              if (imgNode) tr = tr.replaceWith(from, to, imgNode);
            } else if (parsed) {
              const { text: mText, mark } = parsed as ParsedMark;
              tr = mText.length
                ? tr.replaceWith(from, to, schema.text(mText, [mark]))
                : tr.delete(from, to);
            }
            // If parse failed, leave as plain text — no doc change
          }

          tr.setMeta(META_KEY, { type: 'collapse' });
          if (!changed) tr.setMeta('addToHistory', false);
          return tr;
        }

        // ── Not expanded: detect cursor entering a mark ──────────────────
        if (cursorPos >= 0) {
          const markRange = findMarkAtCursor(newState);
          if (markRange) {
            const { from, to, mark, text } = markRange;
            const rawText = serializeMarkToMarkdown(mark, text);

            const tr = newState.tr.replaceWith(from, to, schema.text(rawText));
            // Place cursor proportionally within the raw text
            const offset = cursorPos - from;
            const markLen = to - from;
            const ratio   = markLen > 0 ? offset / markLen : 0;
            const rawPos  = from + Math.round(ratio * rawText.length);
            tr.setSelection(TextSelection.create(tr.doc, Math.max(from, Math.min(from + rawText.length, rawPos))));
            tr.setMeta(META_KEY, { type: 'expand', from, to: from + rawText.length, originalRaw: rawText });
            tr.setMeta('addToHistory', false);
            return tr;
          }
        }

        const imgRange = findImageAtCursor(newState);
        if (imgRange) {
          const { from, to, node } = imgRange;
          const rawText = serializeImageToMarkdown(node);

          const tr = newState.tr.replaceWith(from, to, schema.text(rawText));
          tr.setSelection(TextSelection.create(tr.doc, from + 2)); // after "!["
          tr.setMeta(META_KEY, { type: 'expand', from, to: from + rawText.length, originalRaw: rawText });
          tr.setMeta('addToHistory', false);
          return tr;
        }

        return null;
      },
    })
  );
}
