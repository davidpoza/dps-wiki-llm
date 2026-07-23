# file-browser Specification

## Purpose
TBD - created by archiving change file-browser-markdown-editor. Update Purpose after archive.
## Requirements
### Requirement: Listar árbol de ficheros del vault
El backend SHALL exponer un endpoint `GET /api/files/tree` que devuelva la estructura jerárquica de ficheros y carpetas del vault en formato compatible con PrimeNG `TreeNode[]`. Solo se incluirán ficheros con extensión `.md`.

#### Scenario: Árbol cargado correctamente
- **WHEN** el usuario navega a `/explorer` estando autenticado
- **THEN** el frontend carga el árbol de ficheros y lo muestra con `p-tree`

#### Scenario: Vault vacío
- **WHEN** el vault no contiene ficheros `.md`
- **THEN** el `p-tree` muestra un nodo raíz vacío y un mensaje "No hay documentos"

#### Scenario: Acceso sin autenticación
- **WHEN** un usuario no autenticado hace `GET /api/files/tree`
- **THEN** el backend responde con HTTP 401

---

### Requirement: Seleccionar un fichero del árbol
El frontend SHALL permitir seleccionar un fichero del árbol haciendo clic sobre él, lo que carga su contenido en el editor Markdown adyacente.

#### Scenario: Selección de un fichero
- **WHEN** el usuario hace clic en un nodo hoja (fichero `.md`) del árbol
- **THEN** el panel del editor carga el contenido del fichero seleccionado

#### Scenario: Selección de una carpeta
- **WHEN** el usuario hace clic en un nodo carpeta
- **THEN** la carpeta se expande/colapsa y no se carga ningún contenido en el editor

---

### Requirement: Obtener contenido de un fichero
El backend SHALL exponer `GET /api/files/content?path=<relative-path>` que devuelva el contenido raw del fichero `.md` solicitado.

#### Scenario: Fichero existente
- **WHEN** el frontend solicita `GET /api/files/content?path=docs/readme.md`
- **THEN** el backend responde con HTTP 200 y el contenido del fichero como texto plano

#### Scenario: Path fuera del vault (traversal)
- **WHEN** el frontend solicita un path que resuelve fuera del vault (e.g. `../../etc/passwd`)
- **THEN** el backend responde con HTTP 400 Bad Request

#### Scenario: Fichero no encontrado
- **WHEN** el frontend solicita un path que no existe en el vault
- **THEN** el backend responde con HTTP 404

---

### Requirement: Vista Explorer en la aplicación
La aplicación SHALL tener una ruta `/explorer` accesible desde la navegación principal, protegida por el `auth.guard` existente.

#### Scenario: Navegación a /explorer autenticado
- **WHEN** un usuario autenticado accede a `/explorer`
- **THEN** se muestra el layout con el árbol de ficheros a la izquierda y el editor a la derecha

#### Scenario: Navegación a /explorer no autenticado
- **WHEN** un usuario no autenticado accede a `/explorer`
- **THEN** es redirigido a `/login`

