## Context

`FileService.exportPdf` llama a `stripDuplicateFrontmatterTitle` antes de invocar pandoc. El método actual extrae el valor de `title` del frontmatter y lo compara con el texto exacto de cualquier heading del cuerpo. Si coincide, elimina la línea `title:` del frontmatter.

El problema: pandoc `--standalone` siempre renderiza el `title` del frontmatter como bloque de título independiente. Si la nota tiene un H1 cuyo texto no coincide literalmente con `title` (alias, versión corta, etc.), el PDF sigue mostrando ambos encabezados.

La regla correcta es más simple: si existe cualquier H1 en el cuerpo, el frontmatter no debe incluir `title`.

## Goals / Non-Goals

**Goals:**
- Suprimir `title` del frontmatter cuando el cuerpo contenga al menos un heading de nivel 1 (`# …`).
- Conservar `title` en el frontmatter cuando no haya ningún H1 (la nota solo tiene frontmatter como fuente del título).

**Non-Goals:**
- No afectar el comportamiento con headings de nivel 2–6.
- No cambiar el pipeline de pandoc ni el CSS del PDF.
- No alterar cómo se almacena o muestra el título en la UI web.

## Decisions

### Cambio de condición en `bodyContainsHeading` → `bodyHasH1`

**Opción A (elegida):** Añadir un nuevo patrón `H1_HEADING` que solo reconoce `# texto` (exactamente un `#`). Reemplazar `bodyContainsHeading(body, title)` por `bodyHasH1(body)`.

```
Pattern H1_HEADING = Pattern.compile("^#[ \\t]+.+", Pattern.MULTILINE);

private boolean bodyHasH1(String body) {
    return H1_HEADING.matcher(body).find();
}
```

El patrón `^#[ \\t]+.+` exige exactamente un `#` seguido de espacio/tab y al menos un carácter. No matchea `##`, `###`, etc.

**Opción B:** Reutilizar `BODY_HEADING` filtrando solo los grupos capturados que empiecen sin `#`. Descartada: más compleja, mezcla lógica de nivel con la de captura.

**Opción C:** Contar los `#` iniciales del grupo capturado por `BODY_HEADING`. Descartada: igualmente confusa y requiere cambiar el patrón o post-procesar.

Opción A es la más legible y directa.

### Simplificación: eliminar el parámetro `title` de la comprobación

Con el nuevo criterio ya no necesitamos pasar `title` a la función de comprobación. `stripDuplicateFrontmatterTitle` puede extraer el título solo para comprobar que no está vacío, y luego delegar en `bodyHasH1(body)`.

## Risks / Trade-offs

- **Notas sin H1 pero con frontmatter `title`** → siguen funcionando igual (título solo desde frontmatter). Sin cambio.
- **Notas con H1 cuyo texto es diferente al `title` del frontmatter** → antes mostraban doble título; ahora solo muestran el H1 del cuerpo. Comportamiento correcto.
- **Notas sin frontmatter** → `stripDuplicateFrontmatterTitle` devuelve el markdown sin cambios. Sin cambio.
- **Riesgo menor:** Si una nota tiene H1 en el cuerpo pero el usuario quería que el `title` del frontmatter también apareciera como bloque separado, este cambio lo eliminaría. Asumimos que ese caso no es el objetivo del producto.
