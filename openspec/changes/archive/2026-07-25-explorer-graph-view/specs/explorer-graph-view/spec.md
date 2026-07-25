## ADDED Requirements

### Requirement: Graph view toggle button in sidebar toolbar
The system SHALL display a graph icon button in the explorer's lateral toolbar alongside the existing Files and TOC buttons. Clicking it toggles the `sidebarPanel` to `'graph'` (or collapses it if already active).

#### Scenario: Activating graph view
- **WHEN** the user clicks the graph button in the sidebar toolbar
- **THEN** `sidebarPanel` is set to `'graph'`, the side panel shows graph settings, and the main area renders the Cytoscape.js graph

#### Scenario: Deactivating graph view by clicking again
- **WHEN** `sidebarPanel` is already `'graph'` and the user clicks the graph button again
- **THEN** `sidebarPanel` is set to `'collapsed'` and the graph disappears

#### Scenario: Graph button is visually active when graph is open
- **WHEN** `sidebarPanel === 'graph'`
- **THEN** the graph toolbar button has the `sidebar-btn-active` CSS class applied

### Requirement: Cytoscape.js graph renders all vault notes as nodes and wikilinks as edges
The system SHALL fetch graph data from `GET /api/graph` and render nodes (notes) and edges (wikilinks) using Cytoscape.js with a force-directed layout.

#### Scenario: Graph loads on activation
- **WHEN** the graph panel is first activated
- **THEN** the component calls `GET /api/graph`, receives `{ nodes, edges }`, and renders the graph with Cytoscape.js

#### Scenario: Graph displays nodes and edges
- **WHEN** the graph data is loaded
- **THEN** each note appears as a labeled node and each wikilink between notes appears as a directed edge

#### Scenario: Graph shows loading state
- **WHEN** the API call is in flight
- **THEN** a loading indicator is displayed over the graph area

### Requirement: Clicking a node opens the note in the editor
The system SHALL navigate to `/explorer/<note-path>` when the user clicks a graph node, opening that note in the markdown editor.

#### Scenario: Click navigates to the note
- **WHEN** the user clicks a node in the graph
- **THEN** the router navigates to `/explorer/<node-path>` and the editor loads that note

#### Scenario: Active note node is highlighted
- **WHEN** a note is currently open in the editor
- **THEN** its corresponding graph node has a distinct visual style (e.g., highlighted border or color)

### Requirement: Node collapse/expand
The system SHALL allow the user to collapse a node, hiding all its directly connected neighbours that have no other visible connections, by double-clicking it. Double-clicking again re-expands them.

#### Scenario: Double-click collapses a node's neighbours
- **WHEN** the user double-clicks a node
- **THEN** all neighbour nodes that are exclusively connected to that node are hidden (display: none in Cytoscape)

#### Scenario: Double-click on collapsed node expands it
- **WHEN** the user double-clicks a previously collapsed node
- **THEN** its hidden neighbours become visible again

### Requirement: Graph settings panel replaces the file tree when graph is active
The system SHALL replace the `p-tree` file browser with a graph settings panel in the side panel area when `sidebarPanel === 'graph'`.

#### Scenario: Settings panel is shown instead of file tree
- **WHEN** `sidebarPanel === 'graph'`
- **THEN** the side panel displays the graph settings panel and the `p-tree` is not rendered

#### Scenario: File tree is restored when graph is closed
- **WHEN** `sidebarPanel` changes from `'graph'` to `'files'`
- **THEN** the `p-tree` is displayed and the settings panel is not rendered

### Requirement: Graph settings — filter input
The system SHALL provide a text input in the settings panel. Typing in it filters the graph to show only nodes whose title contains the filter text (case-insensitive); edges connecting hidden nodes are also hidden.

#### Scenario: Filtering nodes by text
- **WHEN** the user types `"quantum"` in the filter input
- **THEN** only nodes whose title contains `"quantum"` (case-insensitive) remain visible along with their connecting edges

#### Scenario: Clearing filter restores all nodes
- **WHEN** the user clears the filter input
- **THEN** all nodes and edges (subject to other settings) become visible again

### Requirement: Graph settings — orphan nodes checkbox
The system SHALL provide a checkbox "Show orphans" in the settings panel. When unchecked, nodes with no edges (neither incoming nor outgoing) are hidden from the graph.

#### Scenario: Hiding orphan nodes
- **WHEN** the user unchecks "Show orphans"
- **THEN** all nodes with degree 0 are hidden from the graph

#### Scenario: Showing orphan nodes
- **WHEN** the user checks "Show orphans"
- **THEN** nodes with degree 0 are visible again (subject to the text filter)

### Requirement: Graph settings — physics sliders
The system SHALL provide six range sliders in the settings panel that dynamically adjust the Cytoscape.js layout parameters in real time: **Node size**, **Line thickness**, **Center force**, **Repel force**, **Link force**, and **Link distance**.

#### Scenario: Node size slider changes node radius
- **WHEN** the user moves the Node size slider
- **THEN** all node sizes update immediately to the new value without reloading the graph

#### Scenario: Line thickness slider changes edge width
- **WHEN** the user moves the Line thickness slider
- **THEN** all edge widths update immediately to the new value

#### Scenario: Physics sliders trigger layout re-run
- **WHEN** the user moves Center force, Repel force, Link force, or Link distance sliders
- **THEN** the force-directed layout re-runs with the new parameters and nodes animate to new positions
