## 1. Prompt Updates (Flyway migrations)

- [x] 1.1 Create migration `V33__update_keywords_system_prompt.sql` that UPDATEs `llm_prompts` for key `keywords-system` with the new prompt text
- [x] 1.2 Create migration `V34__update_source_note_system_prompt.sql` that UPDATEs `llm_prompts` for key `source-note-system` with the new prompt text

## 2. Backend – Core Service Changes

- [x] 2.1 Add `overwrite` parameter to `KeywordGenerationService.generateForNote()` so it skips existing keywords when `false` and overwrites when `true`
- [x] 2.2 Add `JobType.REGENERATE_KEYWORDS` to the `JobType` enum
- [x] 2.3 Create `KeywordRegenerationJobHandler` service that reads paths from `payloadRef`, calls `generateForNote(path, overwrite=true)` for each, emits PROGRESS SSE events, makes a single git commit at the end, and marks the job COMPLETED
- [x] 2.4 Wire `KeywordRegenerationJobHandler` into `JobConsumers.consumeWriteJob()` for `JobType.REGENERATE_KEYWORDS`
- [x] 2.5 Add `REGENERATE_KEYWORDS` case to `JobRevertService` revert switch (git revert of commit range, same as ENRICH/MERGE)

## 3. Backend – Note Listing Endpoint

- [x] 3.1 Create `NoteListController` with `GET /api/notes/list?folders=...` that reads the filesystem, returns `[{path, title, hasKeywords}]` for each `.md` file found in the requested folders
- [x] 3.2 Register the endpoint in Spring Security to require JWT authentication

## 4. Backend – Regenerate Endpoint

- [x] 4.1 Create `KeywordRegenerationController` with `POST /api/keywords/regenerate` that validates the request body (`paths` must be non-empty), saves the path list to `raw/keywords/<jobId>.json`, creates and enqueues the job, and returns `202 Accepted`
- [x] 4.2 Register the endpoint in Spring Security to require JWT authentication
- [x] 4.3 Add the `ApiService.regenerateKeywords(paths: string[])` method in Angular that POSTs to `/api/keywords/regenerate`
- [x] 4.4 Add the `ApiService.listNotes(folders: string[])` method in Angular that GETs `/api/notes/list`

## 5. Frontend – Settings: Note Selection Modal

- [x] 5.1 Create `KeywordSelectionModalComponent` with: note list loaded from `listNotes(['wiki/concepts','wiki/sources'])`, checkboxes grouped by folder, `hasKeywords` visual indicator, text search (client-side filter), select-all / deselect-all buttons
- [x] 5.2 Add confirm button "Regenerar keywords (N)" that calls `regenerateKeywords(selectedPaths)` and navigates to `/jobs` on success; show inline error on failure; disable when N = 0
- [x] 5.3 Replace the existing "Generar keywords" button in `SettingsComponent` with a "Seleccionar notas…" button that opens `KeywordSelectionModalComponent`
- [x] 5.4 Remove or keep (but clearly separate) the old SSE-based keyword generation UI in Settings — if kept, label it clearly as "legacy"

## 6. Frontend – Editor Toolbar Button

- [x] 6.1 Add a "Regenerar keywords" button to the editor toolbar in the existing editor header action buttons row
- [x] 6.2 Show the button only when the open note path starts with `wiki/concepts/` or `wiki/sources/`
- [x] 6.3 On click: disable the button (loading state), call `regenerateKeywords([currentPath])`, navigate to `/jobs` on success, re-enable on error

## 7. Verification

- [ ] 7.1 Verify Flyway migrations apply cleanly and `llm_prompts` table reflects the updated prompts
- [ ] 7.2 Verify `POST /api/keywords/regenerate` with a single path enqueues the job and returns 202
- [ ] 7.3 Verify `GET /api/notes/list?folders=wiki/concepts,wiki/sources` returns the expected list with correct `hasKeywords` values
- [ ] 7.4 Verify the job runs end-to-end: processes notes, emits SSE progress, commits, marks COMPLETED in /jobs
- [ ] 7.5 Verify job revert restores the previous keyword values (or removes them if they did not exist before)
- [ ] 7.6 Verify the Settings modal: search, select-all/deselect-all, confirm button label updates with count, navigates to /jobs on submit
- [ ] 7.7 Verify the editor toolbar button appears only for eligible notes and triggers the job correctly
