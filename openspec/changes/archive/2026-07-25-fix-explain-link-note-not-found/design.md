## Context

The "Explicar enlace" feature lets users right-click a `[[wikilink]]` in the editor and get an LLM explanation of how the source note relates to the target note. The wikilink plugin extracts just the link target (e.g. `"My Note"`) and fires an `onContextMenu` callback. That raw target was being sent directly to the backend as `targetPath`, but the backend's `VaultPathResolver` expects a vault-relative path that exists on disk (e.g. `"folder/My Note.md"`).

## Goals / Non-Goals

**Goals:**
- Resolve a raw wikilink name to its full vault-relative file path before sending to the backend.
- Show a clear error in the modal when the target note doesn't exist in the file tree.

**Non-Goals:**
- Fuzzy or partial-match resolution (use the same exact match logic as `navigateToWikilink`).
- Backend changes — the backend correctly requires a resolvable path.

## Decisions

**Frontend resolution (not backend fix):** The frontend already has the full file tree in memory (`allFiles()`), so resolving on the frontend avoids an extra round-trip and reuses existing logic. The backend path resolution is correct and should not be relaxed.

**Reuse `navigateToWikilink` logic:** The same case-insensitive lookup (by `data` path or `label`) is used. Extracted into `resolveWikilinkPath()` to avoid duplication if navigation needs are refactored later.

**Error in modal when path is null:** Rather than silently doing nothing when the note isn't found in `allFiles()`, the modal surfaces "La nota enlazada no existe." This matches the error message that was previously shown (incorrectly) for valid links.

## Risks / Trade-offs

- [Stale file tree] If the file tree hasn't loaded yet or is outdated, a valid note may not resolve → the error message appears. Mitigation: the file tree is loaded at startup and kept in sync; this edge case is acceptable.
