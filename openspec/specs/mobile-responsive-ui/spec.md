# mobile-responsive-ui Specification

## Purpose
TBD - created by archiving change unify-nav-mobile-polish. Update Purpose after archive.
## Requirements
### Requirement: Change-history pagination is usable on mobile

The change-history (changes) screen SHALL display its paginator so it is fully visible and operable on mobile viewports whenever more than one page of results exists.

#### Scenario: Paginator visible on mobile

- **WHEN** the change-history screen has more results than fit on a single page and is viewed on a mobile viewport
- **THEN** the paginator is visible and its controls are reachable without horizontal clipping

#### Scenario: Paging works on mobile

- **WHEN** the user activates the next-page control of the paginator on a mobile viewport
- **THEN** the next page of change-history entries is loaded and shown

### Requirement: Authenticated screens are usable on mobile

Each authenticated screen (jobs, ingest, chat, review, changes, explorer, settings, profile) SHALL be usable on a mobile viewport without horizontal overflow of the page and with interactive controls remaining reachable.

#### Scenario: No horizontal page overflow

- **WHEN** any authenticated screen is viewed at a mobile viewport width
- **THEN** the page content does not overflow horizontally beyond the viewport

#### Scenario: Primary actions reachable

- **WHEN** an authenticated screen is viewed at a mobile viewport width
- **THEN** the screen's primary actions and navigation remain visible and tappable

