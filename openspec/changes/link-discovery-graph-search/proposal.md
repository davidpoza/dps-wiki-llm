## Why

Link Discovery today has two gaps. First, its "hide links the note already contains" filter runs in the frontend with a fragile match — it compares the raw `[[slug]]` string against a bare, case-sensitive filename stem (`slugFromPath`), so an already-linked note surfaces again as a duplicate suggestion whenever the existing link uses a different case (`[[Krebs-Cycle]]`), a full path (`[[wiki/concepts/krebs-cycle]]`), or an alias (`[[krebs-cycle|the citric-acid cycle]]`). Second, discovery is purely embedding-based: it never uses the `[[wiki-link]]` graph the user already maintains, so genuinely related multi-hop neighbors (e.g. `insulin` → `pancreas` → `glucagon`) that no single embedding query surfaces are never proposed.

The vault already stores everything needed to fix both: `GraphService` resolves every `[[wiki-link]]` into a node/edge graph, and its `resolveSlug` already does the case-insensitive, path- and alias-aware resolution the frontend filter lacks.

## What Changes

- **Make existing-link exclusion robust and authoritative.** Resolve every `[[wiki-link]]` in the open note to its target path using the vault's slug index (case-insensitive, full-path, basename, and alias aware), and exclude those target paths from Link Discovery results on the backend, before results are returned. This applies to **both** retrieval modes. The frontend keeps a lightweight secondary guard but is no longer the source of truth.
- **Add a graph-based retrieval mode to the Link Discovery modal**, selectable via a Semantic / Graph toggle. Semantic (the existing embedding + CSLS path) stays the default, so behavior is unchanged unless the user opts in.
- **Implement a lean seed-selection cascade for graph mode**, modeled on the Karpathy LLM-Wiki plugin but without LLM calls in this change:
  1. **Lex fast path** — token-overlap of the source note's title/keywords against every note title and alias.
  2. **Local substring scan** — the same terms re-matched against titles, aliases, and body snippets, to round out noise-tolerant recall.
  3. **Personalized PageRank (PPR) expansion** — Monte Carlo PPR (Fogaras 2005 random walks with the Haveliwala 2002 dead-end/restart rule) over the `[[wiki-link]]` graph, seeded from stages 1–2, to surface graph-aware multi-hop neighbors.
  The cascade truncates at the first stage that returns enough signal; PPR runs only when a non-empty seed set exists.
- The two LLM stages of the full Karpathy design (LLM keyword generation, LLM KB fallback) are **explicitly deferred** to a later change.
- **Expose the mode through the API**: `/api/jobs/link-discovery-stream` gains an optional `mode=semantic|graph` parameter defaulting to `semantic`.

## Capabilities

### New Capabilities
- `link-discovery-graph-search`: A graph-based retrieval mode for Link Discovery. Covers the Semantic/Graph mode toggle, the lex → substring → Monte Carlo PPR cascade with early truncation over the `[[wiki-link]]` graph, seeding and scoring, the empty-seed/empty-result behavior, and the `mode` API parameter.

### Modified Capabilities
- `link-discovery-filter-existing`: The exclusion of already-present links must be based on **resolved target paths** (case-insensitive, path/basename/alias aware) rather than raw basename string equality, must be enforced authoritatively on the backend before results are returned, and must apply to both the semantic and graph retrieval modes.

## Impact

- **Backend services**: new graph-retrieval service implementing the lex fast-path, local substring scan, and Monte Carlo PPR over an adjacency view extracted from `GraphService`; existing-link exclusion helper that resolves the note's wikilinks to target paths via the shared slug index; `LinkDiscoveryService.discover` (or the controller) gains a `mode` branch.
- **API**: `GET /api/jobs/link-discovery-stream` accepts `mode=semantic|graph` (default `semantic`, backward compatible); the SSE `progress` steps for graph mode reflect the cascade stages (lex, substring, ppr).
- **Frontend**: Link Discovery modal in `explorer.component.ts` gains a Semantic/Graph `SelectButton` toggle, `ApiService.discoverLinks(path, mode)`, a graph result list reusing the existing checkbox/add-to-Related flow, and new transloco keys.
- **Config**: PPR parameters (walk count ≈ 3000, walk length ≈ 50, restart probability) and lex/substring thresholds as constants or app settings.
- **Tests**: unit tests for deterministic (seeded) Monte Carlo PPR ranking, lex/substring seeding, cascade truncation, and target-path-based exclusion covering the case/full-path/alias cases.
- **Not touched**: embedding generation and stored vectors, the CSLS ranking layer (`improve-link-discovery-ranking`), `GraphService`'s `/api/graph` contract, and the default semantic discovery behavior.
