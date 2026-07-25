# ADR-0009: Microservicio browser-based para extraccion web

- Estado: Inferida del codigo actual
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Ingesta web

## Contexto

Las URLs pueden ser HTML dinamico, PDF, YouTube o articulos NCBI.

## Problema

La ingesta necesita markdown estructurado y metadatos sin acoplar Playwright al backend Java.

## Opciones consideradas

### Opcion 1

Microservicio Node/Fastify con Playwright y extractores especializados.

### Opcion 2

Fetch HTML simple desde backend.

### Opcion 3

Ingesta manual sin extractor.

## Decision

Usar `web-extractor` como contenedor separado.

## Justificacion

El servicio maneja `/extract`, `/extract/file`, `/render`, Readability/Turndown, PDF, YouTube y NCBI.

## Consecuencias positivas

- Mejor fidelidad en paginas renderizadas.
- Dependencias Playwright/yt-dlp aisladas del backend.
- Tests propios por fixtures.

## Consecuencias negativas

- Otro runtime y contenedor.
- Browser rendering consume memoria.

## Riesgos

- Sitios externos pueden bloquear o cambiar comportamiento.

## Criterios para revisar esta decision

- Si las fuentes pasan a ser solo documentos locales o APIs estructuradas.

## Referencias al codigo

- `web-extractor/src/server.js`
- `web-extractor/src/renderer.js`
- `web-extractor/src/extract.js`
- `backend/src/main/java/com/dpswikillm/services/WebExtractorClient.java`

