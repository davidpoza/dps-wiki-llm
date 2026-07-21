## Context

The change history view (`git-history.component.ts`) lists each changed file's path as a plain `<span>`. The app already routes `/explorer/**` to the `ExplorerComponent`, which accepts the file path as URL segments and opens the file in the markdown editor. No backend work is needed.

## Goals / Non-Goals

**Goals:**
- Make the file path in each history entry clickable so it navigates to the file in the editor.

**Non-Goals:**
- Changing the editor itself or the explorer routing logic.
- Handling files that no longer exist (navigation to a missing file already shows "not found" in the explorer).
- Opening the file in a new tab or external viewer.

## Decisions

**Use Angular `Router.navigate` via a `(click)` handler rather than a `[routerLink]`.**

The file path arrives as a string like `docs/article.md`. Router navigation requires splitting it into segments: `['explorer', 'docs', 'article.md']`. A `[routerLink]` binding could handle this with an array expression, but the split logic is cleaner expressed imperatively where the `Router` is already injected.

**Style the path as a link visually (`cursor: pointer`, `color: var(--app-primary)`, underline on hover) without converting the `<span>` to an `<a>` tag.**

Angular router navigation does not require an anchor element. Using `<span>` keeps the markup consistent with the existing layout and avoids the default browser behaviour of anchor tags (e.g., URL preview in status bar, middle-click opening a new tab without the SPA state).

## Risks / Trade-offs

- [File no longer exists on disk] → The explorer already handles missing files gracefully; no extra guard needed here.
- [Path encoding edge cases (spaces, special chars)] → `Router.navigate` with an array of segments handles encoding automatically; no manual `encodeURIComponent` needed.
