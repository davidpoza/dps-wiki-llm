## 1. Shared wiki-link resolution

- [x] 1.1 Extract the slug index + `resolveSlug` logic out of `GraphService` into a reusable component (e.g. `WikiLinkResolver`): build the vault slug index (full-path stem + basename, lowercased) and resolve a raw `[[wiki-link]]` (case-insensitive, full path or basename, ignoring `|alias`) to a target relative path.
- [x] 1.2 Refactor `GraphService.buildGraph` to use the extracted resolver, keeping the `/api/graph` output identical (verify existing `graph-data-api` behavior/tests still pass).
- [x] 1.3 Add a method to expose the vault as a walkable adjacency map (undirected, deduped) built from resolved edges, for reuse by PPR.

## 2. Backend: robust existing-link exclusion

- [x] 2.1 Add a helper that, given the open note's content, extracts every `[[wiki-link]]` and resolves each to its target path via `WikiLinkResolver`, returning the set of already-linked target paths.
- [x] 2.2 Apply that exclusion set in `LinkDiscoveryService.discover` (semantic path) so results drop already-linked targets on the backend before returning.
- [x] 2.3 Ensure the same exclusion is applied in the new graph path (see task 4), so both modes exclude already-linked targets.
- [x] 2.4 Reduce the frontend filter in `openLinkDiscovery()` to a lightweight secondary guard (authoritative exclusion now lives in the backend).

## 3. Backend: Monte Carlo Personalized PageRank

- [x] 3.1 Implement a `MonteCarloPpr` component: given an adjacency map, a weighted seed set, walk count K, walk length L, and restart probability, run seeded random walks (restart-to-seed on teleport and on dead ends) and return nodes ranked by visit frequency.
- [x] 3.2 Inject a seedable `Random` (or seed parameter) so ranking is deterministic under test.
- [x] 3.3 Expose PPR parameters (K ≈ 3000, L ≈ 50, restart probability) as constants or app settings for tuning.
- [x] 3.4 Unit-test PPR on a small hand-built graph with a fixed seed: multi-hop node surfaces, ranking follows visit frequency, dead-end walks restart at a seed.

## 4. Backend: graph-retrieval cascade service

- [x] 4.1 Create `GraphLinkDiscoveryService.discover(path, onProgress)` returning `List<DiscoveredLink>` (same record as the semantic path).
- [x] 4.2 Stage 1 — lex fast path: build seeds by token-overlap of the note's title + `keywords` (+ frontmatter `aliases` if present) against note titles/aliases; emit `lex` progress.
- [x] 4.3 Stage 2 — local substring scan: broaden seeds by matching the same terms as substrings against titles, aliases, and body snippets; emit `substring` progress; weight lex seeds above substring seeds.
- [x] 4.4 Stage 3 — PPR expansion: if the seed set is non-empty, run `MonteCarloPpr` over the adjacency (task 1.3) seeded from stages 1–2; emit `ppr` progress. Rank results by PPR visit frequency.
- [x] 4.5 Implement cascade truncation (skip/cap PPR when lexical stages already yield a sufficient set) and empty-seed short-circuit (no seeds ⇒ empty results).
- [x] 4.6 Exclude the source note and already-linked target paths from the final results (task 2.1 set); map survivors to `DiscoveredLink`.
- [x] 4.7 Unit-test seeding (lex/substring), truncation, empty-seed behavior, and that already-linked targets are excluded.

## 5. API: mode parameter

- [x] 5.1 Add an optional `mode` (`semantic`|`graph`, default/unknown → `semantic`) parameter to `GET /api/jobs/link-discovery-stream` in `JobController`.
- [x] 5.2 Dispatch to `LinkDiscoveryService` or `GraphLinkDiscoveryService` based on `mode`, streaming the same `progress`/`done`/`error` SSE events.
- [x] 5.3 Verify `mode=graph` streams graph cascade progress steps and results; absent/unknown `mode` preserves current semantic behavior.

## 6. Frontend: Semantic / Graph toggle

- [x] 6.1 Add a `mode` argument to `ApiService.discoverLinks(path, mode)` and append it to the stream URL.
- [x] 6.2 Add a `linkDiscoveryMode` signal and a PrimeNG `SelectButton` (Semantic default / Graph) at the top of the Link Discovery modal.
- [x] 6.3 Re-run discovery with the selected mode on open and whenever the toggle changes; keep results rendering, checkboxes, `Add to Related`, and the secondary existing-link guard unchanged.
- [x] 6.4 Map the graph progress steps (`lex`, `substring`, `ppr`) to labels; add transloco keys for the toggle and steps (all locales).

## 7. Verification

- [x] 7.1 Backend: `mvn -pl backend compile` and run the new/updated unit tests (resolver, exclusion, PPR, cascade).
- [x] 7.2 Frontend: build/lint the Angular app; confirm the toggle renders and Graph mode returns and adds links end to end.
- [x] 7.3 Manual check against the two motivating cases: an already-linked note written with different case/full-path/alias no longer appears; a genuine multi-hop neighbor surfaces only in Graph mode.
