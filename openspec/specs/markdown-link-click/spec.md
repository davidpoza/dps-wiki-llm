# markdown-link-click Specification

## Purpose
TBD - created by archiving change markdown-link-support. Update Purpose after archive.
## Requirements
### Requirement: Markdown links open in a new tab when clicked
The editor SHALL open the URL of a rendered standard markdown link (`[text](url)`) in a new browser tab when the user clicks on the link text, without disrupting the current editing session.

#### Scenario: User clicks a rendered markdown link
- **WHEN** the user clicks on text rendered from a `[label](https://example.com)` markdown node inside the Milkdown editor
- **THEN** the system SHALL open `https://example.com` in a new browser tab using `window.open(href, '_blank', 'noopener,noreferrer')`
- **THEN** the click event SHALL be consumed (return `true`) so ProseMirror does not also process it as a cursor-placement event

#### Scenario: User clicks inside the editor on non-link text
- **WHEN** the user clicks on text that is not inside an `<a>` element with a valid `href`
- **THEN** the system SHALL NOT open any new tab and SHALL return `false` to allow ProseMirror default behavior

#### Scenario: Link with javascript: URI
- **WHEN** the rendered link's `href` starts with `javascript:`
- **THEN** the system SHALL NOT open it and SHALL return `false`

