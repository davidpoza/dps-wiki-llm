## 1. Extend ScanActivity type

- [x] 1.1 In `frontend/src/app/types.ts`, add `updated?: number` and `failed?: number` to the `ScanActivity` interface

## 2. Fix jobs.store.ts – in-place update (general guard)

- [x] 2.1 In `jobs.store.ts`, in the `else if (event.message)` branch, add a find-and-replace guard before the append: use `existing.phases.findIndex(p => p.step === event.step)` — if ≥ 0, replace that index in a copied array; otherwise append as before

## 3. Fix jobs.store.ts – route step="progress" JSON to currentActivity

- [x] 3.1 Before the general guard (task 2.1), add a branch that intercepts events where `event.step === 'progress'` and `event.message` is parseable as `{processed, total, updated, failed}`; when matched, set `next.currentActivity = { label: 'progress', percent, updated, failed }` and skip the phases array entirely
- [x] 3.2 Ensure parsing failures fall through to the general guard (wrap in try/catch)

## 4. Update jobs-viewer template

- [x] 4.1 In `jobs-viewer.component.ts` template, inside the `@if (job.currentActivity)` block, add a conditional span that shows `updated` and `failed` counts (e.g. `@if (job.currentActivity.updated !== undefined) { <span>{{ job.currentActivity.updated }} act. · {{ job.currentActivity.failed }} err.</span> }`)

## 5. Verification

- [ ] 5.1 Trigger a keyword regeneration job with multiple files and confirm the jobs panel shows one updating progress indicator, not stacked rows
- [ ] 5.2 Trigger a concept merge job and confirm the "merge" row updates in place (one row, not one per group)
- [ ] 5.3 Confirm the progress indicator shows `updated`/`failed` counts alongside the percentage
- [ ] 5.4 Confirm phases with distinct step names (snapshot, completed, etc.) still appear as separate rows
- [ ] 5.5 Confirm the progress indicator clears ~1.5 s after job completion

