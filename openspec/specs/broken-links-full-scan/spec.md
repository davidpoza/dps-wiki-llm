# broken-links-full-scan Specification

## Purpose
TBD - created by archiving change fix-broken-links-scan-full-content. Update Purpose after archive.
## Requirements
### Requirement: Scan wiki links in all note sections
The system SHALL extract wiki links (`[[...]]`) from every section of a note during a broken-links scan, not only from the `Related` section.

#### Scenario: Link broken in Summary section is detected
- **WHEN** a note has `[[NonExistentNote]]` inside its `## Summary` section
- **THEN** the scan result SHALL include an entry with `sourceFile`, `link = "NonExistentNote"`, and `sourceSection = "Summary"`

#### Scenario: Link broken in Related section is still detected
- **WHEN** a note has `[[NonExistentNote]]` inside its `## Related` section
- **THEN** the scan result SHALL include an entry with `sourceSection = "Related"`

#### Scenario: Valid link in any section is not reported
- **WHEN** a wiki link resolves to an existing note slug
- **THEN** no broken-link entry SHALL be created for that link regardless of which section it appears in

### Requirement: BrokenLinkEntry carries source section
The `BrokenLinkEntry` DTO SHALL include a `sourceSection` field indicating which section of the note contained the broken link.

#### Scenario: Entry has correct section name
- **WHEN** the scan produces a broken link from a given section
- **THEN** `entry.sourceSection` SHALL equal the exact section header text (e.g., `"Related"`, `"Summary"`, `"Facts"`)

### Requirement: UI distinguishes deletable vs. informational broken links
The broken-links modal SHALL visually distinguish entries from the `Related` section (which can be auto-deleted) from entries in other sections (which require manual editing).

#### Scenario: Related broken link is selectable for deletion
- **WHEN** a broken link has `sourceSection = "Related"`
- **THEN** its checkbox SHALL be enabled and the entry SHALL be included in the delete selection

#### Scenario: Non-Related broken link is not selectable for deletion
- **WHEN** a broken link has `sourceSection` other than `"Related"`
- **THEN** its checkbox SHALL be disabled and the entry SHALL display a section badge (e.g., `[Summary]`)

#### Scenario: Delete request only sends Related entries
- **WHEN** user confirms deletion
- **THEN** only entries with `sourceSection = "Related"` SHALL be sent to the backend delete endpoint

