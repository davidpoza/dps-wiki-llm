## Why

Insertar imágenes en el editor Markdown requiere actualmente copiar manualmente el fichero al directorio de recursos y escribir la sintaxis `![alt](ruta)`. El flujo habitual de trabajo (captura de pantalla → portapapeles → pegar) no está soportado, lo que ralentiza la edición de notas con contenido visual.

## What Changes

- El editor Milkdown intercepta el evento `paste` cuando el portapapeles contiene una imagen.
- El frontend sube la imagen al backend, que la guarda en el directorio de recursos configurado con un nombre `<uuid>.ext`.
- El backend devuelve la ruta relativa del fichero guardado.
- El editor inserta automáticamente un nodo imagen Milkdown con esa ruta.

## Capabilities

### New Capabilities

- `clipboard-image-paste`: Captura del evento paste con imagen en el editor, subida al backend y inserción del nodo imagen con la ruta generada.

### Modified Capabilities

<!-- No hay cambios de requisitos en specs existentes. La nueva capacidad es aditiva al editor existente. -->

## Impact

- **Frontend**: Componente del editor Milkdown — añadir handler de `paste` y llamada HTTP al nuevo endpoint.
- **Backend**: Nuevo endpoint `POST /api/files/upload-image` que recibe `multipart/form-data`, genera UUID, guarda el fichero en el directorio de recursos del vault y devuelve la ruta relativa.
- **Configuración**: El directorio de recursos ya forma parte de la configuración del vault; el endpoint lo lee de ahí.
- **Dependencias**: Sin nuevas librerías externas (UUID disponible en Java estándar; File API en el navegador disponible nativamente).
