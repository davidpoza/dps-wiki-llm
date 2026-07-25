## Context

The "Regenerar keywords" modal uses `GET /api/notes/list?folders=wiki/concepts&folders=wiki/sources` to populate its note list. The backend already walks subdirectories recursively (`Files.walk`), so the API is capable of handling broader folder roots. On the frontend, each note row renders `note.title`, which is derived from the bare filename (without extension), losing all path context.

## Goals / Non-Goals

**Goals:**
- Display the full vault-relative path (e.g., `wiki/concepts/my-note.md`) in each note row instead of just the filename.
- Expand the note query to cover the entire `wiki/` subtree by passing `wiki` as the single folder parameter.
- Keep the folder grouping headers intact (they already use the full parent path).

**Non-Goals:**
- Changing the backend `NoteListController` — it already supports arbitrary folders and recursive walk.
- Modifying the health-check selection modal or any other modal (separate concern).
- Changing the API contract (`NoteEntry.path`, `NoteEntry.title`, `NoteEntry.hasKeywords` remain unchanged).

## Decisions

### Display path, not title

`note.title` is stripped of directory context and was designed for a flat single-folder list. Switching to `note.path` gives the user the full location. The path is already returned by the backend and used internally for grouping, so no extra data is needed.

### Use `['wiki']` as the single folder argument

Passing the parent folder `wiki` lets the backend's `Files.walk` enumerate every `.md` file in the entire wiki subtree. This future-proofs the modal against new subdirectory additions (e.g., `wiki/topics`, custom subdirs). Alternative considered: enumerate known subfolders explicitly — rejected because it requires code changes each time a new folder is added.

### Folder grouping header remains unchanged

The existing `notesByFolder` computed already groups by `note.path.substring(0, note.path.lastIndexOf('/'))`, which produces meaningful group headers (e.g., `wiki/concepts/subfolder`). No change needed there.

## Risks / Trade-offs

- **Wider scope may include unintended notes** (e.g., drafts or scratch files under `wiki/`) → Mitigation: the user can filter with the search input and deselect unwanted notes before submitting.
- **Path string is longer than title** and may overflow the note row → Mitigation: the `.note-title` CSS already applies `text-overflow: ellipsis`, so overflow is handled gracefully.

## Migration Plan

Pure frontend change. No schema migration, no backend deployment needed. Deploy the updated Angular component and settings description text.
