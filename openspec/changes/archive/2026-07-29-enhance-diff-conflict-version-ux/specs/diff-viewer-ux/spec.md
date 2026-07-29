## ADDED Requirements

### Requirement: Diff viewer fits mobile viewports
The unified diff viewer in the changes screen SHALL render inside its entry card without causing page-level horizontal overflow on mobile-width viewports. Long diff lines SHALL be handled within the diff container (via wrapping or container-scoped horizontal scrolling) so the surrounding page layout does not exceed the viewport width.

#### Scenario: Long diff line does not overflow the page
- **WHEN** a diff containing lines wider than the viewport is expanded on a mobile-width viewport
- **THEN** the page SHALL NOT overflow horizontally, and any overflow SHALL be contained within the diff viewer's own scrollable/wrapping area

#### Scenario: Diff toggles within the card
- **WHEN** the user toggles a diff open on a mobile-width viewport
- **THEN** the diff content SHALL appear within its entry card without displacing or clipping the card's other controls

### Requirement: Legible diff line categorization
The diff viewer SHALL visually distinguish added lines, removed lines, hunk headers, and metadata lines from context lines, using coloring that remains legible against the diff surface.

#### Scenario: Added and removed lines are distinguishable
- **WHEN** a diff contains both added (`+`) and removed (`-`) lines
- **THEN** added lines and removed lines SHALL be shown with distinct, legible emphasis that differs from unchanged context lines

#### Scenario: Hunk and metadata lines are distinguished
- **WHEN** a diff contains hunk headers (`@@`) or file metadata lines (`diff `, `index `, `---`, `+++`)
- **THEN** those lines SHALL be styled distinctly from added, removed, and context lines
