## Context

El `ExplorerComponent` actual carga el contenido completo del fichero (incluyendo el bloque frontmatter `--- ... ---`) directamente en Milkdown mediante `replaceAll(content)`. Milkdown interpreta los guiones `---` como reglas horizontales (HR) de CommonMark, convirtiendo el bloque de metadatos en basura visual y permitiendo que el usuario los edite accidentalmente.

El componente mantiene `currentMarkdown` como el string de todo el fichero y lo envía íntegro al backend al guardar. La corrección debe ser transparente para el backend (no hay cambios de API).

## Goals / Non-Goals

**Goals:**
- Extraer el frontmatter YAML del contenido antes de pasarlo a Milkdown.
- Mostrar los metadatos extraídos en un panel colapsable encima del editor (modo lectura).
- Reconstruir el fichero completo (frontmatter + cuerpo editado) al guardar, preservando el bloque original.
- Sin cambios en el backend ni en la API.

**Non-Goals:**
- Edición de los campos frontmatter desde la UI (iteración futura).
- Soporte de TOML frontmatter (solo YAML delimitado por `---`).
- Validación de esquema de frontmatter.

## Decisions

### D1: Parseo con `gray-matter` en el frontend

`gray-matter` (npm) es la librería estándar de parseo de frontmatter en el ecosistema JS. Ofrece `matter(content)` que devuelve `{ data, content }` donde `data` es el objeto YAML y `content` es el cuerpo sin el bloque `---`. Alternativa descartada: regex manual (`/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/`) — frágil ante espacios inconsistentes o frontmatter vacío.

### D2: Separación de estado en `ExplorerComponent`

Se añaden dos señales nuevas en `ExplorerComponent`:
- `frontmatter = signal<Record<string, unknown>>({})` — datos YAML parseados.
- El `currentMarkdown` existente pasa a contener **únicamente el cuerpo** (sin frontmatter).

Al cargar un fichero: `const { data, content } = matter(rawContent)` → `frontmatter.set(data)`, luego `replaceAll(content)`.  
Al guardar: si `Object.keys(frontmatter()).length > 0`, se prepondera el bloque YAML reconstruido:

```
---
<yaml serializado con js-yaml o gray-matter.stringify>
---

<body de Milkdown>
```

`gray-matter` incluye `gray-matter/lib/stringify` que puede usarse para serialización. Alternativamente, `js-yaml` (ya disponible como transitive dependency de `gray-matter`).

### D3: Panel de metadatos como sección inline (no componente separado)

Dado que `ExplorerComponent` es standalone y compacto, el panel de frontmatter se implementa como una sección dentro del mismo template, controlada por una señal `showFrontmatter = signal(true)`. Un componente separado añadiría overhead de comunicación innecesario para la iteración actual.

El panel mostrará los pares clave-valor con `@for (entry of frontmatterEntries()) ...` donde `frontmatterEntries` es una señal computada (`computed(() => Object.entries(frontmatter()))`).

### D4: Serialización al guardar con `gray-matter.stringify`

`matter.stringify(body, data)` reconstruye correctamente el fichero completo. Si `data` está vacío, devuelve solo el body sin bloque `---`, preservando ficheros sin frontmatter.

## Risks / Trade-offs

- **Riesgo: frontmatter editado se pierde** → El usuario edita el cuerpo en Milkdown pero el frontmatter es read-only. Al guardar, se reconstruye con el frontmatter original en memoria. Si el usuario recarga la página sin guardar, los cambios del cuerpo se pierden (comportamiento preexistente, no nuevo).

- **Riesgo: `gray-matter` bundle size** → ~8 KB gzipped, aceptable. No impacta métricas de rendimiento de forma significativa.

- **Riesgo: ficheros sin frontmatter** → `gray-matter` devuelve `data: {}` y `content: <contenido completo>`. La señal `frontmatter` queda vacía y el panel no se muestra. El comportamiento del editor no cambia.

- **Trade-off: no se preservan comentarios YAML** → Si el frontmatter original tiene comentarios YAML (`# comentario`), `gray-matter.stringify` los perderá al serializar el objeto parseado. Aceptable para esta iteración.
