## 1. Component Setup

- [x] 1.1 Add `ConfirmDialogModule`, `ToastModule`, `ConfirmationService`, and `MessageService` imports/providers to `document-viewer.component.ts`
- [x] 1.2 Inject `ConfirmationService`, `MessageService`, and `Router` into `DocumentViewerComponent`

## 2. Toolbar Delete Button

- [x] 2.1 Add a Delete button (`p-button` with `severity="danger"`, icon `pi-trash`) to the topbar actions in `document-viewer.component.ts`, visible only when the user is authenticated
- [x] 2.2 Add `<p-confirmdialog>` and `<p-toast>` elements to the component template

## 3. Delete Logic

- [x] 3.1 Implement `confirmDelete()` method: call `confirmationService.confirm()` with a message showing the current file name, Accept key, and Reject key
- [x] 3.2 In the accept callback: call `FileService.deleteFile(filePath())`, navigate to `/` on success, show an error toast on failure

## 4. i18n

- [x] 4.1 Add translation keys for the delete button label, confirmation header, confirmation message, and error toast message in all locale files (`en.json`, `es.json`, etc.)
