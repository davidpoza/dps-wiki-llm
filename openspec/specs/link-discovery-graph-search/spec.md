# link-discovery-graph-search Specification

## Purpose
TBD - created by archiving change link-discovery-graph-search. Update Purpose after archive.
## Requirements
### Requirement: Semantic / Graph mode toggle in the Link Discovery modal

The Link Discovery modal SHALL offer a mode toggle with two options, Semantic and Graph. Semantic SHALL be the default selection, preserving the existing embedding-based discovery behavior. Selecting Graph SHALL run the graph-based retrieval cascade against the current note.

#### Scenario: Semantic is the default mode

- **WHEN** the user opens the Link Discovery modal
- **THEN** the mode toggle shows Semantic selected
- **AND** discovery runs the existing embedding + CSLS retrieval path

#### Scenario: Switching to Graph runs graph retrieval

- **WHEN** the user selects the Graph mode in an open Link Discovery modal
- **THEN** the modal runs graph-based retrieval for the current note
- **AND** the results shown are those produced by the graph cascade

#### Scenario: Switching back to Semantic re-runs semantic retrieval

- **WHEN** the user has Graph results shown and selects Semantic
- **THEN** the modal runs the embedding-based retrieval again for the current note
- **AND** the results shown are those produced by the semantic path

### Requirement: Retrieval mode is selectable through the API

The `GET /api/jobs/link-discovery-stream` endpoint SHALL accept an optional `mode` parameter with values `semantic` or `graph`. When `mode` is absent or unrecognized, the endpoint SHALL default to `semantic`, preserving backward compatibility.

#### Scenario: mode=graph triggers graph retrieval

- **WHEN** the stream endpoint is called with `mode=graph`
- **THEN** the backend runs the graph cascade and streams graph results

#### Scenario: Absent mode defaults to semantic

- **WHEN** the stream endpoint is called without a `mode` parameter
- **THEN** the backend runs the existing semantic retrieval path

#### Scenario: Unrecognized mode defaults to semantic

- **WHEN** the stream endpoint is called with a `mode` value other than `semantic` or `graph`
- **THEN** the backend runs the semantic retrieval path rather than returning an error

### Requirement: Seed selection via lex fast path and local substring scan

Graph mode SHALL build a seed set of candidate notes from the source note's title and keywords using two stages: a lex fast path that matches source terms against note titles and aliases by token overlap, and a local substring scan that re-matches the same terms against note titles, aliases, and body snippets. Neither stage SHALL require an LLM call.

#### Scenario: Lex fast path seeds by token overlap

- **WHEN** graph retrieval runs for a source note whose title/keyword tokens overlap the title or alias of other notes
- **THEN** those notes are included in the seed set

#### Scenario: Substring scan broadens recall

- **WHEN** a source term does not match any title as a whole token but appears as a substring within another note's title, alias, or body snippet
- **THEN** that note is added to the seed set by the substring scan

#### Scenario: No LLM call is made

- **WHEN** graph retrieval runs
- **THEN** seed selection completes using only local lexical matching, with no call to the LLM

### Requirement: Personalized PageRank expansion over the wiki-link graph

Graph mode SHALL expand the seed set by running Monte Carlo Personalized PageRank over the `[[wiki-link]]` graph derived from the vault, using a fixed number of random walks and a fixed walk length independent of vault size, restarting each walk at a seed node on a dead end and with the configured restart probability. Candidates SHALL be ranked by their PPR visit frequency, allowing multi-hop neighbors that no seed directly links to surface.

#### Scenario: Multi-hop neighbor surfaces through the graph

- **WHEN** the source note's seeds link to note B, and note B links to note C, and C is not in the seed set
- **THEN** note C can appear in the graph results with a PPR score derived from walks that reached it

#### Scenario: Ranking reflects PPR visit frequency

- **WHEN** PPR expansion completes
- **THEN** candidates are ordered by descending PPR visit frequency

#### Scenario: Dead-end walks restart at a seed

- **WHEN** a random walk reaches a node with no outgoing edges
- **THEN** the walk restarts from a node in the seed set rather than terminating the estimate early

#### Scenario: Expansion cost is independent of vault size

- **WHEN** graph retrieval runs on a small vault and on a large vault
- **THEN** PPR uses the same fixed number of walks and walk length in both cases

### Requirement: Cascade truncation and empty-result behavior

The graph cascade SHALL truncate at the first stage that yields a sufficient candidate set, and SHALL run PPR expansion only when the seed set is non-empty. When no seeds can be found for the source note, graph mode SHALL return no results and the modal SHALL show its "no results" state rather than an error.

#### Scenario: PPR is skipped when there are no seeds

- **WHEN** neither the lex fast path nor the substring scan produces any seed for the source note
- **THEN** PPR expansion does not run
- **AND** graph mode returns an empty result set

#### Scenario: Empty results show the no-results state

- **WHEN** graph retrieval returns no candidates
- **THEN** the modal shows its "no results" message rather than an error

#### Scenario: Graph results integrate with the add-to-Related flow

- **WHEN** graph retrieval returns candidates
- **THEN** each candidate is shown with its score and a selection checkbox
- **AND** selected candidates can be added to the note's Related section using the existing add-to-Related action

