## Context

El proyecto dps-wiki-llm gestiona documentos Markdown almacenados en un directorio "vault" (configurable vía `VAULT_PATH`, por defecto `/vault`). El backend es Spring Boot con Spring Security (JWT). El frontend es Angular con PrimeNG v21.

Actualmente no existe ninguna UI para explorar ni editar esos ficheros. Los usuarios interactúan con el contenido sólo a través del chat LLM o del ingester. Esta feature añade una vista de exploración directa.

## Goals / Non-Goals

**Goals:**
- Navegar la jerarquía de directorios y ficheros `.md` del vault con `p-tree` (PrimeNG).
- Visualizar y editar el contenido Markdown del fichero seleccionado con Milkdown.
- Guardar cambios desde el editor al backend (PUT/PATCH sobre el fichero).
- Integrar la vista en `/explorer` con protección de ruta (auth guard existente).

**Non-Goals:**
- Crear o borrar ficheros/carpetas desde la UI (solo leer y editar contenido).
- Soporte para ficheros que no sean `.md`.
- Historial de versiones o diff de cambios (eso ya lo gestiona Git en el backend).
- Preview render-only mode separado del editor (Milkdown ya incluye WYSIWYG).

## Decisions

### 1. API: árbol de ficheros como TreeNode plano vs. jerárquico

**Decisión**: El backend devuelve la estructura ya en formato `TreeNode[]` jerárquico (compatible con PrimeNG `p-tree`).

**Alternativas consideradas**:
- Lista plana de paths: requiere lógica de transformación en el frontend.
- Carga lazy por nodo: más compleja, innecesaria dado el tamaño esperado del vault.

**Rationale**: Simplifica el frontend; el backend tiene acceso directo al filesystem y puede construir el árbol eficientemente con `Files.walkFileTree`.

---

### 2. Editor: Milkdown vs. otras opciones (EasyMDE, SimpleMDE, ngx-markdown-editor)

**Decisión**: Milkdown con `@milkdown/preset-commonmark` y plugin de tabla/lista.

**Alternativas consideradas**:
- EasyMDE: más simple pero sin integración TypeScript/Angular limpia.
- CodeMirror raw: requiere más configuración manual para Markdown.

**Rationale**: Milkdown es un editor WYSIWYG Markdown moderno, con API programática clara, buen soporte TypeScript y fácil integración en Angular via `afterMounted` lifecycle hook.

---

### 3. Persistencia: guardado manual vs. autosave

**Decisión**: Botón "Guardar" explícito + shortcut `Ctrl+S`.

**Alternativas consideradas**:
- Autosave con debounce: riesgo de sobrescribir contenido no intencionado.

**Rationale**: Para un editor de documentos del wiki, el guardado explícito es más seguro y predecible.

---

### 4. Seguridad: traversal path en el backend

**Decisión**: El backend valida que el path resuelto esté dentro del `vault-path` antes de cualquier operación de lectura/escritura (path traversal prevention).

## Risks / Trade-offs

- **Milkdown sin wrapper Angular oficial** → Integrar como Web Component o via `afterViewInit` con `Editor.make()`. Bien documentado; riesgo bajo.
- **Ficheros grandes** → El endpoint GET devuelve el contenido completo. Para vaults muy grandes podría ser lento. Mitigación: solo ficheros `.md` (texto plano, raramente >1MB).
- **Concurrencia** → Dos usuarios editando el mismo fichero a la vez pueden sobreescribirse. Mitigación fuera de scope; el vault tiene Git como historial.
- **Path traversal** → `../` en el path podría acceder fuera del vault. Mitigación: validación estricta en `FileService.java`.

## Migration Plan

1. Instalar dependencias Milkdown en el frontend (`npm install`).
2. Desplegar nuevo `FileController` en el backend.
3. Añadir ruta `/explorer` al router Angular.
4. No hay cambios de base de datos ni migraciones.
5. Rollback: revertir los commits; no hay estado persistente nuevo.

## Open Questions

- ¿El vault puede contener subdirectorios con profundidad arbitraria o está limitado a 2-3 niveles? (Afecta al rendimiento del endpoint de árbol.)
- ¿Se necesita control de acceso por carpeta, o todos los usuarios autenticados ven todo el vault?
