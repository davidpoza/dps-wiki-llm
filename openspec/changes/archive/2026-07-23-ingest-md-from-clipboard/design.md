## Context

El componente de ingestión (`ingest.component.ts`) tiene dos vías: subida de fichero y URL. Ambas llegan al backend a través de `JobController` y delegan el procesamiento a `RawIntakeService`, que escribe el contenido en `raw/inbox/` o `raw/web/`. El pipeline de procesamiento posterior no distingue el origen, solo necesita el path del fichero raw.

El patrón existente de `ingestMarkdown(MultipartFile)` es directamente reutilizable: la lógica es idéntica (slugificar, escribir en raw/inbox), cambia solo la fuente del string.

## Goals / Non-Goals

**Goals:**
- Añadir un textarea en la pantalla de ingestión donde pegar Markdown directamente.
- Nuevo endpoint `POST /api/ingest/text` que acepta `{ content, title?, mode? }` y encola el job.
- Validación de tamaño máximo (2 MB, igual que upload de fichero) en backend; advertencia visual en frontend antes del envío.

**Non-Goals:**
- Preview del Markdown pegado.
- Soporte para otros formatos (HTML, texto plano sin formato).
- Edición del Markdown una vez enviado.

## Decisions

### Endpoint JSON en lugar de `multipart/form-data`

Dado que el contenido viene de un textarea (ya es un string en memoria), serializar como JSON `{ content, title, mode }` es más natural que construir un `FormData` y simular un fichero. Evita complejidad innecesaria en ambos lados.

Alternativa descartada: reutilizar `/ingest/upload` enviando el textarea como un `Blob`. Implicaría más boilerplate en el frontend y no añadiría valor.

### Título opcional con fallback a timestamp

Si el usuario no rellena el campo de título, el backend genera un slug a partir del timestamp (igual que con ficheros). El campo título es opcional tanto en frontend como en el DTO de backend. Esto mantiene el comportamiento consistente con los otros métodos de ingestión.

### Sin nuevo componente Angular

La nueva sección se añade dentro del template de `IngestComponent` existente, con nuevas señales (`mdText`, `mdTitle`). No justifica un componente separado por ahora.

## Risks / Trade-offs

- **Contenido muy largo**: El textarea no impide pegar documentos enormes. → Mitigación: validar en frontend (con mensaje de error) antes de enviar y mantener el límite de 2 MB en backend (igual que upload).
- **Sin nombre de fichero real**: El slug se genera del título o del timestamp, lo que puede producir nombres poco descriptivos. → Aceptable; es el mismo comportamiento del upload anónimo.

## Migration Plan

Cambio aditivo puro: nuevo endpoint, nueva sección de UI. No hay migración de datos ni cambios de esquema. Despliegue sin pasos especiales.
