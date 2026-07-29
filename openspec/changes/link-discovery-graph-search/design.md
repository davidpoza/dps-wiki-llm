## Context

Link Discovery is a modal in `explorer.component.ts` that streams suggested links for the open note over SSE (`GET /api/jobs/link-discovery-stream`). The backend `LinkDiscoveryService.discover` builds a query from the note's title + `keywords` frontmatter, runs `SemanticSearchService.search` (embedding + pgvector cosine), and re-ranks with `CslsRanker`. Results are `DiscoveredLink(path, title, docType, score)` records.

Two independent assets already exist that this change leans on:

- **The wiki-link graph.** `GraphService.buildGraph()` walks `wiki/**/*.md`, builds a slug index (`buildSlugIndex`: full-path-stem and basename, lowercased), resolves every `[[wiki-link]]` via `resolveSlug` (case-insensitive, full path or basename, alias-aware — it splits on `|`), and emits deduped undirected edges. This is exactly the resolution logic the fragile frontend filter lacks, and exactly the adjacency PPR needs.
- **The existing-link filter.** Today `openLinkDiscovery()` (`explorer.component.ts:2808`) extracts `[[...]]` slugs from `currentMarkdown` and drops results whose `slugFromPath(l.path)` (basename, no `.md`, case-sensitive) is present. It misses case variants, full-path links, and aliases.

The separate in-flight `improve-link-discovery-ranking` change owns the CSLS/semantic ranking layer; this change must not touch it.

## Goals / Non-Goals

**Goals:**
- Exclude already-linked notes reliably, on the backend, based on resolved target paths, for both retrieval modes.
- Add a Graph retrieval mode selectable via a Semantic/Graph toggle, defaulting to Semantic (zero behavior change unless opted in).
- Implement a lean, LLM-free cascade: lex fast path → local substring scan → Monte Carlo Personalized PageRank over the wiki-link graph, with early truncation.
- Keep the graph result shape identical to semantic results so the modal's checkbox/add-to-Related UI is reused unchanged.

**Non-Goals:**
- The two LLM stages of the Karpathy design (LLM keyword generation, LLM KB fallback) — deferred to a later change.
- Changing the `/api/graph` contract, the embedding/semantic path, or the CSLS ranker.
- Persisting or caching the graph / PPR results across requests (in-memory per request for now).
- Any DB migration — PPR runs in memory over the graph; no new persisted state.

## Decisions

### Decision 1: Extract slug resolution into a shared resolver, reuse it for exclusion and adjacency
`GraphService.buildSlugIndex`/`resolveSlug` are private. Extract them into a reusable component (e.g. `WikiLinkResolver` or a package-visible helper) that both `GraphService` and the new graph-discovery service use. Existing-link exclusion then becomes: read the open note, extract its `[[wiki-links]]`, resolve each to a target path via the resolver, and drop those paths from results — for both modes, on the backend, before streaming `done`.

- **Alternatives considered:** (a) Keep the fix in the frontend but make it robust — rejected: it would duplicate the vault's slug index in TypeScript and drift from backend resolution. (b) Re-implement resolution inside `LinkDiscoveryService` — rejected: two copies of the same logic diverge. The frontend keeps its current filter as a cheap secondary guard only.

### Decision 2: New `GraphLinkDiscoveryService` for the cascade; controller dispatches on `mode`
Keep `LinkDiscoveryService` as the semantic path untouched. Add a `GraphLinkDiscoveryService.discover(path, onProgress)` that returns the same `List<DiscoveredLink>`. The controller reads `mode` and calls one or the other. Progress steps for graph mode are `lex`, `substring`, `ppr`, `done` (the frontend maps them to labels like it maps `loading`/`searching`/`done` today).

- **Alternatives considered:** a single service with a `mode` branch — rejected: the two retrieval strategies share almost no logic and mixing them bloats one class. Reusing `DiscoveredLink` keeps the SSE payload and frontend rendering identical.

