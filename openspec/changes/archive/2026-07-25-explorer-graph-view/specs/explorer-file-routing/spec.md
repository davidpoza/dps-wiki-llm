## MODIFIED Requirements

### Requirement: Base explorer route without file
The system SHALL display the explorer with an empty editor panel (placeholder) when the user navigates to `/explorer` with no file path. When `sidebarPanel === 'graph'`, the graph view SHALL occupy the main area instead of the editor placeholder.

#### Scenario: Navigating to /explorer shows empty editor
- **WHEN** the user navigates to `/explorer` and `sidebarPanel` is not `'graph'`
- **THEN** the file tree is displayed, no file is loaded, and the editor panel shows the "select a file" placeholder

#### Scenario: Navigating to /explorer with graph active shows graph view
- **WHEN** the user navigates to `/explorer` and `sidebarPanel === 'graph'`
- **THEN** the Cytoscape.js graph occupies the main area and the settings panel is in the side panel
