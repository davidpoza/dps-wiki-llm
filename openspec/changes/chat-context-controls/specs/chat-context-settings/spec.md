## ADDED Requirements

### Requirement: Chat context behavior is configurable and persisted

The system SHALL expose a persisted configuration governing chat retrieval and context building, stored as `AppSetting` key-value rows and read by the chat pipeline at request time (no restart required). The configuration SHALL include at least: number of semantic hits (top-K), link expansion enabled flag, maximum expansion depth, maximum number of linked notes, and the context budget (token/character limit). Each value SHALL have a sensible default matching current behavior when unset, and SHALL be validated on write (rejecting out-of-range values with 400).

#### Scenario: Defaults applied when unset
- **WHEN** no chat configuration has been saved
- **THEN** the chat pipeline uses the built-in defaults (top-K and budget equivalent to the current behavior, expansion disabled)

#### Scenario: Saved configuration takes effect on the next message
- **WHEN** an administrator changes the maximum expansion depth and saves
- **THEN** the next chat message is built using the new depth without an application restart

#### Scenario: Invalid values are rejected
- **WHEN** a configuration value outside its allowed range is submitted
- **THEN** the API responds with 400 Bad Request and the stored configuration is unchanged

### Requirement: A dedicated Settings tab configures the chat context

The Settings screen SHALL provide a dedicated "Chat" tab that loads the current chat configuration, lets the user edit each value, and saves it via the configuration API with success and error feedback consistent with the other settings sections.

#### Scenario: Chat tab loads current configuration
- **WHEN** the user opens the "Chat" tab in Settings
- **THEN** the current chat configuration values are fetched and shown in editable controls

#### Scenario: Saving configuration from the Chat tab
- **WHEN** the user edits a value and clicks save
- **THEN** the value is persisted via the configuration API and a success confirmation is shown

#### Scenario: Toggling expansion reveals its parameters
- **WHEN** the user disables link expansion in the Chat tab
- **THEN** the expansion-specific parameters (depth, max linked notes) are shown as inactive/irrelevant
