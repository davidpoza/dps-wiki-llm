import { $prose } from '@milkdown/utils';
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { Mark, Node as PMNode, Schema } from '@milkdown/prose/model';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

const key = new PluginKey<LPState>('live-preview');
const META_KEY = 'lp-meta';
const INLINE_MARKS = ['link', 'strong', 'emphasis', 'inlineCode'];
const EXPANDABLE_BLOCKS = ['heading', 'blockquote', 'hr'];

interface LPState {
  expanded: {
    from: number;
    to: number;
    originalRaw: string;
    mode: 'mark' | 'block' | 'table';
  } | null;
}

// ─── Mark serializers ─────────────────────────────────────────────────────────

export function serializeMarkToMarkdown(mark: Mark, text: string): string {
  const a = mark.attrs as Record<string, string>;
  switch (mark.type.name) {
    case 'link':       return a['title'] ? `[${text}](${a['href']} "${a['title']}")` : `[${text}](${a['href']})`;
    case 'strong':     return `**${text}**`;
    case 'emphasis':   return `_${text}_`;
    case 'inlineCode': return `\`${text}\``;
    default:           return text;
  }
}

export function serializeImageToMarkdown(node: PMNode): string {
  const a = node.attrs as Record<string, string>;
  return a['title'] ? `![${a['alt']}](${a['src']} "${a['title']}")` : `![${a['alt']}](${a['src']})`;
}

// ─── Block serializers ────────────────────────────────────────────────────────

function serializeHeadingToMarkdown(node: PMNode): string {
  const level = (node.attrs as Record<string, number>)['level'] ?? 1;
  return '#'.repeat(level) + ' ' + node.textContent;
}

function serializeBlockquoteToMarkdown(node: PMNode): string {
  const firstChild = node.firstChild;
  return '> ' + (firstChild ? firstChild.textContent : '');
}

function serializeHrToMarkdown(): string {
  return '---';
}

// ─── Mark parsers ─────────────────────────────────────────────────────────────

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

// ─── Block parsers ────────────────────────────────────────────────────────────

function parseMarkdownToBlock(raw: string, schema: Schema): PMNode | null {
  const trimmed = raw.trim();

  const headingM = /^(#{1,6})\s+(.*)$/.exec(trimmed);
  if (headingM) {
    const level = headingM[1].length;
    const text = headingM[2];
    const headingType = schema.nodes['heading'];
    if (!headingType) return null;
    return headingType.create({ level }, text ? [schema.text(text)] : []);
  }

  const bqM = /^>\s?(.*)$/.exec(trimmed);
  if (bqM) {
    const text = bqM[1];
    const paragraphType = schema.nodes['paragraph'];
    const blockquoteType = schema.nodes['blockquote'];
    if (!paragraphType || !blockquoteType) return null;
    const paragraph = paragraphType.create({}, text ? [schema.text(text)] : []);
    return blockquoteType.create({}, [paragraph]);
  }

  if (/^(---|___|\*\*\*)$/.test(trimmed)) {
    return schema.nodes['hr']?.create() ?? null;
  }

  return null;
}

function isImageParsed(p: ParsedMark | ParsedImage): p is ParsedImage {
  return 'src' in p;
}

// ─── Table serializer ─────────────────────────────────────────────────────────

export function serializeTableToMarkdown(node: PMNode): string {
  const rows: string[] = [];
  let colCount = 0;

  node.forEach(rowNode => {
    const cells: string[] = [];
    rowNode.forEach(cellNode => {
      cells.push(cellNode.textContent.replace(/\|/g, '\\|'));
    });
    if (rowNode.type.name === 'table_header_row') {
      colCount = cells.length;
      rows.push('| ' + cells.join(' | ') + ' |');
      rows.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');
    } else {
      rows.push('| ' + cells.join(' | ') + ' |');
    }
  });

  return rows.join('\n');
}

// ─── Table parser ─────────────────────────────────────────────────────────────

export function parseMarkdownToTable(raw: string, schema: Schema): PMNode | null {
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 3) return null;

  const headerLine = lines[0];
  const sepLine = lines[1];
  const dataLines = lines.slice(2);

  if (!/^\|[-| :]+\|$/.test(sepLine)) return null;

  const parseRow = (line: string): string[] =>
    line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  const headerCells = parseRow(headerLine);
  const colCount = headerCells.length;

  const tableType      = schema.nodes['table'];
  const headerRowType  = schema.nodes['table_header_row'];
  const rowType        = schema.nodes['table_row'];
  const headerType     = schema.nodes['table_header'];
  const cellType       = schema.nodes['table_cell'];

  if (!tableType || !headerRowType || !rowType || !headerType || !cellType) return null;

  const paragraphType = schema.nodes['paragraph'];
  if (!paragraphType) return null;

  const makeCell = (type: typeof headerType, text: string): PMNode => {
    const content = text.length > 0 ? [paragraphType.create({}, [schema.text(text)])] : [paragraphType.create({})];
    return type.create({}, content);
  };

  const headerRow = headerRowType.create(
    {},
    headerCells.map(c => makeCell(headerType, c)),
  );

  const dataRows = dataLines.map(line => {
    const cells = parseRow(line);
    const paddedCells = Array.from({ length: colCount }, (_, i) => cells[i] ?? '');
    return rowType.create(
      {},
      paddedCells.map(c => makeCell(cellType, c)),
    );
  });

  return tableType.create({}, [headerRow, ...dataRows]);
}

