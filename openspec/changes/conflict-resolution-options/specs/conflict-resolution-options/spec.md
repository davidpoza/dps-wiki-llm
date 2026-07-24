## ADDED Requirements

### Requirement: Collapsed conflict list with resolved counter
The conflict dialog SHALL display each conflict as a collapsed row (path + action buttons only) by default. The dialog header SHALL show a "X / N resueltos" counter where N is the total number of conflicts when the dialog opened and X is how many have been resolved in the current session.

#### Scenario: Initial state collapsed
- **WHEN** the conflict dialog opens
- **THEN** each conflict entry SHALL show only the file path and action buttons; the diff panes SHALL be hidden

#### Scenario: Expand a conflict
- **WHEN** the user clicks the path row of a collapsed conflict
- **THEN** the diff panes (local and remote) SHALL be revealed for that conflict only; other conflicts SHALL remain collapsed

#### Scenario: Collapse an expanded conflict
- **WHEN** the user clicks the path row of an already-expanded conflict
- **THEN** the diff panes SHALL be hidden again

#### Scenario: Resolved counter updates
- **WHEN** any conflict is resolved (LOCAL, REMOTE, SKIP, or MANUAL)
- **THEN** the "X / N resueltos" counter SHALL increment X by one without reloading the total N

### Requirement: Bulk conflict resolution
The system SHALL provide bulk-action buttons in the conflict dialog that resolve all currently listed conflicts using the local version or the remote version with a single click.

#### Scenario: Bulk keep local
- **WHEN** the user clicks "Aplicar versión local a todos"
- **THEN** the system SHALL call the resolve endpoint with `keep: "LOCAL"` for every listed conflict, and remove successfully resolved conflicts from the dialog

#### Scenario: Bulk keep remote
- **WHEN** the user clicks "Aplicar versión remota a todos"
- **THEN** the system SHALL call the resolve endpoint with `keep: "REMOTE"` for every listed conflict, and remove successfully resolved conflicts from the dialog

#### Scenario: Partial bulk failure
- **WHEN** a bulk resolution encounters an error for one or more conflicts
- **THEN** the system SHALL keep any failed conflicts in the dialog and display an error summary; successfully resolved conflicts SHALL be removed

### Requirement: Skip conflict without resolution
The system SHALL allow the user to dismiss a conflict without making any changes to the local file or the WebDAV repository.

#### Scenario: User skips a conflict
- **WHEN** the user clicks "No resolver" on a conflict
- **THEN** the system SHALL call `POST /api/webdav/conflicts/resolve` with `keep: "SKIP"`, the conflict flag SHALL be cleared in the database, no file write or WebDAV push SHALL occur, and the conflict SHALL be removed from the dialog

#### Scenario: Skipped conflict reappears after sync
- **WHEN** a previously skipped conflict's file still differs on both local and remote sides during a subsequent sync
- **THEN** the system SHALL re-report the file as a conflict in the next sync result

### Requirement: VS Code-style three-pane merge editor
The system SHALL provide a dedicated full-screen merge editor component that opens when the user requests manual resolution of a conflict. The editor SHALL display three panes: local content (top-left, read-only), remote content (top-right, read-only), and a result pane (bottom, editable). The user composes the final content in the result pane and submits it.

#### Scenario: Open merge editor
- **WHEN** the user clicks "Resolución manual" on a conflict
- **THEN** a full-screen dialog SHALL open showing the local content on the left, remote content on the right, and an empty editable result pane at the bottom

#### Scenario: Pre-fill result with local content
- **WHEN** the user clicks "Tomar local completo" inside the merge editor
- **THEN** the result pane SHALL be populated with the full local content, replacing any existing content in the result pane

#### Scenario: Pre-fill result with remote content
- **WHEN** the user clicks "Tomar remoto completo" inside the merge editor
- **THEN** the result pane SHALL be populated with the full remote content, replacing any existing content in the result pane

#### Scenario: Submit merged content
- **WHEN** the user clicks "Resolver" in the merge editor with non-empty content in the result pane
- **THEN** the system SHALL call `POST /api/webdav/conflicts/resolve` with `keep: "MANUAL"` and the result pane content, the merge editor SHALL close, the conflict SHALL be removed from the list, and the resolved counter SHALL increment

#### Scenario: Cancel merge editor
- **WHEN** the user clicks "Cancelar" in the merge editor
- **THEN** the merge editor SHALL close and no changes SHALL be made
