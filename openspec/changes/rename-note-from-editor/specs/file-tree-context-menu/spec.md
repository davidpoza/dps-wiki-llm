## MODIFIED Requirements

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
