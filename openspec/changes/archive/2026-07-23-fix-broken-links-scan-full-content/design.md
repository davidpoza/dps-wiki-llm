## Context

`BrokenLinkScanService.scan()` parses each note with `MarkdownService`, then reads only `doc.sections().get("Related")` to extract wiki links. All other sections (Summary, Facts, Interpretation, etc.) are skipped.

The delete operation (`deleteLinksFromFile`) rewrites only the Related section. Deleting links from prose sections is out of scope — that requires editorial judgment.

The frontend modal groups broken links by file and lets users select entries to delete. It sends `{ sourceFile, link }` pairs to the backend.

## Goals / Non-Goals

**Goals:**
- Scan wiki links in ALL sections of each note, not just `Related`.
- Report each broken link with the section it came from (`sourceSection`).
- Let the UI distinguish deletable (Related) vs. informational (other) broken links.

**Non-Goals:**
- Auto-delete broken links from prose sections.
- Change how the slug index is built.
- Change the TARGET_FOLDERS list.

## Decisions

### Add `sourceSection` to `BrokenLinkEntry`

**Decision:** Add a `String sourceSection` field to the record.

**Rationale:** The frontend needs to know whether a link is deletable. The natural way to carry that is as a field on the entry itself, avoiding a parallel data structure.

**Alternative considered:** A separate `List<BrokenLinkEntry> nonDeletable` field on `BrokenLinkScanResult`. Rejected — it duplicates grouping logic already done in the frontend.

### Scan full content, not individual sections

**Decision:** Instead of `extractBrokenLinks(relPath, related, ...)`, iterate `doc.sections().entrySet()` and call `extractBrokenLinks` for each section, passing the section name.

**Alternative considered:** Call `WIKI_LINK.matcher(fullContent)` on the raw string before parsing. Rejected — that would pick up links in YAML frontmatter and code blocks; section-level scanning is already the right granularity.

### Frontend: disable delete checkbox for non-Related entries

**Decision:** Entries with `sourceSection !== 'Related'` show a section badge and have their checkbox disabled. The modal description text explains they must be fixed manually.

**Rationale:** The backend delete endpoint only removes from Related; sending a non-Related entry would silently no-op and confuse the user.

## Risks / Trade-offs

- [More scan results] Notes with many in-prose links may surface a lot of new broken links on first scan. → Acceptable; users asked for full coverage.
- [DTO change] `BrokenLinkEntry` gains a new field; if there are other consumers they'll need updating. → Only the modal component consumes it; verified.

## Migration Plan

No data migration needed. The change is additive: new field on DTO, broader scan logic, UI badge. Deploy as a regular release.
