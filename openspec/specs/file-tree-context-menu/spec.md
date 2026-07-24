# file-tree-context-menu Specification

## Purpose
TBD - created by archiving change file-tree-context-menu. Update Purpose after archive.
## Requirements
### Requirement: Right-click on file node opens a context menu
When the user right-clicks a file node in the file navigator tree, a context menu SHALL appear near the cursor with two items: "Rename" and "Delete".

#### Scenario: Context menu appears on file right-click
- **WHEN** the user right-clicks a leaf (file) node in the tree
- **THEN** a context menu is displayed with items "Rename" and "Delete"

#### Scenario: Context menu does not appear on left-click
- **WHEN** the user left-clicks any tree node
- **THEN** no context menu is shown (existing select behavior is unchanged)

---

### Requirement: Right-click on directory node opens a context menu
When the user right-clicks a directory (non-leaf) node, a context menu SHALL appear with a single item: "Create file".

#### Scenario: Context menu appears on directory right-click
- **WHEN** the user right-clicks a non-leaf (directory) node in the tree
- **THEN** a context menu is displayed with item "Create file"

---

### Requirement: Rename file via dialog
Selecting "Rename" from a file's context menu SHALL open a dialog prompting for a new filename. On confirmation, the frontend SHALL enqueue an async RENAME job and navigate to `/jobs`. The rename is not performed synchronously.

#### Scenario: Rename dialog opens
- **WHEN** the user selects "Rename" from a file's context menu
- **THEN** a dialog appears pre-populated with the current filename

#### Scenario: Rename confirmed — job enqueued and user redirected
- **WHEN** the user enters a valid new filename and confirms the dialog
- **THEN** the frontend calls `POST /api/jobs/rename?path=&newName=` and receives `202 Accepted`
- **THEN** the frontend navigates to `/jobs`

#### Scenario: Rename of currently open file
- **WHEN** the renamed file is the one currently open in the editor
- **THEN** after navigating to `/jobs` the editor is no longer shown; the user can navigate back to the file under its new name once the job completes

#### Scenario: Rename cancelled
- **WHEN** the user closes or cancels the rename dialog
- **THEN** no job is enqueued and no navigation occurs

#### Scenario: Rename fails (name collision)
- **WHEN** the backend returns `409 Conflict` from the enqueue endpoint (file with new name already exists)
- **THEN** an error toast is shown and the user remains on the current page; no navigation to `/jobs`

### Requirement: Delete file with confirmation
Selecting "Delete" from a file's context menu SHALL open a confirmation dialog before deleting.

#### Scenario: Delete confirmation dialog opens
- **WHEN** the user selects "Delete" from a file's context menu
- **THEN** a confirmation dialog appears asking "¿Eliminar el fichero '<name>'?"

#### Scenario: Delete confirmed
- **WHEN** the user confirms deletion
- **THEN** the file is deleted on the backend and removed from the tree

#### Scenario: Delete of currently open file
- **WHEN** the deleted file is the one currently open in the editor
- **THEN** the editor is reset to empty state (no file selected)

#### Scenario: Delete cancelled
- **WHEN** the user cancels the confirmation dialog
- **THEN** the file is not deleted and the tree remains unchanged

---

### Requirement: Create file inside directory
Selecting "Create file" from a directory's context menu SHALL open a dialog prompting for a new filename.

#### Scenario: Create file dialog opens
- **WHEN** the user selects "Create file" from a directory's context menu
- **THEN** a dialog appears with an empty filename input

#### Scenario: Create file confirmed
- **WHEN** the user enters a valid filename and confirms
- **THEN** an empty `.md` file is created inside that directory on the backend and the tree refreshes

#### Scenario: New file auto-opened
- **WHEN** the new file is created successfully
- **THEN** it is automatically selected and opened in the editor

#### Scenario: Create file cancelled
- **WHEN** the user closes or cancels the dialog
- **THEN** no file is created

#### Scenario: Create file fails (name collision)
- **WHEN** a file with the same name already exists in that directory
- **THEN** an error toast is shown and no file is created

---

### Requirement: Context menu closes on outside click or Escape
The context menu SHALL be dismissed when the user clicks elsewhere or presses Escape.

#### Scenario: Dismiss by clicking outside
- **WHEN** the context menu is open and the user clicks anywhere outside it
- **THEN** the context menu closes

#### Scenario: Dismiss by Escape key
- **WHEN** the context menu is open and the user presses Escape
- **THEN** the context menu closes

