## ADDED Requirements

### Requirement: Responsive file-versions modal width
The file-versions modal SHALL size itself to fit the viewport rather than using a fixed width that exceeds narrow screens. On mobile-width viewports the modal SHALL NOT overflow horizontally beyond the viewport, and its footer actions (cancel, restore) SHALL remain reachable.

#### Scenario: Modal fits a mobile viewport
- **WHEN** the file-versions modal opens on a mobile-width viewport
- **THEN** the modal SHALL fit within the viewport width without horizontal overflow

#### Scenario: Footer actions reachable on mobile
- **WHEN** the file-versions modal is shown on a mobile-width viewport
- **THEN** the cancel and restore actions SHALL remain visible and tappable

### Requirement: Adaptive versions list/preview layout
The file-versions modal SHALL present the versions list and the version preview side-by-side on desktop-width viewports and stacked vertically on mobile-width viewports, so both the list and the preview remain usable at any width.

#### Scenario: Desktop side-by-side layout
- **WHEN** the file-versions modal is shown on a desktop-width viewport
- **THEN** the versions list and the version preview SHALL be displayed side-by-side

#### Scenario: Mobile stacked layout
- **WHEN** the file-versions modal is shown on a mobile-width viewport
- **THEN** the versions list and the version preview SHALL be stacked vertically, each with usable height, without horizontal overflow

#### Scenario: Preview diff remains readable
- **WHEN** a version is selected and its diff preview is shown on a mobile-width viewport
- **THEN** the diff preview SHALL remain readable, containing any long-line overflow within its own scrollable area rather than overflowing the modal or the page
