## ADDED Requirements

### Requirement: Read-only document viewer route
The system SHALL provide a read-only document viewer accessible at `/viewer/<file-path>` that renders the Markdown content of the specified file without edit controls.

#### Scenario: Viewing a document at /viewer route
- **WHEN** the user navigates to `/viewer/carpeta/doc.md`
- **THEN** the document is rendered as read-only Markdown HTML with no save button, no toolbar, and no editor input

#### Scenario: Viewing a non-existent document
- **WHEN** the user navigates to `/viewer/no-existe.md` and the file does not exist
- **THEN** a "document not found" message is displayed

### Requirement: Viewer requires authentication
The system SHALL require the user to be authenticated to access the `/viewer/**` route.

#### Scenario: Unauthenticated access redirects to login
- **WHEN** an unauthenticated user navigates to `/viewer/<file-path>`
- **THEN** the user is redirected to `/login`

### Requirement: Viewer has no unsaved-changes guard
The system SHALL NOT apply the unsaved-changes guard to the viewer route, since it is read-only.

#### Scenario: Navigating away from viewer is immediate
- **WHEN** the user is on `/viewer/<file-path>` and navigates to another route
- **THEN** navigation proceeds immediately without any confirmation dialog

### Requirement: Viewer displays document metadata
The system SHALL display the frontmatter metadata (if present) of the document above the rendered content in the viewer.

#### Scenario: Document with frontmatter shows metadata
- **WHEN** the user views a document that has YAML frontmatter
- **THEN** the frontmatter key-value pairs are displayed above the Markdown body in a read-only panel

#### Scenario: Document without frontmatter shows only content
- **WHEN** the user views a document that has no YAML frontmatter
- **THEN** only the rendered Markdown body is displayed, with no metadata panel
