## ADDED Requirements

### Requirement: GET /api/graph returns vault graph data
The system SHALL expose a `GET /api/graph` endpoint (JWT-protected) that scans all `.md` files in the vault, extracts `[[wikilink]]` references, and returns a JSON object with two arrays: `nodes` (one per note) and `edges` (one per resolved wikilink).

#### Scenario: Endpoint returns nodes and edges
- **WHEN** `GET /api/graph` is called
- **THEN** the response is `200 OK` with `Content-Type: application/json` and body `{ "nodes": [...], "edges": [...] }`

#### Scenario: Node structure
- **WHEN** the graph data is returned
- **THEN** each node object contains `{ "id": "<relative-path>", "label": "<note-title>" }` where `id` is the vault-relative path (e.g., `wiki/concepts/quantum.md`) and `label` is the H1 title or filename stem if no H1 exists

#### Scenario: Edge structure
- **WHEN** the graph data is returned
- **THEN** each edge object contains `{ "source": "<relative-path>", "target": "<relative-path>" }` where both paths resolve to existing notes in the vault

#### Scenario: Unresolved wikilinks are excluded
- **WHEN** a note contains `[[broken-link]]` that does not resolve to any existing note
- **THEN** no edge is created for that wikilink (broken links are silently skipped)

#### Scenario: Wikilinks with display aliases are resolved correctly
- **WHEN** a note contains `[[target|Display Text]]`
- **THEN** the edge uses `target` as the link target (ignoring the display alias)

#### Scenario: Unauthenticated request is rejected
- **WHEN** `GET /api/graph` is called without a valid JWT
- **THEN** the response is `401 Unauthorized`
