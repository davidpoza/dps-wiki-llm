## ADDED Requirements

### Requirement: Delete file endpoint
The backend SHALL expose `DELETE /files/content?path=<path>` to permanently delete a file from the wiki directory.

#### Scenario: Successful delete
- **WHEN** a valid, existing file path within the wiki root is provided
- **THEN** the file is deleted and the server responds with `200 OK`

#### Scenario: File not found
- **WHEN** the path does not correspond to an existing file
- **THEN** the server responds with `404 Not Found`

#### Scenario: Path traversal attempt
- **WHEN** the path resolves to a location outside the wiki root directory
- **THEN** the server responds with `400 Bad Request` and no file is deleted

---

### Requirement: Rename file endpoint
The backend SHALL expose `POST /files/rename?path=<currentPath>&newName=<newFilename>` to rename a file within its current directory.

#### Scenario: Successful rename
- **WHEN** a valid existing file path and a valid new filename (no path separators) are provided
- **THEN** the file is renamed to the new name in the same directory and the server responds with `200 OK`

#### Scenario: Name collision
- **WHEN** a file with `newName` already exists in the same directory
- **THEN** the server responds with `409 Conflict` and no rename is performed

#### Scenario: Invalid new name (contains path separator)
- **WHEN** `newName` contains `/` or `\`
- **THEN** the server responds with `400 Bad Request`

#### Scenario: Source file not found
- **WHEN** the `path` does not correspond to an existing file
- **THEN** the server responds with `404 Not Found`

#### Scenario: Path traversal attempt
- **WHEN** either `path` or the resolved new path falls outside the wiki root
- **THEN** the server responds with `400 Bad Request`

---

### Requirement: Create file endpoint
The backend SHALL expose `POST /files/content?path=<path>` to create a new empty file at the given path within the wiki directory.

#### Scenario: Successful creation
- **WHEN** a valid path within the wiki root is provided and no file exists there
- **THEN** an empty file is created and the server responds with `201 Created`

#### Scenario: File already exists
- **WHEN** a file already exists at the given path
- **THEN** the server responds with `409 Conflict` and no file is created

#### Scenario: Parent directory does not exist
- **WHEN** the parent directory of the path does not exist
- **THEN** the server responds with `400 Bad Request`

#### Scenario: Path traversal attempt
- **WHEN** the path resolves to a location outside the wiki root directory
- **THEN** the server responds with `400 Bad Request`
