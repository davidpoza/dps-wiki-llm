# ADR-0005: Cliente LLM OpenAI-compatible

- Estado: Inferida del codigo actual
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Integracion IA

## Contexto

El sistema usa LLM para source notes, planes, respuestas, keywords, deduplicacion y explicacion de enlaces.

## Problema

El proveedor debe poder cambiarse sin reescribir cada servicio.

## Opciones consideradas

### Opcion 1

Cliente OpenAI-compatible configurable.

### Opcion 2

SDK especifico de un proveedor.

### Opcion 3

LLM local acoplado a un runtime concreto.

## Decision

Encapsular chat completions en `LlmClient` con implementacion `OpenAiCompatibleLlmClient`.

## Justificacion

Los servicios consumen `LlmClient`; base URL, modelo y API key vienen de configuracion.

## Consecuencias positivas

- Portabilidad entre proveedores compatibles.
- Tests pueden sustituir el cliente.

## Consecuencias negativas

- Solo cubre formato de chat completions compatible.
- No modela capacidades especificas por proveedor.

## Riesgos

- Diferencias de soporte de `response_format` pueden afectar `chatJson`.

## Criterios para revisar esta decision

- Si se necesita tool calling, structured outputs estrictos o streaming de proveedor especifico.

## Referencias al codigo

- `backend/src/main/java/com/dpswikillm/services/LlmClient.java`
- `backend/src/main/java/com/dpswikillm/services/OpenAiCompatibleLlmClient.java`
- `backend/src/main/java/com/dpswikillm/config/AppProperties.java`

