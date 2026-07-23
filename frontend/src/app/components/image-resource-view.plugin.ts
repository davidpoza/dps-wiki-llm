import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Node } from '@milkdown/prose/model';

export interface ImageResourceViewOptions {
  getToken: () => string | null;
}

const key = new PluginKey('image-resource-view');

function toApiSrc(src: string, token: string | null): string {
  if (!src || src.startsWith('http') || src.startsWith('//') || src.startsWith('data:') || src.startsWith('/api/')) {
    return src;
  }
  const params = new URLSearchParams({ path: src });
  if (token) params.set('token', token);
  return `/api/files/resource?${params}`;
}

export function createImageResourceViewPlugin(options: ImageResourceViewOptions) {
  return $prose(
    () =>
      new Plugin({
        key,
        props: {
          nodeViews: {
            image(node: Node) {
              const img = document.createElement('img');
              img.style.maxWidth = '100%';

              const applyAttrs = (n: Node) => {
                const src = (n.attrs['src'] as string) ?? '';
                img.src = toApiSrc(src, options.getToken());
                img.alt = (n.attrs['alt'] as string) ?? '';
                img.title = (n.attrs['title'] as string) ?? '';
                return true;
              };

              applyAttrs(node);

              return { dom: img, update: applyAttrs };
            },
          },
        },
      }),
  );
}
