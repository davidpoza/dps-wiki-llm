## 1. Pandoc Invocation — Enable Syntax Highlighting

- [x] 1.1 In `FileService.exportPdf()`, add `"--highlight-style", "kate"` to the pandoc `ProcessBuilder` argument list so fenced code blocks with language tags receive syntax colouring

## 2. CSS Stylesheet — Page Layout and Typography

- [x] 2.1 In `pdfStylesheet()`, add a `@page` rule setting margins (`2cm 2.5cm`) and A4 size
- [x] 2.2 Add `body` rule: `font-family: sans-serif; font-size: 11pt; line-height: 1.6; color: #24292f`
- [x] 2.3 Add heading rules `h1`–`h6` with decreasing font sizes, bold weight, and top/bottom margins; add `h1` bottom border for visual hierarchy

## 3. CSS Stylesheet — Inline Formatting

- [x] 3.1 Add `strong, b` rule: `font-weight: 700`
- [x] 3.2 Add `em, i` rule: `font-style: italic`
- [x] 3.3 Add `a` rule: `color: #0969da; text-decoration: underline`
- [x] 3.4 Add `a::after` rule: `content: " (" attr(href) ")"; font-size: 0.8em; word-break: break-all` so link URLs are visible in print

## 4. CSS Stylesheet — Lists

- [x] 4.1 Add `ul` rule: `list-style: disc; padding-left: 1.75em; margin: 0.5em 0`
- [x] 4.2 Add `ol` rule: `list-style: decimal; padding-left: 1.75em; margin: 0.5em 0`
- [x] 4.3 Add `li` rule: `margin: 0.25em 0`
- [x] 4.4 Add nested list rule `ul ul, ol ul` with `list-style: circle` and `ul ol, ol ol` with `list-style: lower-alpha`

## 5. CSS Stylesheet — Blockquotes

- [x] 5.1 Add `blockquote` rule: `border-left: 4px solid #d0d7de; padding: 0.25em 1em; margin: 1em 0; color: #57606a`

## 6. CSS Stylesheet — Code

- [x] 6.1 Add `code` (inline) rule: `font-family: monospace; font-size: 0.9em; background: #f6f8fa; padding: 0.1em 0.35em; border-radius: 4px; border: 1px solid #d0d7de`
- [x] 6.2 Add `pre` rule: `background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 1em; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 1em 0`
- [x] 6.3 Add `pre code` rule overriding the inline `code` background/border/padding to `none`/`0` so there is no double-border inside a code block

## 7. CSS Stylesheet — Tables

- [x] 7.1 Add `table` rule: `border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.95em`
- [x] 7.2 Add `th, td` rule: `border: 1px solid #d0d7de; padding: 0.4em 0.75em; text-align: left`
- [x] 7.3 Add `thead th` rule: `background: #f6f8fa; font-weight: 700`
- [x] 7.4 Add `tbody tr:nth-child(even)` rule: `background: #f8f9fa`

## 8. CSS Stylesheet — Images

- [x] 8.1 Add `img` rule (covers standard markdown images): `display: block; max-width: 100%; max-height: 20cm; height: auto; margin: 1rem auto`

## 9. Verification

- [x] 9.1 Export a markdown file containing all seven element types (list, bold, italic, link, table, image, blockquote, code block) and confirm each renders correctly in the downloaded PDF
- [x] 9.2 Confirm fenced code block with a language tag (e.g., ` ```java `) shows syntax colouring in the PDF
- [x] 9.3 Confirm links show the URL in parentheses after the link text
- [x] 9.4 Confirm tables have visible borders and a shaded header row
