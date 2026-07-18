## 1. Rutas en main.ts

- [x] 1.1 Añadir la ruta wildcard `explorer/**` en `main.ts` apuntando a `ExplorerComponent` con `authGuard` y `unsavedChangesGuard`
- [x] 1.2 Añadir la ruta wildcard `viewer/**` en `main.ts` apuntando a `DocumentViewerComponent` con `authGuard`
- [x] 1.3 Verificar que la ruta base `/explorer` sigue funcionando sin fichero seleccionado

## 2. ExplorerComponent — sincronización URL ↔ fichero

- [x] 2.1 Inyectar `ActivatedRoute` en `ExplorerComponent`
- [x] 2.2 En `ngOnInit`, leer los segmentos de URL (`route.url`) y reconstruir el path del fichero; si existe, llamar al método de carga de fichero existente
- [x] 2.3 En `onNodeSelect`, cuando se selecciona un fichero, navegar a `/explorer/<file-path>` usando `router.navigate` en lugar de actualizar solo la signal `selectedPath`
- [x] 2.4 Asegurarse de que al navegar entre ficheros (misma ruta padre `/explorer`) el componente no se destruye y recrea, sino que reacciona al cambio de URL (suscribirse a `route.url` con `takeUntilDestroyed`)

## 3. Guard de cambios sin guardar en navegación interna

- [x] 3.1 Extraer la lógica de confirmación de cambios sin guardar a un método privado reutilizable en `ExplorerComponent`
- [x] 3.2 Antes de navegar a otro fichero desde el árbol, comprobar `isDirty()` y mostrar el diálogo de confirmación; solo navegar si el usuario confirma o no hay cambios
- [x] 3.3 Verificar que `unsavedChangesGuard` sigue funcionando al salir del explorador a otra ruta (`/`, `/settings`, etc.)

## 4. DocumentViewerComponent

- [x] 4.1 Crear `frontend/src/app/components/document-viewer.component.ts` como componente standalone
- [x] 4.2 Inyectar `ActivatedRoute` y `FileService`; leer el path del fichero de la URL y cargar el contenido
- [x] 4.3 Renderizar el Markdown en modo solo lectura (usar Milkdown con `editorViewOptionsCtx` `editable: false` o un renderizador alternativo ligero)
- [x] 4.4 Parsear y mostrar el frontmatter YAML sobre el contenido renderizado (panel de metadatos de solo lectura)
- [x] 4.5 Mostrar mensaje de error si el fichero no existe (respuesta 404 de la API)
- [x] 4.6 Importar `DocumentViewerComponent` en `main.ts`

## 5. Verificación E2E

- [x] 5.1 Verificar que seleccionar un fichero en el árbol actualiza la URL a `/explorer/<path>`
- [x] 5.2 Verificar que navegar directamente a `/explorer/carpeta/doc.md` carga el fichero
- [x] 5.3 Verificar que el botón atrás del navegador vuelve al fichero anterior (o al explorador vacío)
- [x] 5.4 Verificar que cambiar de fichero con cambios sin guardar muestra el diálogo de confirmación
- [x] 5.5 Verificar que `/viewer/carpeta/doc.md` muestra el documento en modo solo lectura sin controles de edición
- [x] 5.6 Verificar que acceder a `/viewer/**` sin autenticación redirige a `/login`
