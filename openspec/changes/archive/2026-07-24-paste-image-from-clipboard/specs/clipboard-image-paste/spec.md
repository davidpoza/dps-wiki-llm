## ADDED Requirements

### Requirement: Pegar imagen desde el portapapeles en el editor
El editor Milkdown SHALL interceptar el evento `paste` cuando el portapapeles contiene un item de tipo `image/*`. El frontend SHALL subir la imagen al backend mediante `POST /api/files/upload-image`. El backend SHALL guardar el fichero en el directorio de recursos configurado con el nombre `<uuid>.<ext>` y devolver la ruta relativa. El editor SHALL insertar un nodo imagen Milkdown con dicha ruta en la posición del cursor.

#### Scenario: Pegar imagen PNG desde el portapapeles
- **WHEN** el usuario copia una imagen (por ejemplo, una captura de pantalla) y pulsa `Ctrl+V` con el foco en el editor
- **THEN** el editor intercepta el evento paste
- **THEN** el frontend sube la imagen a `POST /api/files/upload-image`
- **THEN** el backend guarda el fichero como `<resourceFolder>/<uuid>.png` y responde HTTP 200 con `{ "path": "<resourceFolder>/<uuid>.png" }`
- **THEN** el editor inserta un nodo imagen con `src=<resourceFolder>/<uuid>.png`

#### Scenario: Pegar imagen JPEG desde el portapapeles
- **WHEN** el usuario pega una imagen de tipo `image/jpeg`
- **THEN** el backend la guarda como `<uuid>.jpg` y devuelve la ruta con extensión `.jpg`

#### Scenario: Pegar imagen WebP o GIF
- **WHEN** el usuario pega una imagen de tipo `image/webp` o `image/gif`
- **THEN** el backend la guarda con la extensión correspondiente (`.webp` o `.gif`) y devuelve la ruta

#### Scenario: Pegar texto normal (sin imagen)
- **WHEN** el usuario pulsa `Ctrl+V` con texto en el portapapeles (sin imagen)
- **THEN** el plugin no interfiere y Milkdown procesa el paste de texto con su comportamiento por defecto

#### Scenario: Portapapeles con imagen y texto simultáneamente
- **WHEN** el portapapeles contiene tanto un item imagen como texto
- **THEN** el plugin prioriza el item imagen, sube el fichero e inserta el nodo imagen

#### Scenario: Directorio de recursos no configurado
- **WHEN** el usuario pega una imagen y el directorio de recursos no está configurado en el servidor
- **THEN** el backend responde HTTP 400
- **THEN** el frontend muestra un toast de error indicando que debe configurar el directorio de recursos

#### Scenario: Error al guardar el fichero en el servidor
- **WHEN** el backend no puede escribir el fichero (permisos, disco lleno)
- **THEN** el backend responde HTTP 500
- **THEN** el frontend muestra un toast de error genérico

---

### Requirement: Endpoint de subida de imágenes al vault
El backend SHALL exponer `POST /api/files/upload-image` que acepte `multipart/form-data` con un campo `file` de tipo imagen. El backend SHALL generar un nombre `<uuid>.<ext>` basado en el MIME type del fichero recibido, guardar el fichero en `<vaultRoot>/<resourceFolder>/` y devolver la ruta relativa al vault.

#### Scenario: Subida exitosa de imagen PNG
- **WHEN** el cliente envía `POST /api/files/upload-image` con `Content-Type: multipart/form-data` y el campo `file` conteniendo un PNG (`image/png`)
- **THEN** el backend genera un UUID, guarda el fichero en `<resourceFolder>/<uuid>.png`
- **THEN** el backend responde HTTP 200 con `{ "path": "<resourceFolder>/<uuid>.png" }`

#### Scenario: MIME type no soportado
- **WHEN** el cliente envía un fichero con `Content-Type` distinto de `image/png`, `image/jpeg`, `image/gif` o `image/webp`
- **THEN** el backend responde HTTP 400 Bad Request

#### Scenario: Directorio de recursos vacío
- **WHEN** el campo `resource-folder` en la configuración está vacío o no existe
- **THEN** el backend responde HTTP 400 Bad Request con mensaje descriptivo

#### Scenario: Path traversal bloqueado
- **WHEN** el nombre de fichero generado resolvería fuera del vault (condición teórica al usar UUID)
- **THEN** el backend responde HTTP 400 Bad Request
