## Context

El frontend Angular corre en el puerto 4200 en desarrollo y reenvía las rutas `/api/**` al backend Spring Boot (puerto 8090) mediante `proxy.conf.json`. El servicio `ApiService.getActuatorInfo()` llama a `/actuator/info` (sin prefijo `/api`), por lo que en desarrollo la petición llega al servidor Vite y devuelve HTML → `info.build?.version` es `undefined` → fallback a 'N/D'.

En producción, el frontend se sirve desde el mismo host que el backend, así que `/actuator/info` resuelve correctamente.

## Goals / Non-Goals

**Goals:**
- Que `/actuator/info` se reenvíe al backend en el entorno de desarrollo

**Non-Goals:**
- Cambiar el comportamiento en producción
- Mover el endpoint de actuator a `/api/actuator`

## Decisions

### D1: Añadir `/actuator` al proxy de desarrollo

Actualizar `proxy.conf.json` añadiendo una entrada para `/actuator` con el mismo target que `/api`. Es el cambio mínimo, no requiere modificar backend ni frontend Angular.

Alternativa descartada: crear un endpoint `/api/info` en Spring Boot → más trabajo, innecesario dado que el endpoint actuator ya existe y funciona bien en producción.

## Risks / Trade-offs

- [Sin riesgo apreciable] La ruta `/actuator` solo expone `health` e `info` (configurado en `application.yml`). Añadirla al proxy de desarrollo no abre más superficie de ataque en producción.
