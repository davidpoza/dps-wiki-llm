## ADDED Requirements

### Requirement: Cross-platform emoji rendering
The system SHALL render Unicode emoji characters correctly in all text surfaces — file-tree node labels, change history path entries, job path entries, and Markdown note content — on Windows, macOS, Linux, and Android, without requiring a separate npm package or DOM post-processing.

#### Scenario: Emoji in filename on Linux without system emoji font
- **WHEN** a user opens the app on a Linux system that does not have Noto Color Emoji installed locally, and a vault file is named with emoji (e.g. `📁 Proyectos.md`)
- **THEN** the emoji SHALL be rendered using the Noto Color Emoji web font loaded from Google Fonts, not as an empty box

#### Scenario: Emoji in filename on Windows
- **WHEN** a vault file name contains emoji and the user opens the app on Windows
- **THEN** the emoji SHALL be rendered using the Segoe UI Emoji system font

#### Scenario: Emoji in filename on macOS
- **WHEN** a vault file name contains emoji and the user opens the app on macOS
- **THEN** the emoji SHALL be rendered using the Apple Color Emoji system font

#### Scenario: Emoji in Markdown note content
- **WHEN** a note's Markdown content contains emoji characters
- **THEN** those emoji SHALL render correctly in the editor view on all supported platforms

#### Scenario: Offline graceful degradation on Linux
- **WHEN** the app is accessed from a Linux system with no system emoji font and no internet access
- **THEN** emoji SHALL fall back to whatever the browser can render (system font or box); the rest of the UI SHALL be unaffected
