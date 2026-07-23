import { $prose } from '@milkdown/utils';
import { EditorState, Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet, EditorView } from '@milkdown/prose/view';

export const OBSIDIAN_IMAGE_PREVIEW_REFRESH = 'obsidian-image-preview-refresh';

const key = new PluginKey<DecorationSet>('obsidian-image-preview');
const EMBED_RE = /!\[\[([^\]\n]+)\]\]/g;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

export interface ObsidianImagePreviewOptions {
  getResourceFolder: () => string;
  getToken: () => string | null;
}

function buildResourcePath(target: string, resourceFolder: string): string | null {
  const cleanTarget = target.split('|')[0].split('#')[0].trim().replace(/\\/g, '/');
  if (!IMAGE_RE.test(cleanTarget)) return null;

  if (cleanTarget.includes('/')) {
    return cleanTarget.replace(/^\/+/, '');
  }

  const folder = resourceFolder
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!folder) return null;
  return cleanTarget;
}

function resourceUrl(path: string, token: string | null): string {
  const params = new URLSearchParams({ path });
  if (token) params.set('token', token);
  return `/api/files/resource?${params.toString()}`;
}

function selectionTouches(from: number, to: number, selFrom: number, selTo: number): boolean {
  return selFrom <= to && selTo >= from;
}

function buildDecorations(
  state: EditorState,
  getView: () => EditorView | null,
  options: ObsidianImagePreviewOptions,
): DecorationSet {
  const decorations: Decoration[] = [];
  const resourceFolder = options.getResourceFolder();
  const token = options.getToken();
  const { from: selFrom, to: selTo } = state.selection;

  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    EMBED_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EMBED_RE.exec(node.text)) !== null) {
      const start = pos + match.index;
      const end = start + match[0].length;
      if (selectionTouches(start, end, selFrom, selTo)) continue;

      const rawEmbed = match[0];
      const rawTarget = match[1];
      const path = buildResourcePath(rawTarget, resourceFolder);
      if (!path) continue;

      decorations.push(Decoration.inline(start, end, { class: 'obsidian-image-embed-hidden' }));
      decorations.push(
        Decoration.widget(
          start,
          () => {
            const figure = document.createElement('figure');
            figure.className = 'obsidian-image-preview';
            figure.title = rawEmbed;
            figure.addEventListener('mousedown', (event) => {
              const view = getView();
              if (!view) return;
              event.preventDefault();
              view.focus();
              view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(start + 1))));
            });

            const img = document.createElement('img');
            img.src = resourceUrl(path, token);
            img.alt = rawTarget;
            img.loading = 'lazy';
            img.addEventListener('error', () => {
              figure.classList.add('is-error');
              figure.title = `No se pudo cargar ${rawTarget}`;
            });
            figure.appendChild(img);
            return figure;
          },
          { side: -1 },
        ),
      );
    }
  });

  return DecorationSet.create(state.doc, decorations);
}

export function createObsidianImagePreviewPlugin(options: ObsidianImagePreviewOptions) {
  return $prose(() => {
    let currentView: EditorView | null = null;
    return new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, old, _oldState, newState) => {
          if (tr.docChanged || tr.selectionSet || tr.getMeta(OBSIDIAN_IMAGE_PREVIEW_REFRESH)) {
            return buildDecorations(newState, () => currentView, options);
          }
          return old.map(tr.mapping, tr.doc);
        },
      },
      props: {
        decorations: (state) => key.getState(state),
      },
      view: (view) => {
        currentView = view;
        queueMicrotask(() => {
          view.dispatch(view.state.tr.setMeta(OBSIDIAN_IMAGE_PREVIEW_REFRESH, true));
        });
        return {
          update: (view) => {
            currentView = view;
          },
          destroy: () => {
            currentView = null;
          },
        };
      },
    });
  });
}
