## ADDED Requirements

### Requirement: Drop-zone enrich/ con subdirectorios por tipo
El sistema SHALL proporcionar el directorio `enrich/` en la raíz del vault con subdirectorios permanentes (`concepts/`, `topics/`, `entities/`, `analyses/`) como zona de entrada para notas antiguas, fuera de `raw/` para evitar colisión con el workflow de ingest.

#### Scenario: Estructura de directorios presente
- **WHEN** el repositorio está inicializado
- **THEN** existen los directorios `enrich/concepts/`, `enrich/topics/`, `enrich/entities/`, `enrich/analyses/`

### Requirement: Detección de fichero nuevo en drop-zone
El workflow n8n SHALL detectar cuando se añade un nuevo fichero `.md` en cualquier subdirectorio de `enrich/` mediante `localFileTrigger` sobre `/data/vault/enrich`.

#### Scenario: Fichero detectado
- **WHEN** el usuario añade `enrich/concepts/mi-nota.md`
- **THEN** el workflow se dispara con la ruta del fichero como parámetro

### Requirement: Mapeo de destino en wiki
El workflow SHALL mapear el fichero de `enrich/<tipo>/` a `wiki/<tipo>/` usando la subcarpeta como indicador del tipo de documento.

#### Scenario: Mapeo correcto
- **WHEN** el fichero está en `enrich/concepts/foo.md`
- **THEN** el destino es `wiki/concepts/foo.md`

#### Scenario: Subcarpeta no reconocida
- **WHEN** el fichero está en `enrich/unknown/foo.md`
- **THEN** el workflow falla con error explícito y NO borra el fichero fuente

### Requirement: Sobreescritura del destino
El workflow SHALL copiar el fichero a `wiki/<tipo>/` sobreescribiendo cualquier versión existente.

#### Scenario: Fichero nuevo en wiki
- **WHEN** `wiki/concepts/foo.md` no existe
- **THEN** se crea con el contenido exacto del fichero fuente

#### Scenario: Fichero ya existe en wiki
- **WHEN** `wiki/concepts/foo.md` ya existe con contenido diferente
- **THEN** se sobreescribe con el contenido del fichero fuente (el usuario confía en la versión que suelta)

### Requirement: Pipeline de enriquecimiento
El workflow SHALL ejecutar en orden: reindex → enrich-links → commit.

#### Scenario: Pipeline completo exitoso
- **WHEN** el fichero se ha copiado a wiki/
- **THEN** se ejecuta reindex, luego enrich-links sobre el fichero destino, luego commit

#### Scenario: Fallo en reindex
- **WHEN** reindex falla
- **THEN** el workflow se detiene, no ejecuta enrich-links, no borra el fichero fuente

### Requirement: Borrado del fichero fuente preservando directorios
El workflow SHALL borrar únicamente el fichero procesado de `enrich//`, sin eliminar el directorio que lo contenía.

#### Scenario: Borrado correcto
- **WHEN** el pipeline completa sin errores
- **THEN** el fichero `enrich//concepts/foo.md` no existe, pero `enrich//concepts/` sí existe

#### Scenario: No borrar en caso de error
- **WHEN** cualquier paso del pipeline falla
- **THEN** el fichero fuente permanece en `enrich//` para reintento manual
