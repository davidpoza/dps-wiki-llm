## ADDED Requirements

### Requirement: Chat context is expanded by following wikilinks up to a configurable depth

When link expansion is enabled, the chat context-building step SHALL, after semantic retrieval of the top-K notes, collect candidate neighbour notes by extracting and resolving `[[wikilinks]]` from the retrieved note bodies (reusing `WikiLinkResolver`) up to a configured maximum depth. Depth 0 means only the directly retrieved notes; depth 1 adds notes linked from the hits; depth N adds notes reachable in N hops. Unresolved (broken) links SHALL be skipped, and already-included notes SHALL NOT be revisited.

#### Scenario: Expansion disabled leaves retrieval unchanged
- **WHEN** link expansion is disabled in the chat configuration and a user sends a message
- **THEN** only the directly retrieved semantic hits are used as context, exactly as before

#### Scenario: Depth 1 pulls in directly linked notes
- **WHEN** expansion is enabled with `maxDepth = 1` and a retrieved hit contains `[[note-b]]` that resolves to an existing note
- **THEN** `note-b` becomes a candidate for inclusion in the context

#### Scenario: Broken and duplicate links are ignored
- **WHEN** a retrieved note links to a non-existent slug and also re-links to an already-included note
- **THEN** the broken link is skipped and the already-included note is not added twice

### Requirement: Linked candidates are ranked by query relevance and included under a budget

Candidate notes discovered via link expansion SHALL be ranked by their relevance to the user's query (cosine similarity of each candidate's embedding to the query embedding, reusing the existing embedding index) and included greedily, highest-scoring first, until the context token/character budget is reached or the configured maximum number of linked notes is met. Directly retrieved semantic hits SHALL take precedence over linked candidates when the budget is limited. The pipeline SHALL never exceed the configured budget.

#### Scenario: Only the most relevant neighbours are included
- **WHEN** expansion yields more candidate notes than the budget allows
- **THEN** candidates are included in descending relevance order and the remainder are dropped without exceeding the budget

#### Scenario: Direct hits are prioritized over linked notes
- **WHEN** the combined size of direct hits and linked candidates exceeds the budget
- **THEN** direct semantic hits are included first and linked candidates fill only the remaining budget

#### Scenario: Max linked notes cap is respected
- **WHEN** `maxLinkedNotes = 3` and 10 relevant candidates are available
- **THEN** at most 3 linked notes are added to the context
