# clickable-note-paths Specification

## Purpose
TBD - created by archiving change jobs-concept-proposals-and-note-links. Update Purpose after archive.
## Requirements
### Requirement: File paths in jobs screen are clickable
In `JobsViewerComponent`, every file path displayed in the `job.files` list SHALL be rendered as an interactive element (button or link) that navigates to the corresponding note in the markdown editor via `router.navigate(['explorer', ...path.split('/')])`.

#### Scenario: User clicks a file path in a completed job
- **WHEN** the user clicks a file path in the jobs screen
- **THEN** the browser navigates to the explorer route for that file

#### Scenario: User clicks a file path in an active job
- **WHEN** the user clicks a file path while the job is still running
- **THEN** the browser navigates to the explorer route for that file

#### Scenario: Visual affordance
- **WHEN** the user hovers over a file path
- **THEN** the pointer cursor is shown and a hover highlight indicates the path is clickable

---

### Requirement: Activity path in jobs screen is clickable
The `currentActivity.path` displayed during a live scan in `JobsViewerComponent` SHALL also be rendered as a clickable element that opens the note in the editor.

#### Scenario: User clicks the active scan path
- **WHEN** a job is scanning files and `currentActivity.path` is shown
- **THEN** clicking it navigates to the explorer route for that path

---

### Requirement: Path text in changes screen is clickable
In `GitHistoryComponent`, the `<span class="file-path">` text (which already has a sibling icon button) SHALL also be clickable and SHALL navigate to the corresponding note in the editor.

#### Scenario: User clicks the path text in the changes screen
- **WHEN** the user clicks the file path text (not the icon button) in the changes/git-history screen
- **THEN** the browser navigates to the explorer route for that file

#### Scenario: Existing icon button still works
- **WHEN** the user clicks the icon button next to the file path
- **THEN** the behavior is unchanged — the note opens in the editor

