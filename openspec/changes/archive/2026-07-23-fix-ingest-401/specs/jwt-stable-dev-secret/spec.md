## ADDED Requirements

### Requirement: Secreto JWT estable en desarrollo
El sistema SHALL arrancar con un secreto JWT funcional aunque `JWT_SECRET` no esté configurado en el entorno, usando un valor por defecto fijo en `application.yml`.

#### Scenario: Arranque sin JWT_SECRET configurado
- **WHEN** el backend arranca sin la variable de entorno `JWT_SECRET`
- **THEN** el sistema utiliza el secreto por defecto definido en `application.yml` y no genera una clave efímera aleatoria

#### Scenario: Tokens válidos tras reinicio del backend
- **WHEN** el backend se reinicia sin cambiar `JWT_SECRET`
- **THEN** los tokens JWT generados antes del reinicio siguen siendo válidos

#### Scenario: Secreto en producción toma precedencia
- **WHEN** `JWT_SECRET` está configurado en el entorno
- **THEN** el sistema usa ese valor y descarta el secreto por defecto
