## ADDED Requirements

### Requirement: Responsive manual merge editor layout
The manual conflict merge editor SHALL adapt its layout to the viewport width. On desktop-width viewports it SHALL keep the local and remote source panes side-by-side above an editable result pane. On mobile-width viewports it SHALL present the two source panes stacked or as switchable tabs so each source pane and the result pane remain individually usable, and the dialog SHALL NOT overflow horizontally beyond the viewport.

#### Scenario: Desktop side-by-side layout
- **WHEN** the merge editor opens on a desktop-width viewport
- **THEN** the local and remote source panes SHALL be shown side-by-side above the editable result pane

#### Scenario: Mobile stacked/tabbed layout
- **WHEN** the merge editor opens on a mobile-width viewport
- **THEN** the local and remote source panes SHALL be stacked vertically or presented as switchable tabs, and the editor SHALL NOT overflow horizontally beyond the viewport

#### Scenario: Result pane remains usable on mobile
- **WHEN** the merge editor is shown on a mobile-width viewport
- **THEN** the editable result pane SHALL retain a usable height and its action buttons (take local, take remote, resolve, cancel) SHALL remain reachable without horizontal clipping

### Requirement: Internationalized result pane labels
The merge editor SHALL source all user-visible text, including the result-pane heading and the result-pane placeholder, from the translation catalog rather than hardcoded literals, so the editor renders in the active language.

#### Scenario: Result pane heading is translated
- **WHEN** the merge editor renders with a selected language
- **THEN** the result-pane heading SHALL come from a translation key (not a hardcoded literal) and display the text for the active language

#### Scenario: Result pane placeholder is translated
- **WHEN** the result pane is empty
- **THEN** its placeholder text SHALL come from a translation key and display the text for the active language

### Requirement: Legible changed-line highlighting
The merge editor SHALL visually distinguish changed lines from unchanged lines in the local and remote source panes, using emphasis that remains legible on both light and dark application surfaces.

#### Scenario: Changed lines are emphasized
- **WHEN** a source line differs between the local and remote content at the same position
- **THEN** that line SHALL be visually emphasized in the affected source pane

#### Scenario: Highlighting is legible on the active theme
- **WHEN** the merge editor is viewed under either the light or the dark application surface
- **THEN** the changed-line emphasis and the source text SHALL retain sufficient contrast to remain readable
