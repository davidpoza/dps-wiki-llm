## ADDED Requirements

### Requirement: Delete button visible to authenticated users
The editor toolbar SHALL display a Delete button only when the user is authenticated.

#### Scenario: Authenticated user sees delete button
- **WHEN** an authenticated user opens the document editor
- **THEN** a Delete button SHALL be visible in the topbar action area

#### Scenario: Unauthenticated user does not see delete button
- **WHEN** an unauthenticated user opens the document editor
- **THEN** no Delete button SHALL be present in the topbar

### Requirement: Confirmation dialog before deletion
Clicking the Delete button SHALL open a confirmation dialog that names the file before any deletion occurs.

#### Scenario: Confirmation dialog shows file name
- **WHEN** the user clicks the Delete button
- **THEN** a confirmation dialog SHALL appear displaying the name of the current file
- **AND** the dialog SHALL offer Accept and Reject actions

#### Scenario: User cancels deletion
- **WHEN** the confirmation dialog is open and the user clicks the Reject/Cancel action
- **THEN** the dialog SHALL close
- **AND** the file SHALL NOT be deleted
- **AND** the user SHALL remain on the editor page

### Requirement: File deleted on confirmation
On acceptance of the confirmation dialog the system SHALL delete the current file and navigate away.

#### Scenario: Successful deletion navigates home
- **WHEN** the user confirms deletion in the dialog
- **THEN** the system SHALL call the delete file API for the current file path
- **AND** on success the user SHALL be navigated to the home/explorer route

#### Scenario: Deletion failure shows error toast
- **WHEN** the user confirms deletion but the API call fails
- **THEN** the dialog SHALL close
- **AND** an error toast SHALL be displayed informing the user the deletion failed
- **AND** the user SHALL remain on the editor page
