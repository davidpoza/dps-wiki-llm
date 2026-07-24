## 1. Backend: Endpoint de estado del embedding

- [x] 1.1 Añadir método `findEmbeddingStatus(String path)` en `DocumentIndexRepository` / `JdbcDocumentIndexRepository` que devuelva `embedded_at` para un path exacto
- [x] 1.2 Crear DTO `EmbeddingStatusResponse` con campos `hasEmbedding: boolean` y `lastUpdated: Instant`
- [x] 1.3 Crear `DocumentController` con `GET /api/documents/embedding-status?path=` que valide el path (sin traversal) y llame al repositorio
- [x] 1.4 Registrar el endpoint en Spring Security para que sea accesible con JWT (mismo nivel que el resto de endpoints de ficheros)

## 2. Frontend: Servicio API

- [x] 2.1 Añadir método `getEmbeddingStatus(path: string): Observable<EmbeddingStatus>` en `api.service.ts` donde `EmbeddingStatus = { hasEmbedding: boolean, lastUpdated: string | null }`

## 3. Frontend: Indicador en el encabezado del editor

- [x] 3.1 Añadir Signal `embeddingStatus = signal<EmbeddingStatus | null>(null)` en `explorer.component.ts`
- [x] 3.2 Llamar a `getEmbeddingStatus` al cargar un documento (junto a la carga del contenido) y almacenar el resultado en la Signal; resetear a `null` al cambiar de fichero
- [x] 3.3 Añadir el icono de estado del embedding como prefijo al `file-path` en la plantilla HTML del encabezado del editor, usando PrimeIcons y el tooltip nativo `title`
- [x] 3.4 Aplicar estilos: color diferenciado para "con embedding" vs "sin embedding", alineación vertical con el resto del encabezado

## 4. Verificación

- [ ] 4.1 Verificar que al abrir un documento con embedding el icono aparece en estado activo con la fecha en el tooltip
- [ ] 4.2 Verificar que al abrir un documento sin embedding el icono aparece en estado inactivo con mensaje apropiado
- [ ] 4.3 Verificar que al cambiar de documento el indicador se actualiza correctamente
- [ ] 4.4 Verificar que un fallo del endpoint no rompe el editor (icono simplemente no aparece)
