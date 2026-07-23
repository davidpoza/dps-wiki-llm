## 1. Instalar dependencia `gray-matter`

- [x] 1.1 Instalar `gray-matter` en el frontend: `npm install gray-matter` (en el directorio `frontend/`)
- [x] 1.2 Verificar que no hay conflictos de peer deps y que el build Angular compila sin errores

## 2. Parseo de frontmatter en `ExplorerComponent`

- [x] 2.1 Importar `matter` de `gray-matter` en `explorer.component.ts`
- [x] 2.2 Añadir señal `frontmatter = signal<Record<string, unknown>>({})` en `ExplorerComponent`
- [x] 2.3 Añadir señal computada `frontmatterEntries = computed(() => Object.entries(this.frontmatter()))` para el template
- [x] 2.4 Añadir señal `showFrontmatter = signal(true)` para controlar la visibilidad del panel
- [x] 2.5 Modificar `loadFile()`: extraer `const { data, content } = matter(rawContent)`, llamar `frontmatter.set(data)` y pasar únicamente `content` a `replaceAll(content)`

## 3. Reconstrucción del fichero al guardar

- [x] 3.1 Modificar el método `save()` en `ExplorerComponent`: si `Object.keys(frontmatter()).length > 0`, reconstruir el contenido con `matter.stringify(this.currentMarkdown, this.frontmatter())` antes de llamar a `fileService.saveContent()`
- [x] 3.2 Verificar que ficheros sin frontmatter (`data: {}`) se guardan sin bloque `---` (comportamiento por defecto de `matter.stringify`)

## 4. Panel de metadatos en el template

- [x] 4.1 Añadir sección de panel frontmatter en el template de `ExplorerComponent`, visible únicamente cuando `frontmatterEntries().length > 0`
- [x] 4.2 Renderizar los pares clave-valor con `@for (entry of frontmatterEntries(); track entry[0])` como lista de `<span class="fm-key">` y `<span class="fm-value">`
- [x] 4.3 Añadir botón de toggle (colapsar/expandir) que actualice `showFrontmatter` y oculte/muestre el panel
- [x] 4.4 Añadir estilos CSS para el panel: fondo diferenciado (`#f0f4f8`), padding compacto, disposición horizontal de pares clave-valor, borde inferior separador

## 5. Verificación

- [x] 5.1 Verificar que al seleccionar un fichero con frontmatter, el panel muestra los metadatos y el editor NO muestra el bloque `---`
- [x] 5.2 Verificar que al seleccionar un fichero sin frontmatter, el panel está oculto y el editor muestra el contenido completo
- [x] 5.3 Verificar que al guardar un fichero con frontmatter, el fichero en disco conserva el bloque `---` con los metadatos originales seguido del cuerpo editado
- [x] 5.4 Verificar que el toggle colapsa/expande el panel correctamente
- [x] 5.5 Verificar que Ctrl+S sigue funcionando con la lógica de reconstrucción de frontmatter
