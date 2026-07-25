## 1. Domain: Extend MutationAction with sectionReplacements

- [x] 1.1 Add `sectionReplacements: Map<String, List<String>>` field to `MutationAction` record (nullable; `null` means no replacements)
- [x] 1.2 Add a static factory method `MutationAction.merge(...)` wrapping the old 6-arg constructor (passing `null` for `sectionReplacements`) to ease migration of existing callsites
- [x] 1.3 Update all 6 existing `new MutationAction(...)` callsites in main code to pass `null` as the 7th arg (or switch to the new factory method): `ConceptResolutionService`, `MutationGuardrailService` (×2), `SourceNotePlanner`, `GuidedReviewService` (×2)

## 2. Service: MarkdownService replace-mode support

- [x] 2.1 Add `"Manual Links"` to `DEFAULT_SECTION_ORDER` in `MarkdownService`, positioned after `"Related"` and before `"Sources"`
- [x] 2.2 Add overload `mergeAndRender(existingMarkdown, fallbackTitle, frontmatterUpdates, sectionMerges, sectionReplacements)` that first applies replacements (overwriting the section with the provided list rendered as `- item` lines), then applies merges on the remaining sections
- [x] 2.3 Add unit test: given a note with `Related: [[old.md]]`, applying a replacement `["[[new.md]]"]` produces `Related` with only `[[new.md]]` (old link gone)
- [x] 2.4 Add unit test: given a note with `Manual Links: [[manual.md]]`, a `Related` replacement leaves `Manual Links` untouched

## 3. Service: MutationApplier wires replace-mode

- [x] 3.1 In `MutationApplier.applyAction`, after resolving `existing`, call the new 5-arg `mergeAndRender` passing `action.sectionReplacements()` as the replacements parameter

## 4. Service: HealthCheckService — replace Related instead of append

- [x] 4.1 Rename `additions` map to `computed` and change its type to `Map<String, LinkedHashSet<String>>` representing the FULL desired Related content per note (not just new items)
- [x] 4.2 Remove the `existingLinks()` guard that skips adding a link because it already exists in Related — health check now writes the full computed set regardless of prior state (within-run dedup via `knownLinks` and `countedPairs` is still needed to avoid counting the same pair twice)
- [x] 4.3 In `applyAdditions`, build `MutationAction` using `sectionReplacements` for `"Related"` instead of `sections` (merge mode)
- [x] 4.4 Keep `knownLinks` and `countedPairs` sets so a single run never adds the same link twice to the computed set and counts each pair once

## 5. Spec update

- [x] 5.1 Archive delta spec `vault-health-check` from this change into `openspec/specs/vault-health-check/spec.md` (the "Only new links are added" requirement is replaced by "Related section is replaced")

## 6. Frontend: Settings hint for Manual Links

- [x] 6.1 In `settings.component.ts` / its template, add a small explanatory note (one sentence) near the Health Check section informing users that manual links to preserve across runs should be placed in the `## Manual Links` section of each note
