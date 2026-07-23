# clean-diff-output Specification

## Purpose
TBD - created by archiving change reduce-diff-noise. Update Purpose after archive.
## Requirements
### Requirement: Diffs shall not include trailing empty lines from file newlines
When a file's content ends with a newline character (the normal case for text/markdown files), the unified diff output SHALL NOT include a spurious empty context line at the end caused by that trailing newline.

#### Scenario: File ending with newline produces clean diff
- **WHEN** `before` content is `"line1\nline2\n"` and `after` content is `"line1\nline3\n"`
- **THEN** the diff contains exactly one removed line (`-line2`) and one added line (`+line3`), with no trailing blank context line

#### Scenario: Both files identical except trailing newline count produce no diff noise
- **WHEN** `before` and `after` are identical markdown content both ending with `\n`
- **THEN** the diff output is empty (no spurious blank lines reported as changes)

### Requirement: Windows line endings shall be normalized before diffing
Content with `\r\n` or bare `\r` line endings SHALL be normalized to `\n` before the diff is computed, so that line-ending differences do not appear as content changes.

#### Scenario: CRLF content diffs cleanly against LF content
- **WHEN** `before` content uses `\r\n` line endings and `after` uses `\n` line endings but is otherwise identical
- **THEN** the diff output shows no changes

#### Scenario: CRLF content shows only real changes
- **WHEN** `before` content uses `\r\n` and `after` changes one line (also `\r\n`)
- **THEN** the diff contains only the changed line, without `\r` characters appearing in the output

### Requirement: Diff output shall not have extra blank lines at start or end
The string returned by the diff endpoint SHALL NOT begin or end with blank lines beyond what the unified diff format requires.

#### Scenario: Diff of normal markdown files has no leading or trailing blank lines
- **WHEN** a diff is generated for two non-empty markdown files with real content changes
- **THEN** the returned string does not start with `\n` and does not end with `\n\n`