### Decision 3: Monte Carlo PPR (Fogaras 2005) over an undirected adjacency built from resolved edges
Build the adjacency from `GraphService`'s resolved, deduped edge set, treated as **undirected** (walkable both ways). Run K random walks (≈3000) of length L (≈50) starting from seed nodes; at each step, with restart probability `1 − c` (Haveliwala 2002 teleport) or on a dead-end node, jump back to a seed; count node visits; rank candidates by visit frequency. Cost is `O(K·L)`, independent of vault size.

- **Why Monte Carlo over power iteration:** no sparse-matrix infrastructure, bounded and vault-size-independent latency, and it matches the referenced literature. Determinism for tests comes from a seedable `Random`.
- **Why undirected:** the existing edge model is already deduped/undirected, and link discovery cares about relatedness, not citation direction. Trade-off: undirected walks can drift toward hub notes — mitigated by restart-to-seed (personalization) which keeps mass near the source's neighborhood.
- **Personalization vector:** the seed set from stages 1–2, weighted (lex matches > substring matches). Walks start and restart proportional to seed weight.

### Decision 4: Lean cascade with early truncation and empty-seed short-circuit
Stage 1 (lex fast path) and Stage 2 (substring scan) build the seed set locally from the note's title, `keywords`, and any frontmatter `aliases`. Stage 3 (PPR) runs only if the seed set is non-empty. The cascade truncates: if lexical stages already yield a strong, sufficient candidate set, PPR expansion may be skipped or capped. Empty seed set ⇒ empty result ⇒ modal shows its existing "no results" state. The source note and already-linked targets are excluded from final results (they may still act as walk intermediaries).

- **Alternatives considered:** always run all stages — rejected: wasted work and the proposal's truncation requirement. Thresholds for "enough signal" start as simple seed-count heuristics, exposed as constants/settings for tuning during `apply`.

### Decision 5: Frontend toggle re-runs discovery; results reuse existing plumbing
Add a `linkDiscoveryMode` signal bound to a PrimeNG `SelectButton` (Semantic/Graph) at the top of the modal. Changing it (or opening the modal) calls `api.discoverLinks(path, mode)`. `ApiService.discoverLinks` gains a `mode` argument appended to the stream URL. Results land in the existing `linkDiscoveryResults` signal and render through the current checkbox list, `Add to Related`, and secondary existing-link guard. New transloco keys for the toggle labels and graph progress steps.

## Risks / Trade-offs

- **Graph rebuild cost per discovery** (reads every `wiki/**/*.md`, same as `/api/graph`) → Mitigation: acceptable at current vault size; graph build is already used interactively. Caching is a documented future improvement, out of scope here.
- **PPR non-determinism** breaking tests → Mitigation: inject a seedable `Random`; unit tests assert ranking with a fixed seed and a small hand-built graph.
- **Undirected walks over-weighting hub notes** → Mitigation: restart-to-seed personalization keeps probability mass near the source; hub over-surfacing on the semantic side is separately handled by CSLS.
- **Notes without a `keywords`/`aliases` frontmatter** → Mitigation: lex/substring degrade to the title alone; PPR still runs from whatever seeds exist; no seeds ⇒ graceful empty result.
- **Isolated notes** (no incoming/outgoing links) → PPR yields little beyond seeds; that is the correct, honest result — the modal shows the lexical seeds or "no results".

## Migration Plan

Additive and backward compatible. The `mode` parameter defaults to `semantic`; existing callers and the default modal path are unchanged. No DB migration. Rollout: ship backend service + `mode` param, then the frontend toggle. Rollback: hide the toggle / ignore `mode` — the semantic path is untouched and remains the default.

## Open Questions

- Final PPR parameters (walk count, walk length, restart probability `1 − c`) and the "enough signal" truncation threshold — start from the Karpathy defaults (~3000 × 50) and tune during `apply`.
- Whether frontmatter `aliases` exist in this vault's notes; if absent, lex/substring simply use title + `keywords` (verify during implementation).
- Whether to weight PPR results by combining PPR frequency with lexical seed strength, or rank purely by PPR frequency (spec requires the latter as the baseline).
