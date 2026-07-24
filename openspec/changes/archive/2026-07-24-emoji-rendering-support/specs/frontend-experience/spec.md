## MODIFIED Requirements

### Requirement: Global typography
The application body font-family SHALL include explicit emoji font fallbacks — `"Apple Color Emoji"`, `"Segoe UI Emoji"`, `"Noto Color Emoji"`, `"Segoe UI Symbol"` — appended after the existing sans-serif stack, so that all text elements in the application inherit correct emoji resolution without per-component CSS changes.

#### Scenario: Font stack resolves emoji on macOS
- **WHEN** the browser renders any text node containing an emoji code point on macOS
- **THEN** the browser SHALL select `Apple Color Emoji` from the font-family stack for that glyph

#### Scenario: Font stack resolves emoji on Windows
- **WHEN** the browser renders any text node containing an emoji code point on Windows
- **THEN** the browser SHALL select `Segoe UI Emoji` from the font-family stack for that glyph

#### Scenario: Font stack resolves emoji on Linux (with web font)
- **WHEN** the browser renders any text node containing an emoji code point on Linux after `Noto Color Emoji` has loaded
- **THEN** the browser SHALL select `Noto Color Emoji` for that glyph

#### Scenario: Non-emoji text is unaffected
- **WHEN** the browser renders Latin or other non-emoji text
- **THEN** the primary `Inter` typeface SHALL be used, unchanged from the current behaviour
