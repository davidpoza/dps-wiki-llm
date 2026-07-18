## ADDED Requirements

### Requirement: Root path redirects to default tab
The system SHALL redirect the root path `/` to `/jobs` automatically.

#### Scenario: Navigating to / redirects to /jobs
- **WHEN** the user navigates to `/`
- **THEN** the browser URL changes to `/jobs` and the Jobs tab is displayed

### Requirement: Each tab has its own URL
The system SHALL expose a dedicated route for each tab: `/jobs`, `/ingest`, `/chat`, `/review`, `/git`, all protected by `authGuard`.

#### Scenario: Navigating directly to a tab URL opens that tab
- **WHEN** the user navigates directly to `/chat`
- **THEN** the home screen loads with the Chat tab active

#### Scenario: Navigating directly to /review opens the Review tab
- **WHEN** the user navigates directly to `/review`
- **THEN** the home screen loads with the Review tab active

### Requirement: Tab switch updates the URL
The system SHALL update the browser URL when the user clicks a tab button.

#### Scenario: Clicking a tab button changes the URL
- **WHEN** the user is on `/jobs` and clicks the "Ingest" tab
- **THEN** the browser URL changes to `/ingest` without a full page reload and the Ingest tab content is displayed

### Requirement: Browser back/forward navigates between tabs
The system SHALL support browser history navigation so that the back and forward buttons move between previously visited tabs.

#### Scenario: Back button returns to the previous tab
- **WHEN** the user visits `/jobs`, then navigates to `/chat`, then presses the browser back button
- **THEN** the URL returns to `/jobs` and the Jobs tab is active

#### Scenario: Forward button advances to the next tab
- **WHEN** the user has navigated back from `/chat` to `/jobs` and presses the forward button
- **THEN** the URL advances to `/chat` and the Chat tab is active

### Requirement: Unauthenticated access redirects to login
The system SHALL redirect to `/login` when an unauthenticated user accesses any tab route.

#### Scenario: Unauthenticated user on /ingest is redirected
- **WHEN** an unauthenticated user navigates to `/ingest`
- **THEN** the user is redirected to `/login`
