## 1. Backend — Endpoint de subida de imágenes

- [x] 1.1 Añadir método `uploadImage(MultipartFile file): String` en `FileService` que valida el MIME type, genera UUID, resuelve la ruta en el resourceFolder y escribe el fichero en disco
- [x] 1.2 Añadir `POST /api/files/upload-image` en `FileController` que recibe `@RequestParam("file") MultipartFile`, llama al servicio y devuelve `{ "path": "..." }` con HTTP 200; responde 400 si el MIME no es soportado o el resourceFolder está vacío

## 2. Frontend — Servicio Angular

- [x] 2.1 Añadir método `uploadImage(file: File): Observable<{ path: string }>` en el API service que llama a `POST /api/files/upload-image` con `FormData`

## 3. Frontend — Plugin Milkdown

- [x] 3.1 Crear `clipboard-image.plugin.ts` con `createClipboardImagePlugin(options)` que usa `handleDOMEvents: { paste }` para interceptar imágenes del portapapeles
- [x] 3.2 En el handler de paste, extraer el primer item de tipo `image/*` del `ClipboardEvent.clipboardData`, llamar al callback `uploadImage` y en la respuesta insertar un nodo imagen Milkdown en la posición del cursor
- [x] 3.3 Si `uploadImage` falla, mostrar un toast de error (reusar el patrón de notificaciones existente en el componente)

## 4. Frontend — Integración en el editor

- [x] 4.1 Registrar `createClipboardImagePlugin` en `initEditor()` dentro de `explorer.component.ts`, pasando la función de upload y el token de auth como opciones
- [x] 4.2 Mostrar toast de aviso cuando el backend responde 400 indicando que el directorio de recursos no está configurado

## 5. Verificación E2E

- [x] 5.1 Copiar una imagen al portapapeles (captura de pantalla) y pegarla en el editor; verificar que el fichero aparece en el resourceFolder con nombre UUID y que el editor muestra el nodo imagen
- [x] 5.2 Verificar que pegar texto normal sigue funcionando sin interferencia
- [x] 5.3 Verificar el toast de error cuando el resourceFolder no está configurado
