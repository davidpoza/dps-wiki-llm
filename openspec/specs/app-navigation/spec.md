# app-navigation Specification

## Purpose
TBD - created by archiving change unify-nav-mobile-polish. Update Purpose after archive.
## Requirements
### Requirement: Unified navigation menu

The app SHALL present a single navigation menu, shared across all authenticated pages, whose destinations are exactly: jobs, ingest, chat, review, changes, explorer, settings. The menu SHALL replace the previous dual arrangement of a top action bar plus a separate tab strip.

#### Scenario: Menu lists all destinations

- **WHEN** an authenticated user views any authenticated page
- **THEN** the navigation menu shows exactly seven destinations in order: jobs, ingest, chat, review, changes, explorer, settings
- **AND** no other navigation destinations are shown in the menu

#### Scenario: Menu is consistent across pages

- **WHEN** the user navigates from the home tabs to Explorer, Settings, or Profile
- **THEN** the same unified navigation menu is present with the same destinations

### Requirement: Active destination reflects current route

The navigation menu SHALL derive the highlighted (active) destination from the current route so the user always sees where they are.

#### Scenario: Active item matches route

- **WHEN** the current route is `/chat`
- **THEN** the "chat" destination is shown as active
- **AND** the other destinations are shown as inactive

#### Scenario: Changes destination maps to git history

- **WHEN** the current route is `/git`
- **THEN** the "changes" destination is shown as active

### Requirement: Selecting a destination navigates

Selecting a destination in the navigation menu SHALL navigate to that destination's route.

#### Scenario: Navigate to a destination

- **WHEN** the user selects the "explorer" destination
- **THEN** the app navigates to `/explorer`
- **AND** the "explorer" destination becomes active

### Requirement: Mobile hamburger menu

On mobile viewports the navigation menu SHALL collapse into a hamburger control; activating it SHALL reveal the destinations, and choosing one SHALL navigate and dismiss the expanded menu.

#### Scenario: Menu collapses on small viewports

- **WHEN** the viewport width is at or below the mobile breakpoint
- **THEN** the destinations are hidden behind a hamburger control instead of rendered inline

#### Scenario: Opening and choosing on mobile

- **WHEN** the user activates the hamburger control and selects a destination
- **THEN** the app navigates to that destination
- **AND** the expanded menu is dismissed

#### Scenario: Inline on desktop

- **WHEN** the viewport width is above the mobile breakpoint
- **THEN** the destinations render inline without a hamburger control

### Requirement: Logout is not part of the navigation menu

The navigation menu SHALL NOT contain a logout control. Logging out SHALL remain available from the Profile screen only.

#### Scenario: No logout in the menu

- **WHEN** the user opens the navigation menu on any page and at any viewport size
- **THEN** no "sign out" / "cerrar sesión" control is present in the menu

#### Scenario: Logout still available in Profile

- **WHEN** the user opens the Profile screen
- **THEN** a logout control is available there

### Requirement: Theme toggle is not part of the navigation menu

The navigation menu and page top bars SHALL NOT contain a light/dark theme toggle control.

#### Scenario: No theme toggle in top bars

- **WHEN** the user views any authenticated page
- **THEN** no light/dark toggle button is present in the navigation menu or page top bar

