# ADR-0001: Spring Boot y Angular como stack principal

- Estado: Inferida del repositorio actual
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Plataforma backend/frontend

## Contexto

El repositorio contiene un backend Spring Boot 3.3 Java 21 y un frontend Angular 21 construido y servido por nginx.

## Problema

Se necesita una plataforma web autenticada para operar ingesta, jobs, chat, revision, edicion de vault y configuracion.

## Opciones consideradas

### Opcion 1

Spring Boot + Angular.

### Opcion 2

Backend Node/TypeScript + SPA.

### Opcion 3

Aplicacion monolitica server-rendered.

## Decision

Usar Spring Boot para backend y Angular para frontend.

## Justificacion

El codigo actual ya implementa seguridad, colas, JPA/JDBC, Flyway y servicios de negocio en Spring; Angular implementa SPA con rutas protegidas, PrimeNG y signals.

## Consecuencias positivas

- Separacion clara API/UI.
- Buen soporte para colas, seguridad y migraciones.
- Frontend rico para workflows de revision y edicion.

## Consecuencias negativas

- Dos toolchains y builds.
- Necesidad de mantener contratos DTO/API sincronizados manualmente.

## Riesgos

- Sin tests frontend detectables, cambios UI pueden romper integracion.

## Criterios para revisar esta decision

- Si el frontend deja de necesitar una SPA rica.
- Si el backend requiere una arquitectura reactiva no cubierta por Spring MVC actual.

## Referencias al codigo

- `backend/pom.xml`
- `frontend/package.json`
- `backend/src/main/java/com/dpswikillm/DpsWikiLlmApplication.java`
- `frontend/src/main.ts`

