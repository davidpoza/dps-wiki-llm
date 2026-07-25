## 1. Frontend — Modal note display and query scope

- [x] 1.1 In `keyword-selection-modal.component.ts`, change `listNotes(['wiki/concepts', 'wiki/sources'])` to `listNotes(['wiki'])` in the `load()` method
- [x] 1.2 In the modal template, replace `{{ note.title }}` with `{{ note.path }}` in the `.note-title` span so each row shows the full vault-relative path

## 2. Settings description text

- [x] 2.1 In `settings.component.ts`, update the Keywords section description to reflect that notes from the entire `wiki/` subtree are included (not just `wiki/concepts` and `wiki/sources`)

## 3. Spec update

- [x] 3.1 Apply the delta in `specs/keyword-regeneration-ui/spec.md` to `openspec/specs/keyword-regeneration-ui/spec.md` — replace the "Note selection modal in Settings" requirement with the updated version
