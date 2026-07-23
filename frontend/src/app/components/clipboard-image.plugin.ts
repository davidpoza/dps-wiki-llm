import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Observable } from 'rxjs';

export interface ClipboardImageOptions {
  uploadImage: (file: File) => Observable<{ path: string }>;
  onError: (message: string) => void;
}

const key = new PluginKey('clipboard-image');

export function createClipboardImagePlugin(options: ClipboardImageOptions) {
  return $prose(
    () =>
      new Plugin({
        key,
        props: {
          handleDOMEvents: {
            paste: (view, event) => {
              const clipboardEvent = event as ClipboardEvent;
              const items = clipboardEvent.clipboardData?.items;
              if (!items) return false;

              const imageItem = Array.from(items).find((item) =>
                item.type.startsWith('image/'),
              );
              if (!imageItem) return false;

              const file = imageItem.getAsFile();
              if (!file) return false;

              event.preventDefault();

              options.uploadImage(file).subscribe({
                next: ({ path }) => {
                  const { state, dispatch } = view;
                  const imageNode = state.schema.nodes['image'];
                  if (!imageNode) return;
                  const node = imageNode.create({ src: path, alt: '', title: '' });
                  const tr = state.tr.replaceSelectionWith(node);
                  dispatch(tr);
                },
                error: (err) => {
                  const status = err?.status ?? 0;
                  if (status === 400) {
                    options.onError('El directorio de recursos no está configurado. Configúralo en Ajustes.');
                  } else {
                    options.onError('Error al subir la imagen.');
                  }
                },
              });

              return true;
            },
          },
        },
      }),
  );
}