// ─── Cursor detection ─────────────────────────────────────────────────────────

interface MarkRange  { from: number; to: number; mark: Mark; text: string }
interface ImageRange { from: number; to: number; node: PMNode }
interface BlockRange { from: number; to: number; node: PMNode }

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
        if (segStart <= pos && pos < segEnd) {
          return { from: segStart, to: segEnd, mark: foundMark!, text };
        }
        inSeg = false; segStart = -1; segEnd = -1; foundMark = null; text = '';
      }
      offset += child.nodeSize;
    }

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

interface TableRange { from: number; to: number; node: PMNode }

function findTableAtCursor(state: EditorState): TableRange | null {
  const sel = state.selection;
  const pos =
    sel instanceof TextSelection && sel.$cursor ? sel.$cursor.pos :
    sel instanceof NodeSelection ? sel.from : -1;
  if (pos < 0) return null;

  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'table') {
      return { from: $pos.before(depth), to: $pos.after(depth), node };
    }
  }
  return null;
}

function findBlockAtCursor(state: EditorState): BlockRange | null {
  const sel = state.selection;

  // Leaf nodes selected as NodeSelection (e.g. horizontal_rule)
  if (sel instanceof NodeSelection && EXPANDABLE_BLOCKS.includes(sel.node.type.name)) {
    return { from: sel.from, to: sel.to, node: sel.node };
  }

  if (!(sel instanceof TextSelection) || !sel.$cursor) return null;
  const $c = sel.$cursor;

  for (let depth = $c.depth; depth >= 1; depth--) {
    const node = $c.node(depth);
    if (EXPANDABLE_BLOCKS.includes(node.type.name)) {
      return { from: $c.before(depth), to: $c.after(depth), node };
    }
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
            | { type: 'expand'; from: number; to: number; originalRaw: string; mode: 'mark' | 'block' | 'table' }
            | { type: 'collapse' }
            | undefined;

          if (meta?.type === 'expand') {
            return { expanded: { from: meta.from, to: meta.to, originalRaw: meta.originalRaw, mode: meta.mode } };
          }
          if (meta?.type === 'collapse') return { expanded: null };

          if (prev.expanded) {
            return {
              expanded: {
                from: tr.mapping.map(prev.expanded.from, -1),
                to:   tr.mapping.map(prev.expanded.to,    1),
                originalRaw: prev.expanded.originalRaw,
                mode: prev.expanded.mode,
              },
            };
          }
          return prev;
        },
      },

      appendTransaction: (trs, _oldState, newState): Transaction | null => {
        // Skip only when an expand just fired — stillInside will return null anyway,
        // but we must NOT skip after a collapse, because the cursor may have moved
        // into a new expandable block that needs to be expanded in the same pass.
        const lastMeta = trs.length > 0
          ? (trs[trs.length - 1].getMeta(META_KEY) as { type: string } | undefined)
          : undefined;
        if (lastMeta?.type === 'expand') return null;

        const lpState = key.getState(newState)!;
        const schema  = newState.schema;
        const sel     = newState.selection;
        const cursorPos =
          sel instanceof TextSelection && sel.$cursor ? sel.$cursor.pos :
          sel instanceof NodeSelection ? sel.from : -1;

        // ── Currently expanded: detect cursor exit and commit ────────────
        if (lpState.expanded) {
          const { from, to, originalRaw, mode } = lpState.expanded;

          // For blocks, use the actual current node boundary instead of the
          // mapped `to`. When Enter splits the expanded paragraph, `to` (mapped
          // with bias +1) grows to encompass the new paragraph, causing the
          // collapse to concatenate text from both paragraphs. Using nodeAt(from)
          // gives the real boundary of the original (possibly shortened) node.
          const effectiveTo = mode === 'block'
            ? (() => { const n = newState.doc.nodeAt(from); return n ? from + n.nodeSize : to; })()
            : to;

          if (from >= effectiveTo) {
            const tr = newState.tr.setMeta(META_KEY, { type: 'collapse' });
            tr.setMeta('addToHistory', false);
            return tr;
          }

          const stillInside = mode === 'mark'
            ? (cursorPos >= from && cursorPos < effectiveTo)
            : (cursorPos > from && cursorPos < effectiveTo);

          if (stillInside) return null;

          let rawText: string;
          if (mode === 'mark') {
            rawText = newState.doc.textBetween(from, effectiveTo, '', '');
          } else {
            // Block: text is inside node boundaries (from+1 .. effectiveTo-1)
            const safeFrom = Math.min(from + 1, newState.doc.content.size);
            const safeTo   = Math.max(safeFrom, Math.min(effectiveTo - 1, newState.doc.content.size));
            rawText = safeTo > safeFrom ? newState.doc.textBetween(safeFrom, safeTo, '', '') : '';
          }

          const changed = rawText !== originalRaw;
          let tr: Transaction = newState.tr;

          if (mode === 'mark') {
            if (rawText.length === 0) {
              tr = tr.delete(from, effectiveTo);
            } else {
              const parsed = parseMarkdownToMark(rawText, schema);
              if (parsed && isImageParsed(parsed)) {
                const imgNode = schema.nodes['image']?.create(parsed);
                if (imgNode) tr = tr.replaceWith(from, effectiveTo, imgNode);
              } else if (parsed) {
                const { text: mText, mark } = parsed as ParsedMark;
                tr = mText.length
                  ? tr.replaceWith(from, effectiveTo, schema.text(mText, [mark]))
                  : tr.delete(from, effectiveTo);
              }
            }
          } else if (mode === 'table') {
            // Table collapse: code_block → table node
            const safeFrom = Math.min(from, newState.doc.content.size);
            const safeTo   = Math.min(to, newState.doc.content.size);
            if (rawText.length > 0) {
              const parsedTable = parseMarkdownToTable(rawText, schema);
              if (parsedTable && safeFrom < safeTo) {
                tr = tr.replaceWith(safeFrom, safeTo, parsedTable);
              }
              // If parse failed, leave as code_block
            }
          } else {
            // Block collapse
            const safeFrom = Math.min(from, newState.doc.content.size);
            const safeTo   = Math.min(effectiveTo, newState.doc.content.size);
            if (rawText.length === 0) {
              if (safeFrom < safeTo) tr = tr.delete(safeFrom, safeTo);
            } else {
              const parsedBlock = parseMarkdownToBlock(rawText, schema);
              if (parsedBlock && safeFrom < safeTo) {
                tr = tr.replaceWith(safeFrom, safeTo, parsedBlock);
              }
              // If parse failed, leave as paragraph
            }
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
            const offset  = cursorPos - from;
            const markLen = to - from;
            const ratio   = markLen > 0 ? offset / markLen : 0;
            const rawPos  = from + Math.round(ratio * rawText.length);
            tr.setSelection(TextSelection.create(tr.doc, Math.max(from, Math.min(from + rawText.length, rawPos))));
            tr.setMeta(META_KEY, { type: 'expand', from, to: from + rawText.length, originalRaw: rawText, mode: 'mark' });
            tr.setMeta('addToHistory', false);
            return tr;
          }
        }

        const imgRange = findImageAtCursor(newState);
        if (imgRange) {
          const { from, to, node } = imgRange;
          const rawText = serializeImageToMarkdown(node);

          const tr = newState.tr.replaceWith(from, to, schema.text(rawText));
          tr.setSelection(TextSelection.create(tr.doc, from + 2));
          tr.setMeta(META_KEY, { type: 'expand', from, to: from + rawText.length, originalRaw: rawText, mode: 'mark' });
          tr.setMeta('addToHistory', false);
          return tr;
        }

        // ── Check for expandable block nodes ─────────────────────────────
        const blockRange = findBlockAtCursor(newState);
        if (blockRange) {
          const { from, to, node } = blockRange;
          let rawText: string;

          switch (node.type.name) {
            case 'heading':
              rawText = serializeHeadingToMarkdown(node);
              break;
            case 'blockquote':
              rawText = serializeBlockquoteToMarkdown(node);
              break;
            case 'hr':
              rawText = serializeHrToMarkdown();
              break;
            default:
              return null;
          }

          const paragraphType = schema.nodes['paragraph'];
          if (!paragraphType) return null;

          const paragraphNode = paragraphType.create({}, schema.text(rawText));
          const tr = newState.tr.replaceWith(from, to, paragraphNode);

          // Place cursor after the prefix (e.g. after "# " for headings, after "> " for blockquotes)
          const spaceIdx = rawText.indexOf(' ');
          const prefixLen = spaceIdx >= 0 ? spaceIdx + 1 : rawText.length;
          const targetPos = from + 1 + Math.min(prefixLen, rawText.length);
          tr.setSelection(TextSelection.create(tr.doc, targetPos));

          const newNodeSize = paragraphNode.nodeSize;
          tr.setMeta(META_KEY, {
            type: 'expand',
            from,
            to: from + newNodeSize,
            originalRaw: rawText,
            mode: 'block',
          });
          tr.setMeta('addToHistory', false);
          return tr;
        }

        // ── Check for table nodes ────────────────────────────────────────
        const tableRange = findTableAtCursor(newState);
        if (tableRange) {
          const { from, to, node } = tableRange;
          const rawText = serializeTableToMarkdown(node);

          const codeBlockType = schema.nodes['code_block'];
          if (!codeBlockType) return null;

          const codeNode = rawText.length > 0
            ? codeBlockType.create({ language: '' }, schema.text(rawText))
            : codeBlockType.create({ language: '' });
          const tr = newState.tr.replaceWith(from, to, codeNode);
          tr.setSelection(TextSelection.create(tr.doc, from + 1));
          tr.setMeta(META_KEY, {
            type: 'expand',
            from,
            to: from + codeNode.nodeSize,
            originalRaw: rawText,
            mode: 'table',
          });
          tr.setMeta('addToHistory', false);
          return tr;
        }

        return null;
      },

      props: {
        handlePaste(view, event) {
          const sel = view.state.selection;
          if (sel instanceof TextSelection && sel.$cursor?.parent.type.name === 'code_block') return false;
          const text = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
          const tableNode = parseMarkdownToTable(text.trim(), view.state.schema);
          if (!tableNode) return false;
          const from = sel.from;
          const tr = view.state.tr.replaceSelectionWith(tableNode);
          const afterPos = from + tableNode.nodeSize;
          try { tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(afterPos, tr.doc.content.size)))); } catch { /* noop */ }
          view.dispatch(tr);
          return true;
        },

        handleKeyDown(view, event) {
          if ((event as KeyboardEvent).key !== 'Enter') return false;
          const { state } = view;
          const sel = state.selection;
          if (!(sel instanceof TextSelection) || !sel.$cursor) return false;
          const $c = sel.$cursor;
          if ($c.parent.type.name !== 'paragraph') return false;

          const sepText = $c.parent.textContent.trim();
          if (!/^\|[-| :]+\|$/.test(sepText)) return false;

          const sepFrom = $c.before($c.depth);
          const sepTo = $c.after($c.depth);
          if (sepFrom <= 1) return false;

          // Resolve AT sepFrom (the gap between the two sibling nodes) to get nodeBefore = prev paragraph
          const $atSep = state.doc.resolve(sepFrom);
          const prevNode = $atSep.nodeBefore;
          if (!prevNode || prevNode.type.name !== 'paragraph') return false;

          const headerText = prevNode.textContent.trim();
          if (!/^\|.+\|$/.test(headerText)) return false;

          const colCount = headerText.replace(/^\||\|$/g, '').split('|').length;
          const emptyRow = Array(colCount).fill('|  ').join('') + '|';
          const tableNode = parseMarkdownToTable(`${headerText}\n${sepText}\n${emptyRow}`, state.schema);
          if (!tableNode) return false;

          const prevFrom = sepFrom - prevNode.nodeSize;
          const tr = state.tr.replaceWith(prevFrom, sepTo, tableNode);
          const afterPos = prevFrom + tableNode.nodeSize;
          try { tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(afterPos, tr.doc.content.size)))); } catch { /* noop */ }
          view.dispatch(tr);
          return true;
        },
      },
    })
  );
}

// ─── Insert table command ─────────────────────────────────────────────────────

export function insertTableAtCursor(view: EditorView): void {
  const { state } = view;
  const schema = state.schema;

  const tableType     = schema.nodes['table'];
  const headerRowType = schema.nodes['table_header_row'];
  const rowType       = schema.nodes['table_row'];
  const headerType    = schema.nodes['table_header'];
  const cellType      = schema.nodes['table_cell'];
  const paraType      = schema.nodes['paragraph'];

  if (!tableType || !headerRowType || !rowType || !headerType || !cellType || !paraType) return;

  const makeCell = (type: typeof headerType) => type.create({}, [paraType.create({})]);
  const headerRow = headerRowType.create({}, [makeCell(headerType), makeCell(headerType)]);
  const dataRow   = rowType.create({}, [makeCell(cellType), makeCell(cellType)]);
  const tableNode = tableType.create({}, [headerRow, dataRow]);

  const from = state.selection.from;
  const tr = state.tr.replaceSelectionWith(tableNode);
  const afterPos = from + tableNode.nodeSize;
  try { tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(afterPos, tr.doc.content.size)))); } catch { /* noop */ }
  view.dispatch(tr);
  view.focus();
}
