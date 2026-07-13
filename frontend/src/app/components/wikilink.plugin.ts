import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
const key = new PluginKey<DecorationSet>('wikilink-decorations');

export interface WikilinkCoords {
  left: number;
  top: number;
  bottom: number;
}

export interface WikilinkPluginOptions {
  onNavigate: (target: string) => void;
  onAutocomplete: (query: string | null, coords: WikilinkCoords | null, view: EditorView | null) => void;
}

function buildDecorations(doc: Parameters<typeof DecorationSet.create>[0]): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node: { isText: boolean; text?: string }, pos: number) => {
    if (!node.isText || !node.text) return;
    WIKILINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_RE.exec(node.text)) !== null) {
      const start = pos + match.index;
      const end = start + match[0].length;
      decorations.push(Decoration.inline(start, end, { class: 'wikilink-token' }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

export function createWikilinkPlugin(options: WikilinkPluginOptions) {
  return $prose(() =>
    new Plugin({
      key,
      state: {
        init: (_, { doc }) => buildDecorations(doc as Parameters<typeof DecorationSet.create>[0]),
        apply: (tr, old) => tr.docChanged
          ? buildDecorations(tr.doc as Parameters<typeof DecorationSet.create>[0])
          : old,
      },
      props: {
        decorations: state => key.getState(state),

        handleClick: (view, _pos, event) => {
          const el = event.target as HTMLElement;
          if (!el.classList.contains('wikilink-token')) return false;
          const raw = el.textContent ?? '';
          const match = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/.exec(raw);
          if (!match) return false;
          options.onNavigate(match[1].trim());
          return true;
        },
      },

      view: () => ({
        update: (view: EditorView) => {
          const { $head } = view.state.selection;
          const textBefore = $head.parent.textContent.slice(0, $head.parentOffset);
          const match = textBefore.match(/\[\[([^\]|]*)$/);
          if (match) {
            const coords = view.coordsAtPos($head.pos);
            options.onAutocomplete(match[1], coords, view);
          } else {
            options.onAutocomplete(null, null, null);
          }
        },
        destroy: () => options.onAutocomplete(null, null, null),
      }),
    })
  );
}
