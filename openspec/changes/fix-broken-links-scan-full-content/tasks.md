## 1. Backend DTO

- [x] 1.1 Add `sourceSection` field to `BrokenLinkEntry` record

## 2. Backend Scan Logic

- [x] 2.1 Update `extractBrokenLinks` signature to accept a `sourceSection` parameter and pass it when constructing `BrokenLinkEntry`
- [x] 2.2 Update `scan()` to iterate all `doc.sections().entrySet()` instead of only reading the `Related` section, calling `extractBrokenLinks` for each section

## 3. Frontend Modal

- [x] 3.1 Update `BrokenLinkEntry` TypeScript interface in `api.service.ts` to include `sourceSection: string`
- [x] 3.2 In `broken-links-modal.component.ts`, show a section badge (e.g., `[Summary]`) next to entries where `sourceSection !== 'Related'`
- [x] 3.3 Disable the checkbox for non-Related entries
- [x] 3.4 Filter `onConfirm()` to only emit entries with `sourceSection === 'Related'`
