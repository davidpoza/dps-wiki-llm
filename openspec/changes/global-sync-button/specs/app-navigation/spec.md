## ADDED Requirements

### Requirement: Global sync action in the navigation bar

The navigation bar SHALL present a persistent sync **action** control, rendered as an icon in the top-right region of the bar, on every authenticated page. This control is an action, not a navigation destination: it does not change the set of navigation destinations and does not participate in active-route highlighting.

#### Scenario: Sync action present on every authenticated page

- **WHEN** an authenticated user views any authenticated page
- **THEN** the navigation bar SHALL show the sync action icon in its top-right region, in addition to the existing navigation destinations

#### Scenario: Sync action does not alter the destination set

- **WHEN** the navigation destinations are enumerated
- **THEN** the destination set SHALL remain exactly jobs, ingest, chat, review, changes, explorer, settings
- **AND** the sync action SHALL NOT be counted as a destination nor be shown as an active route

#### Scenario: Sync action triggers a global sync

- **WHEN** the user activates the sync action icon in the navigation bar
- **THEN** the system SHALL start a global sync as defined by the global-sync-control capability
