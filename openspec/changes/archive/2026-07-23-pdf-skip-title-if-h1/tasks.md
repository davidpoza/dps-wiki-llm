## 1. Implementación en FileService

- [x] 1.1 Añadir constante `H1_HEADING` en `FileService.java`: `Pattern.compile("^#[ \\t]+.+", Pattern.MULTILINE)`
- [x] 1.2 Añadir método privado `bodyHasH1(String body)` que retorne `true` si `H1_HEADING` encuentra al menos una coincidencia
- [x] 1.3 En `stripDuplicateFrontmatterTitle`, reemplazar la llamada `!bodyContainsHeading(body, title)` por `!bodyHasH1(body)`
- [x] 1.4 Eliminar el método privado `bodyContainsHeading(String body, String title)` ya que queda sin uso

## 2. Tests en FileServiceTests

- [x] 2.1 Actualizar el test existente de "H1 con mismo texto que el title" para verificar que sigue suprimiendo el frontmatter title
- [x] 2.2 Añadir test: nota con H1 de texto distinto al `title` del frontmatter → frontmatter title suprimido
- [x] 2.3 Verificar que el test existente de "title solo en frontmatter sin heading coincidente" ahora valida que el title se conserva (body sin H1)
- [x] 2.4 Añadir test: nota con solo H2/H3/H4/H5/H6 en el body → frontmatter title conservado
- [x] 2.5 Verificar que el test de "sin frontmatter" sigue pasando sin cambios
