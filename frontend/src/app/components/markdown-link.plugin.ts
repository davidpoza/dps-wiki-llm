import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

const key = new PluginKey('markdown-link');

const LINK_PATTERN = /\[([^\[\]]+)\]\(([^()]+)\)$/;
const REF_LINK_PATTERN = /\[([^\[\]]+)\]\[([^\[\]]*)\]$/;
const AUTOLINK_URL_PATTERN = /<(https?:\/\/[^\s>]+)>$/;
const AUTOLINK_EMAIL_PATTERN = /<([^\s@>]+@[^\s@>]+\.[^\s>]+)>$/;

function resolveRefLink(ref: string, docText: string): { href: string; title: string } | null {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const defRe = new RegExp(`\\[${escaped}\\]:\\s*(\\S+)(?:[ \\t]+"([^"]*)")?`, 'im');
  const m = defRe.exec(docText);
  if (!m) return null;
  return { href: m[1], title: m[2] ?? '' };
}

function applyLinkMark(
  view: EditorView,
  state: EditorState,
  from: number,
  matchStart: number,
  label: string,
  href: string,
  title: string,
): boolean {
  const linkMark = state.schema.marks['link'];
  if (!linkMark) return false;
  const mark = linkMark.create({ href, title });
  const tr = state.tr.delete(matchStart, from).insertText(label, matchStart);
  tr.addMark(matchStart, matchStart + label.length, mark);
  tr.setSelection(TextSelection.create(tr.doc, matchStart + label.length));
  tr.removeStoredMark(linkMark);
  view.dispatch(tr);
  return true;
}

export function createMarkdownLinkPlugin() {
  return $prose(() =>
    new Plugin({
      key,
      props: {
        handleTextInput: (view, from, _to, text) => {
          const { state } = view;
          const $from = state.doc.resolve(from);
          const textBefore = $from.parent.textContent.slice(0, $from.parentOffset) + text;

          // Inline link: [label](url) on ')'
          if (text === ')') {
            const match = LINK_PATTERN.exec(textBefore);
            if (match) {
              const fullMatchLen = match[0].length;
              return applyLinkMark(
                view, state, from,
                from - (fullMatchLen - 1),
                match[1], match[2], '',
              );
            }
          }

          // Reference link: [label][ref] on ']'
          if (text === ']') {
            const refMatch = REF_LINK_PATTERN.exec(textBefore);
            if (refMatch) {
              const label = refMatch[1];
              const ref = refMatch[2].toLowerCase() || label.toLowerCase();
              const docText = state.doc.textBetween(0, state.doc.content.size, '\n', '\0');
              const resolved = resolveRefLink(ref, docText);
              if (resolved) {
                const fullMatchLen = refMatch[0].length;
                return applyLinkMark(
                  view, state, from,
                  from - (fullMatchLen - 1),
                  label, resolved.href, resolved.title,
                );
              }
            }
          }

          // Autolinks: <url> or <email> on '>'
          if (text === '>') {
            const urlMatch = AUTOLINK_URL_PATTERN.exec(textBefore);
            if (urlMatch) {
              const url = urlMatch[1];
              const fullMatchLen = urlMatch[0].length;
              return applyLinkMark(
                view, state, from,
                from - (fullMatchLen - 1),
                url, url, '',
              );
            }
            const emailMatch = AUTOLINK_EMAIL_PATTERN.exec(textBefore);
            if (emailMatch) {
              const email = emailMatch[1];
              const fullMatchLen = emailMatch[0].length;
              return applyLinkMark(
                view, state, from,
                from - (fullMatchLen - 1),
                email, `mailto:${email}`, '',
              );
            }
          }

          return false;
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
