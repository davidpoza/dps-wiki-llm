## 1. Backend — DTO y endpoint

- [x] 1.1 Crear record `IngestTextRequest` en el paquete de DTOs/controllers con campos `content` (String, @NotBlank), `title` (String, opcional) y `mode` (JobMode, opcional)
- [x] 1.2 Añadir método `ingestText(String content, String title)` en `RawIntakeService` que valide el tamaño (≤ 2 MB), genere el slug a partir del título (o `"clipboard"` si está vacío) y escriba el fichero en `raw/inbox/`
- [x] 1.3 Añadir endpoint `POST /ingest/text` en `JobController` que acepte `@RequestBody @Valid IngestTextRequest`, llame a `rawIntakeService.ingestText(...)` y encole el job

## 2. Frontend — servicio API

- [x] 2.1 Añadir método `ingestText(content: string, title: string, mode: JobMode): Observable<EnqueueResponse>` en `ApiService` que llame a `POST /api/ingest/text`

## 3. Frontend — componente UI

- [x] 3.1 Añadir señales `mdText = signal('')`, `mdTitle = signal('')` y computed `mdTooLarge` (> 2 097 152 bytes) en `IngestComponent`
- [x] 3.2 Añadir método `ingestMdText()` en `IngestComponent` que llame a `api.ingestText(...)` con manejo de errores igual al de los otros métodos
- [x] 3.3 Añadir la nueva sección al template de `IngestComponent`: textarea (`[(ngModel)]="mdText()"`), input de título (`[(ngModel)]="mdTitle()"`), advertencia de tamaño si `mdTooLarge()` y botón deshabilitado si `!mdText().trim() || mdTooLarge() || busy()`

## 4. Internacionalización

- [x] 4.1 Añadir claves i18n en `es.json` bajo `ingest`: `pasteMarkdown`, `pasteTitle`, `pastePlaceholder`, `pasteTitlePlaceholder`, `ingestText`, `textTooLarge`
- [x] 4.2 Añadir las mismas claves en `en.json` con traducción al inglés

## 5. Verificación

- [x] 5.1 Verificar en la UI que el botón queda deshabilitado con textarea vacío y habilitado con contenido
- [x] 5.2 Verificar que pegar un MD real encola el job y muestra el jobId
- [x] 5.3 Verificar que se muestra el aviso de tamaño al superar 2 MB
- [x] 5.4 Verificar con curl/Postman que `POST /api/ingest/text` responde 202 con contenido válido y 400 con contenido vacío o > 2 MB
