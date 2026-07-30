## ADDED Requirements

### Requirement: El buscador reconoce la sintaxis de propiedades `[clave: valor]`

El sistema SHALL interpretar dentro del input del modal de búsqueda global cualquier token con la forma `[clave: valor]` como un filtro de propiedad de frontmatter, separándolo del texto libre de búsqueda. El sistema SHALL admitir cero o más filtros en una misma consulta y SHALL tratar el resto del texto (fuera de los corchetes) como consulta de texto libre.

#### Scenario: Token de propiedad combinado con texto libre

- **WHEN** el usuario escribe `productividad [type: source]` en el buscador
- **THEN** el sistema busca notas cuyo texto coincide con `productividad` Y cuyo frontmatter tiene la propiedad `type` con valor que contiene `source`

#### Scenario: Solo filtros sin texto libre

- **WHEN** el usuario escribe `[type: topic]` sin más texto
- **THEN** el sistema devuelve todas las notas cuyo frontmatter `type` contiene `topic`, sin exigir coincidencia de texto libre

#### Scenario: Varios filtros se combinan con AND

- **WHEN** el usuario escribe `[type: source] [author: David]`
- **THEN** el sistema devuelve solo las notas cuyo frontmatter satisface AMBOS filtros

#### Scenario: Espacios flexibles dentro del token

- **WHEN** el usuario escribe `[type:source]` o `[ type : source ]`
- **THEN** el sistema interpreta ambos como el filtro `type` = `source`

---

### Requirement: La comparación de valores es parcial e insensible a mayúsculas y acentos

El sistema SHALL comparar el valor del filtro contra el valor de la propiedad del frontmatter mediante coincidencia por subcadena (contains), ignorando mayúsculas/minúsculas y acentos (comparación case- y accent-insensitive).

#### Scenario: Coincidencia parcial

- **WHEN** el filtro es `[type: sou]` y una nota tiene `type: "source"`
- **THEN** la nota se incluye en los resultados

#### Scenario: Insensible a mayúsculas

- **WHEN** el filtro es `[tags: Prod]` y una nota tiene un tag `productivity`
- **THEN** la nota se incluye en los resultados

#### Scenario: Valor que no coincide

- **WHEN** el filtro es `[type: concept]` y una nota tiene `type: "source"`
- **THEN** la nota NO se incluye en los resultados

---

### Requirement: Los filtros funcionan sobre propiedades de valor lista

El sistema SHALL considerar que un filtro coincide cuando la propiedad del frontmatter es una lista y **al menos un** elemento de la lista satisface la comparación parcial.

#### Scenario: Coincidencia con un elemento de la lista

- **WHEN** el filtro es `[keywords: probiotics]` y una nota tiene `keywords: ["probiotics", "prebiotics"]`
- **THEN** la nota se incluye en los resultados

#### Scenario: Ningún elemento coincide

- **WHEN** el filtro es `[keywords: cooking]` y una nota tiene `keywords: ["probiotics", "prebiotics"]`
- **THEN** la nota NO se incluye en los resultados

---

### Requirement: El frontmatter se indexa de forma estructurada

El sistema SHALL almacenar el frontmatter parseado de cada nota del vault como datos estructurados consultables (además del `body` en crudo), tanto en el reindexado completo como en el indexado incremental por nota, de modo que las claves y valores del frontmatter estén disponibles para filtrar sin re-parsear el `body`.

#### Scenario: Reindexado completo puebla el frontmatter

- **WHEN** se ejecuta el reindexado del vault
- **THEN** cada documento indexado conserva su frontmatter parseado disponible para el filtrado

#### Scenario: Indexado incremental de una nota editada

- **WHEN** una nota se crea o edita y se reindexa de forma incremental
- **THEN** su frontmatter estructurado se actualiza de forma consistente con el reindexado completo

#### Scenario: Nota sin frontmatter

- **WHEN** una nota no tiene bloque de frontmatter
- **THEN** el documento se indexa con un frontmatter vacío y no coincide con ningún filtro de propiedad

---

### Requirement: El endpoint de lookup acepta filtros de frontmatter

El sistema SHALL exponer en `GET /api/files/lookup` la posibilidad de enviar cero o más filtros de propiedad de frontmatter, y SHALL devolver únicamente las notas que satisfacen la consulta de texto (si la hay) Y todos los filtros de propiedad. Cuando no se envían filtros, el endpoint SHALL comportarse igual que antes de este cambio.

#### Scenario: Lookup solo con texto (retrocompatible)

- **WHEN** se llama a `/api/files/lookup?q=productividad` sin filtros
- **THEN** el resultado es idéntico al comportamiento previo (búsqueda por texto sobre path/title/body)

#### Scenario: Lookup con filtro de frontmatter

- **WHEN** se llama al lookup con texto `productividad` y filtro `type=source`
- **THEN** el backend devuelve solo notas cuyo texto coincide con `productividad` y cuyo frontmatter `type` contiene `source`

#### Scenario: Lookup solo con filtros

- **WHEN** se llama al lookup con filtro `type=topic` y sin texto
- **THEN** el backend devuelve todas las notas cuyo frontmatter `type` contiene `topic`, respetando el límite solicitado

---

### Requirement: El modal muestra los filtros activos y su estado

El sistema SHALL indicar visualmente en el modal de búsqueda los filtros de propiedad activos que ha extraído del input (por ejemplo, como chips `clave: valor`), de forma que el usuario distinga la parte de texto de los filtros aplicados.

#### Scenario: Chips de filtros activos

- **WHEN** el usuario ha escrito `[type: source] [tags: productivity]`
- **THEN** el modal muestra dos indicadores de filtro (`type: source` y `tags: productivity`)

#### Scenario: Sin resultados con filtros aplicados

- **WHEN** los filtros activos no coinciden con ninguna nota
- **THEN** el modal muestra el mensaje de "sin resultados" ya existente
