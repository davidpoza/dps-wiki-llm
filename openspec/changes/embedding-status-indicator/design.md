## Context

El editor de documentos (explorer.component.ts) muestra el path completo del fichero abierto en el encabezado, con la parte de directorio en tono atenuado y el nombre del fichero resaltado. La tabla `documents` ya tiene una columna `embedded_at` (timestamp) que se actualiza cada vez que el pipeline de embedding procesa un documento. El frontend no expone actualmente ningún dato sobre el estado del embedding.

## Goals / Non-Goals

**Goals:**
- Añadir un icono de estado del embedding en el encabezado del editor, como prefijo al path del fichero.
- Mostrar la fecha de `embedded_at` como tooltip (title/hover) cuando el embedding existe.
- Exponer un endpoint ligero en el backend que devuelva `{ hasEmbedding: boolean, lastUpdated: string | null }` para un path dado.
- Cargar el estado del embedding cada vez que se abre un documento.

**Non-Goals:**
- Lanzar o cancelar el proceso de embedding desde el indicador.
- Actualización en tiempo real/push del indicador (no WebSocket/SSE); una carga al abrir el documento es suficiente.
- Mostrar el indicador en el árbol de ficheros ni en ningún otro lugar que no sea el encabezado del editor.

## Decisions

### Backend: endpoint `GET /api/documents/embedding-status`

Se añade un endpoint ligero en un nuevo `DocumentController` (o en el controlador de ficheros existente si encaja mejor) que recibe `?path=<relative-path>` y consulta directamente la tabla `documents`:

```sql
SELECT embedded_at FROM documents WHERE path = ?
```

Devuelve:
```json
{ "hasEmbedding": true, "lastUpdated": "2025-07-20T14:32:00Z" }
{ "hasEmbedding": false, "lastUpdated": null }
```

**Alternativa descartada**: reutilizar el endpoint de búsqueda semántica — no está diseñado para lookup por path exacto y devuelve demasiados datos.

### Frontend: carga lazy por apertura de documento

El estado se carga con una llamada HTTP al abrir un documento (en la misma función que carga el contenido del fichero). Se almacena en una Signal local del componente. No se sondea ni se actualiza automáticamente.

**Alternativa descartada**: cargar el estado de todos los ficheros en bulk al inicio — innecesario; el indicador solo importa para el fichero abierto actualmente.

### Icono: prefijo en el encabezado

Se usa un icono de PrimeIcons como prefijo antes del `file-path` existente:
- `pi-circle-fill` (o similar) en color verde cuando el embedding existe.
- `pi-circle` (o similar) en color gris/muted cuando no existe.

El tooltip nativo HTML (`title`) del elemento del icono mostrará la fecha formateada o "Sin embedding" según corresponda.

**Alternativa descartada**: crear un componente Angular independiente — el indicador es lo suficientemente pequeño como para integrarse directamente en la plantilla del explorador.

## Risks / Trade-offs

- [Latencia del endpoint] Añade una petición HTTP extra al abrir cada documento → Mitigación: la consulta es un SELECT por clave primaria (path), extremadamente rápida. Si falla, el icono simplemente no se muestra (degradación silenciosa).
- [Datos desactualizados] Si el embedding se regenera mientras el documento está abierto, el indicador no se actualiza → Aceptado intencionadamente: la recarga al abrir el fichero es suficiente para el caso de uso.
