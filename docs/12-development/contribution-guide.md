# Guia de contribucion

No se detecta una guia formal de contribucion ni CI en el repositorio. Estas reglas derivan de la arquitectura existente:

- Cambios funcionales deben incluir pruebas en backend o web-extractor cuando haya logica observable.
- No editar migraciones Flyway ya aplicadas; crear una nueva migracion.
- No escribir fuera del vault ni aceptar paths absolutos.
- No crear `wiki/topics/**` desde automatizacion.
- Mantener prompts editables en `llm_prompts` mediante migraciones.
- Documentar cualquier nueva decision arquitectonica con un ADR.
- Ejecutar los comandos de test/build relevantes antes de integrar.

Fuente: convenciones observadas en `backend/src/main/resources/db/migration/**`, tests y servicios.

