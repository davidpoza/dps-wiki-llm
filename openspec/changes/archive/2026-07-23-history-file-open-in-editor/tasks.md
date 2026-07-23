## 1. Frontend — git-history component

- [x] 1.1 Inject `Router` into `GitHistoryComponent` and add a `openFile(path: string)` method that calls `this.router.navigate(['explorer', ...path.split('/')])`
- [x] 1.2 Replace the `.file-path` `<span>` in the entry row template with a `<span>` that has `(click)="openFile(entry.path)"` and `role="link"` / `tabindex="0"` for accessibility
- [x] 1.3 Update `.file-path` CSS: add `cursor: pointer; color: var(--app-primary);` and an `&:hover { text-decoration: underline; }` rule
