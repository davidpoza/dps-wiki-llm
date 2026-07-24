## 1. CSS — emoji font-family fallbacks

- [x] 1.1 In `frontend/src/styles.scss`, append `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol"` to the end of the `body` `font-family` list (before the closing semicolon)

## 2. HTML — Noto Color Emoji web font

- [x] 2.1 In `frontend/src/index.html`, add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` inside `<head>` before the closing `</head>` tag
- [x] 2.2 Add `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap">` after the preconnect links
