## Context

El editor Markdown usa Milkdown con plugins custom registrados en `explorer.component.ts`. Ya existe el plugin `createMarkdownImagePlugin()` para insertar imágenes escribiendo la sintaxis `![alt](url)`. El `resourceFolder` ya está disponible como signal en el componente y se usa en `createObsidianImagePreviewPlugin`. El backend tiene `ResourceSettingsService` que expone el directorio de recursos y `FileService`/`FileController` que gestionan el sistema de ficheros del vault.

## Goals / Non-Goals

**Goals:**
- Interceptar `Ctrl+V` (y el evento `paste` en general) cuando el portapapeles contiene una imagen.
- Subir la imagen al backend con un UUID como nombre de fichero.
- Insertar un nodo imagen Milkdown apuntando a la ruta relativa guardada.
- Soportar PNG, JPEG, GIF y WebP (los mismos tipos que `ResourceSettingsService.IMAGE_EXTENSIONS`).

**Non-Goals:**
- Pegar imágenes desde URLs externas (solo binarios del portapapeles).
- Arrastrar y soltar ficheros de imagen (drag & drop).
- Configurar el nombre del fichero por el usuario.
- Previsualización antes de subir.

## Decisions

### D1 – Plugin Milkdown independiente vs. extender el plugin existente
**Decisión**: Plugin nuevo `clipboard-image.plugin.ts` que recibe un callback `uploadImage`.

**Motivo**: El plugin de escritura (`createMarkdownImagePlugin`) usa `handleTextInput`, un hook diferente al de `paste`. Mantenerlos separados sigue el patrón del proyecto (un fichero por plugin) y facilita el testing.

**Alternativa descartada**: Añadir el handler de paste al plugin existente — mezclaría dos responsabilidades distintas.

### D2 – Dónde reside la lógica de upload (frontend vs. backend)
**Decisión**: El frontend solo pasa `File` a un servicio Angular que llama al backend. El backend genera el UUID y escribe el fichero.

**Motivo**: Centralizar el naming en backend evita colisiones entre clientes y asegura que el directorio de recursos sea siempre el configurado en servidor.

**Alternativa descartada**: Generar el UUID en frontend y enviar el nombre junto con el fichero — requeriría validación extra en backend para evitar sobrescrituras o path traversal.

### D3 – Endpoint nuevo vs. reusar `/api/files/content`
**Decisión**: Endpoint nuevo `POST /api/files/upload-image` con `multipart/form-data`.

**Motivo**: `/api/files/content` acepta texto plano (body directo). Reutilizarlo para binarios implicaría cambios breaking en su contrato. El nuevo endpoint es semánticamente claro y permite devolver la ruta generada.

### D4 – Extensión del fichero guardado
**Decisión**: Se preserva la extensión del `file.type` del MIME type (`image/png` → `.png`, `image/jpeg` → `.jpg`, etc.). Si el MIME no es reconocido, se rechaza con 400.

**Motivo**: Evita tener que inspeccionar el contenido binario (magic bytes). La API del portapapeles siempre incluye MIME correcto para imágenes copiadas del sistema operativo.

## Risks / Trade-offs

- **Ficheros huérfanos** → Si el usuario pega y luego no guarda el documento, la imagen quedará en disco sin referencia. Mitigación: documentar que el vault puede tener imágenes no referenciadas (igual que cualquier gestor de assets estático).
- **Portapapeles con múltiples items imagen** → Solo se procesa el primer item de tipo imagen. Pegar múltiples imágenes a la vez no está en scope.
- **Tamaño de imagen** → No se impone límite en este cambio; Spring Boot aplica su límite de `spring.servlet.multipart.max-file-size` (configurable).

## Migration Plan

No hay migración de datos. El endpoint nuevo es aditivo y no modifica endpoints existentes. El plugin se registra junto a los otros en `initEditor()`.
