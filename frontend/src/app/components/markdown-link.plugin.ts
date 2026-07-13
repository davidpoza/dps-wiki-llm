import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';

const key = new PluginKey('markdown-link');

const LINK_PATTERN = /\[([^\[\]]+)\]\(([^()]+)\)$/;

export function createMarkdownLinkPlugin() {
  return $prose(() =>
    new Plugin({
      key,
      props: {
        handleTextInput: (view, from, _to, text) => {
          if (text !== ')') return false;

          const { state } = view;
          const $from = state.doc.resolve(from);
          const textBefore = $from.parent.textContent.slice(0, $from.parentOffset) + ')';
          const match = LINK_PATTERN.exec(textBefore);
          if (!match) return false;

          const linkMark = state.schema.marks['link'];
          if (!linkMark) return false;

          const fullMatchLen = match[0].length;
          const matchStart = from - (fullMatchLen - 1);
          const label = match[1];
          const href = match[2];

          const mark = linkMark.create({ href, title: '' });
          const tr = state.tr.delete(matchStart, from).insertText(label, matchStart);
          tr.addMark(matchStart, matchStart + label.length, mark);
          tr.setSelection(TextSelection.create(tr.doc, matchStart + label.length));
          tr.removeStoredMark(linkMark);
          view.dispatch(tr);
          return true;
        },

        handleClick: (_view, _pos, event) => {
          let el = event.target as HTMLElement | null;
          while (el && el.tagName !== 'A') {
            el = el.parentElement;
          }
          if (!el) return false;
          const href = (el as HTMLAnchorElement).href;
          if (!href || href.toLowerCase().startsWith('javascript:')) return false;
          window.open(href, '_blank', 'noopener,noreferrer');
          return true;
        },
      },
    })
  );
}
