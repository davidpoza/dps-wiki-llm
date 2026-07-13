## 1. Base de datos — Migración Flyway

- [x] 1.1 Crear `V8__llm_prompts.sql`: tabla `llm_prompts` (key PK, name, text, updated_at) e insertar los tres prompts iniciales (`source-note-system`, `mutation-plan-system`, `answer-system`) con sus textos actuales hardcodeados

## 2. Backend — Capa de dominio y repositorio

- [x] 2.1 Crear clase de dominio `LlmPrompt` (record o entity JPA) con campos: `key`, `name`, `text`, `updatedAt`
- [x] 2.2 Crear `LlmPromptRepository` (Spring Data JPA o JDBC) con métodos `findAll()` y `findByKey(String key)`
- [x] 2.3 Crear `LlmPromptUpdateRequest` DTO con campo `text`
- [x] 2.4 Crear `LlmPromptDto` DTO de respuesta con campos `key`, `name`, `text`, `updatedAt`

## 3. Backend — PromptService con caché

- [x] 3.1 Crear `PromptService` que carga todos los prompts al arranque en un `ConcurrentHashMap`
- [x] 3.2 Añadir método `getText(String key)` que devuelve el texto desde caché (lanza excepción si clave no existe)
- [x] 3.3 Añadir método `updateText(String key, String newText)` que actualiza en BD e invalida la caché

## 4. Backend — PromptController

- [x] 4.1 Crear `PromptController` con endpoint `GET /api/settings/prompts` que devuelve lista de `LlmPromptDto`
- [x] 4.2 Añadir endpoint `GET /api/settings/prompts/{key}` que devuelve un único `LlmPromptDto` (404 si no existe)
- [x] 4.3 Añadir endpoint `PUT /api/settings/prompts/{key}` con body `LlmPromptUpdateRequest` que llama a `PromptService.updateText()` (404 si clave no existe)
- [x] 4.4 Asegurar que los endpoints de `/api/settings/**` están protegidos en `SecurityConfig` (requieren JWT)

## 5. Backend — Refactorización de servicios LLM

- [x] 5.1 Inyectar `PromptService` en `SourceNoteLlmService` y reemplazar el literal hardcodeado por `promptService.getText("source-note-system")`
- [x] 5.2 Inyectar `PromptService` en `LlmMutationPlanService` y reemplazar el literal hardcodeado por `promptService.getText("mutation-plan-system")`
- [x] 5.3 Inyectar `PromptService` en `AnswerPipelineService` y reemplazar el literal hardcodeado por `promptService.getText("answer-system")`

## 6. Frontend — ApiService

- [x] 6.1 Añadir método `getPrompts(): Observable<Prompt[]>` en `ApiService` que llama a `GET /api/settings/prompts`
- [x] 6.2 Añadir método `updatePrompt(key: string, text: string): Observable<Prompt>` que llama a `PUT /api/settings/prompts/{key}`
- [x] 6.3 Definir interfaz `Prompt` con campos `key`, `name`, `text`, `updatedAt`

## 7. Frontend — SettingsComponent

- [x] 7.1 Crear `settings.component.ts` con formulario reactivo que lista todos los prompts con nombre y textarea editable
- [x] 7.2 Añadir botón "Guardar" por cada prompt que llama a `updatePrompt()` y muestra feedback visual (éxito/error)
- [x] 7.3 Crear estilos básicos para el componente de settings (puede reutilizar estilos existentes del proyecto)

## 8. Frontend — Routing y navegación

- [x] 8.1 Añadir ruta `/settings` en `app.component.ts` (o donde estén las rutas) protegida con `AuthGuard`
- [x] 8.2 Añadir enlace "Configuración" en la barra de navegación principal, visible solo para usuarios autenticados

## 9. Verificación

- [x] 9.1 Arrancar la aplicación y verificar que la migración V8 se aplica correctamente y la tabla contiene los tres prompts
- [x] 9.2 Probar `GET /api/settings/prompts` desde la UI o con curl y confirmar que devuelve los tres prompts
- [x] 9.3 Probar `PUT /api/settings/prompts/source-note-system` con un texto nuevo y confirmar que la siguiente llamada LLM usa el nuevo prompt
- [x] 9.4 Verificar que la pantalla `/settings` carga y muestra los prompts, y que el guardado funciona con feedback visual

