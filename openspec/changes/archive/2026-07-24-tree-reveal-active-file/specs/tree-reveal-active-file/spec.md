## ADDED Requirements

### Requirement: Reveal active file in tree on programmatic open
When a file is opened by any means other than directly clicking a tree node (URL navigation, global search, link click, history/jobs views), the file-tree panel SHALL expand all ancestor folder nodes and scroll the tree so the active file's node is visible.

#### Scenario: File in nested folder opened via URL
- **WHEN** the user navigates to a URL that resolves to a file inside one or more folders (e.g. `/explorer/notes/subfolder/file.md`) and the file-tree panel is visible
- **THEN** every ancestor folder node SHALL be expanded and the file node SHALL be visible and selected in the tree without manual interaction

#### Scenario: File opened via global search
- **WHEN** the user selects a result from the global search modal
- **THEN** the file-tree panel SHALL reveal and scroll to the opened file's node

#### Scenario: File opened from git-history or jobs view
- **WHEN** the user clicks a file path in the changes history or jobs view to open it in the editor
- **THEN** the file-tree panel SHALL reveal and scroll to the opened file's node

#### Scenario: Tree reloaded while file is open
- **WHEN** the file tree reloads (e.g., after a file save or rename) and a file is already open
- **THEN** the tree SHALL re-expand the ancestors of the currently open file and keep it selected

#### Scenario: User clicks a node directly — no double-reveal
- **WHEN** the user clicks a file node directly in the tree to open it
- **THEN** the reveal logic SHALL NOT run (node is already visible; no unexpected scroll occurs)

#### Scenario: File-tree panel is collapsed
- **WHEN** a file is opened programmatically and the file-tree panel is collapsed
- **THEN** ancestor nodes SHALL still be expanded in the background so they are already open if the user later reveals the panel
