## 1. Create the link-click ProseMirror plugin

- [x] 1.1 Create `frontend/src/app/components/markdown-link.plugin.ts` — a `$prose` plugin with a `handleClick` prop that walks up from `event.target` looking for an `<a>` element with a non-`javascript:` `href` and calls `window.open(href, '_blank', 'noopener,noreferrer')`

## 2. Wire the plugin into the editor

- [x] 2.1 Import `createMarkdownLinkPlugin` in `explorer.component.ts` and add `.use(createMarkdownLinkPlugin())` in `initEditor()` alongside the existing wikilink plugin

## 3. Verify behavior

- [x] 3.1 Open the editor, type `[Duck Duck Go](https://duckduckgo.com)`, and confirm clicking the rendered link opens the URL in a new tab
- [x] 3.2 Confirm clicking non-link text does not open any new tab
- [x] 3.3 Confirm wikilink `[[PageName]]` clicks still navigate within the app (no regression)
