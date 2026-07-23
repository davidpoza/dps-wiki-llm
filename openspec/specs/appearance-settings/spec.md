# appearance-settings Specification

## Purpose
TBD - created by archiving change unify-nav-mobile-polish. Update Purpose after archive.
## Requirements
### Requirement: Theme selection lives in Settings

The Settings screen SHALL provide an explicit control to choose the light or dark theme. This control replaces the top-bar theme toggle.

#### Scenario: Theme control present in Settings

- **WHEN** the user opens the Settings screen
- **THEN** an appearance/theme control is shown that allows choosing light or dark

#### Scenario: Control reflects the current theme

- **WHEN** the Settings screen loads while the dark theme is active
- **THEN** the theme control shows "dark" as the current selection

### Requirement: Changing the theme applies immediately and persists

Selecting a theme in Settings SHALL apply it to the app immediately and persist the choice across sessions.

#### Scenario: Switching theme takes effect at once

- **WHEN** the user selects the dark theme in Settings while the light theme is active
- **THEN** the app switches to the dark theme without a reload

#### Scenario: Choice persists across reloads

- **WHEN** the user selects a theme in Settings and later reloads the app
- **THEN** the app starts with the previously selected theme

