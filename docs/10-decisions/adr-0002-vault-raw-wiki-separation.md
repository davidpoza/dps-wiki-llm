# ADR-0002: Separacion estricta raw/wiki

- Estado: Registrada por instrucciones del repositorio y reforzada en codigo
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Modelo de conocimiento y mutaciones del vault

## Contexto

El sistema distingue entradas crudas (`raw/**`) de estado curado (`wiki/**`).

## Problema

Si la automatizacion reaccionara tambien a `wiki/**`, podria auto-dispararse, duplicar contenido o corromper estado derivado.

## Opciones consideradas

### Opcion 1

Separar `raw/**` y `wiki/**` y aceptar ingesta solo desde `raw/**`.

### Opcion 2

Ingerir cualquier markdown del vault.

### Opcion 3

Usar una unica carpeta de notas sin capas.

## Decision

Mantener `raw/**` como capa de eventos e indexar/mutar conocimiento en `wiki/**`.

## Justificacion

`SourceNormalizer` rechaza payloads fuera de `raw/**`; `ReindexService` reconstruye indice desde `wiki/**`.

## Consecuencias positivas

- Evita bucles.
- Hace trazable cada source note a un raw artifact.
- Permite reindex determinista.

## Consecuencias negativas

- Requiere disciplina al crear nuevos flujos.
- Los outputs no enriquecen automaticamente la wiki.

## Riesgos

- Cambios futuros que escuchen `wiki/**` violarian el contrato.

## Criterios para revisar esta decision

- Solo si se implementa un mecanismo formal anti-loop y con revision humana.

## Referencias al codigo

- `AGENTS.md`
- `backend/src/main/java/com/dpswikillm/services/SourceNormalizer.java`
- `backend/src/main/java/com/dpswikillm/services/ReindexService.java`

