import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';

const key = new PluginKey('markdown-image');

// Matches: ![alt text](url) or ![alt text](url "title")
const IMAGE_PATTERN = /!\[([^[\]]*)\]\(([^() ]+)(?:\s+"([^"]*)")?\)$/;

export function createMarkdownImagePlugin() {
  return $prose(
    () =>
      new Plugin({
        key,
        props: {
          handleTextInput: (view, from, _to, text) => {
            if (text !== ')') return false;

            const { state } = view;
            const $from = state.doc.resolve(from);
            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset) + ')';
            const match = IMAGE_PATTERN.exec(textBefore);
            if (!match) return false;

            const imageNode = state.schema.nodes['image'];
            if (!imageNode) return false;

            const alt = match[1];
            const src = match[2];
            const title = match[3] ?? '';

            const fullMatchLen = match[0].length;
            const matchStart = from - (fullMatchLen - 1);

            const node = imageNode.create({ src, alt, title });
            const tr = state.tr.delete(matchStart, from).insert(matchStart, node);
            view.dispatch(tr);
            return true;
          },
        },
      }),
  );
}
