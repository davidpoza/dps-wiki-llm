## 0. Infra de testing (Vitest + @testing-library/angular + TestBed)

- [x] 0.1 Añadir devDependencies `vitest`, `jsdom`, `@testing-library/angular`, `@testing-library/dom`; target `test` (`@angular/build:unit-test`, runner vitest) en `angular.json`; `tsconfig.spec.json`.
- [x] 0.2 Smoke test (`testing-harness.spec.ts`) que valida TestBed + render de componente standalone con testing-library.

## 1. Utilidad de normalización de markdown

- [x] 1.1 Crear helper puro `tightenListSerialization(md: string): string` (`frontend/src/app/components/markdown-normalize.ts`) que colapse una línea en blanco solo cuando la línea de contenido anterior y la posterior sean ambas ítems de lista (`^\s*([-*+]|\d+[.)])\s+`), rastreando estado de *fenced code blocks* (``` ` ``` y `~~~`) para no tocar su interior.
- [x] 1.2 Garantizar que la función es idempotente (`f(f(x)) === f(x)`) y que preserva ítems de lista multi-párrafo (líneas en blanco seguidas de continuación indentada no se eliminan).

## 2. Tests de la normalización

- [x] 2.1 Test: lista "tight" inflada a "loose" → vuelve a "tight" (sin líneas en blanco entre ítems).
- [x] 2.2 Test: lista con ítems multi-párrafo conserva sus líneas en blanco.
- [x] 2.3 Test: contenido dentro de un bloque de código (con líneas que parecen ítems o líneas en blanco) queda intacto.
- [x] 2.4 Test de idempotencia sobre una nota de ejemplo real (listas + encabezados).
- [x] 2.5 Test: el tightening es marker-agnóstico (listas con marcador `-`).

## 3. Integración en el editor

- [x] 3.1 En `explorer.component.ts`, aplicar `tightenListSerialization` dentro del listener `markdownUpdated`, tras el des-escape de wikilinks existente, de modo que `this.currentMarkdown` (y `tocMarkdown`) queden normalizados.
- [x] 3.2 Preservar el separador original del frontmatter: `parseFrontmatter` captura el separador (`\n` o `\n\n`) en `frontmatterSeparator`, y `stringifyWithFrontmatter` lo reutiliza — round-trip idempotente para notas con y sin línea en blanco tras el frontmatter.
- [x] 3.3 Configurar `remarkStringifyOptionsCtx` con `bullet: '-'` (fusionando con las opciones por defecto) en la config del editor Milkdown, para emitir bullets `-` en lugar de `*`.
- [x] 3.4 Preservar el frontmatter YAML verbatim: `parseFrontmatter` devuelve `rawYaml`, se guarda en `frontmatterRawText` (carga/edición), y `stringifyWithFrontmatter` lo reutiliza en vez de `stringifyYaml(objeto)`. `toggleFrontmatterEdit`/`onFrontmatterYamlChange` muestran/capturan el texto original.

## 4. Verificación de round-trip y regresión

- [x] 4.1 Verificado en la app (Chrome DevTools, nota `wiki/concepts/colitis-microscopica.md`): el modo raw muestra las listas tight (`blankLineBetweenListItems=false`) y conserva la línea en blanco tras el frontmatter que tenía el original.
- [x] 4.2 Verificado: abrir la nota sin editar deja `isDirty=false` y `frontmatterSeparator="\n\n"`; el round-trip no altera la separación del frontmatter ni infla las listas.
- [x] 4.3 Verificado: una edición en el textarea raw dispara `isDirty` (false→true). Cambio descartado sin guardar (vault intacto).
- [x] 4.4 `eslint` sobre los ficheros del change: 0 errores. `pnpm build`: OK. `ng test`: pasan.
- [x] 4.5 Verificado en la app (misma nota): el modo raw emite bullets `-` (`dashBullets=19`, `asteriskBullets=0`) y sigue tight.
- [x] 4.6 Verificado (diff contra el fichero real del vault): el frontmatter se preserva verbatim (comillas intactas: `keywordsQuoted`/`updatedQuoted` true) y el round-trip es idéntico byte a byte salvo la línea en blanco estándar que Milkdown inserta entre encabezado y lista (Non-Goal).
