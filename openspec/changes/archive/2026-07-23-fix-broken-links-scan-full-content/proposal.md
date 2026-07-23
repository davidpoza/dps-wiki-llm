## Why

`BrokenLinkScanService.scan()` only searches for wiki links (`[[...]]`) inside the `Related` section of each note. Links embedded in any other section (Summary, Facts, Interpretation, Relationships, etc.) are silently ignored, leaving real broken links undetected.

## What Changes

- Extend the scan to extract wiki links from **all sections** of each note, not just `Related`.
- The delete operation (`deleteLinks`) remains scoped to the `Related` section only, since deleting links from prose sections requires editorial judgment.
- Broken link entries from non-Related sections will be reported in scan results with their source section indicated, so users know which links they must fix manually.

## Capabilities

### New Capabilities
- `broken-links-full-scan`: Scan for broken wiki links across the entire content of a note (all sections), reporting each broken link with its source section.

### Modified Capabilities

## Impact

- `BrokenLinkScanService.java`: `scan()` and `extractBrokenLinks()` logic changes.
- `BrokenLinkEntry` DTO: may need a `section` field to indicate where the broken link was found.
- Frontend: broken link list may show a new "section" column or grouping to distinguish Related links (auto-deletable) from prose links (manual fix required).
