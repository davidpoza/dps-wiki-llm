## Context

The app's global `body` font-family is `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Browsers resolve fonts character-by-character: for emoji code points (U+1F000–U+1FFFF and others) they look for a font that covers those ranges. `Inter` has no emoji coverage, so the browser falls through to the OS default. On Windows that is `Segoe UI Emoji`; on macOS it is `Apple Color Emoji`; on Linux there is no guaranteed fallback (Noto Color Emoji must be installed separately).

The fix has two layers that together cover all platforms:
1. **CSS font-family** — declare the four known emoji fonts explicitly so the browser's font-matching algorithm picks the right one without guessing.
2. **Web font** — load `Noto Color Emoji` from Google Fonts as a stylesheet, making it available on Linux and Android even when not installed locally.

## Goals / Non-Goals

**Goals:**
- Emoji in filenames, change paths, job paths, and Markdown note content render correctly on Windows, macOS, Linux, and Android.
- Solution is CSS-only; no new npm package, no JS processing of the DOM.

**Non-Goals:**
- Custom emoji picker or input mechanism.
- SVG/image-based emoji replacement (Twemoji approach) — unnecessary given CSS coverage.
- Offline Linux support without any external font (requires OS-level Noto installation, out of app scope).

## Decisions

### CSS font-family list, not a separate `@font-face` rule

Adding the emoji font names directly to the `body` `font-family` stack is the standard, zero-overhead approach. Browsers already apply emoji font resolution heuristics; making the names explicit just removes ambiguity and ensures resolution order. No `@font-face` block needed because the system fonts are referenced by their well-known names, and the web font (Noto Color Emoji) is loaded via Google Fonts `font-display: swap` which handles the `@font-face` declaration for us.

### Google Fonts for Noto Color Emoji (non-blocking)

The `<link rel="stylesheet">` for Google Fonts is non-blocking — it does not delay the First Contentful Paint. If the network is unavailable (offline Docker deploy) it fails silently and the CSS system-font fallbacks still cover Windows and macOS. Linux without Noto will still see boxes in the offline case, which is the same as today.

Alternative considered: self-hosting Noto Color Emoji — the font file is ~10 MB, adding it to the repo and serving it statically is an option but adds significant asset weight with no benefit over the Google Fonts CDN for connected environments.

### Single edit point: `body` font-family

Because Angular components use `font: inherit` (already set in `styles.scss`) all UI text, including PrimeNG tree node labels, file path spans, and the Markdown editor, inherits from `body`. No per-component CSS edits are needed.

## Risks / Trade-offs

- **Noto Color Emoji render style differs from system fonts**: Noto uses its own glyph designs, which may look different from the Windows or macOS emoji set. This is acceptable — the alternative (blank boxes) is worse.
- **Google Fonts request on page load**: One extra DNS lookup + stylesheet load. Mitigated by `preconnect` hints; typical latency impact < 50 ms on first load, zero on subsequent (cached).
- **`font-display: swap` flash**: On first load on Linux, text may briefly show without emoji until the web font loads. Acceptable UX trade-off.

## Migration Plan

Two file edits, both purely additive. No CSS resets, no layout changes. Rolling back is removing the two `<link>` tags and the emoji font names from the font-family list.
