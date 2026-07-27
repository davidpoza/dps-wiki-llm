## ADDED Requirements

### Requirement: Campo de umbral de similitud en Settings

La pantalla Settings SHALL mostrar un campo numérico "Umbral de similitud de enlace" en la pestaña Datos, con valor entre 0.00 y 1.00 (step 0.01), valor por defecto 0.72. El campo SHALL leer el valor actual desde `GET /settings/link-threshold` y guardar cambios via `PUT /settings/link-threshold`. Un texto de ayuda SHALL indicar que valores más bajos generan más sugerencias de enlace con menor precisión.

#### Scenario: Valor inicial cargado desde el backend

- **WHEN** el usuario abre la pantalla Settings
- **THEN** el campo "Umbral de similitud de enlace" muestra el valor almacenado en `app_settings` para la key `link.similarity-threshold`, o 0.72 si no está configurado

#### Scenario: Guardar nuevo umbral

- **WHEN** el usuario modifica el campo y hace clic en "Guardar"
- **THEN** el frontend llama a `PUT /settings/link-threshold` con el nuevo valor
- **THEN** se muestra confirmación de guardado

#### Scenario: Validación de rango

- **WHEN** el usuario introduce un valor fuera del rango [0.00, 1.00]
- **THEN** el campo muestra un error de validación y el botón "Guardar" queda deshabilitado

### Requirement: Endpoints backend para link.similarity-threshold

El backend SHALL exponer:
- `GET /settings/link-threshold` → `{ "threshold": 0.72 }`
- `PUT /settings/link-threshold` con body `{ "threshold": 0.80 }` → `200 OK`

Los endpoints SHALL usar `AppSettingRepository` para leer/escribir la key `link.similarity-threshold`.

#### Scenario: GET devuelve valor por defecto cuando no está configurado

- **WHEN** no existe la key `link.similarity-threshold` en `app_settings`
- **THEN** `GET /settings/link-threshold` devuelve `{ "threshold": 0.72 }`

#### Scenario: PUT persiste el valor

- **WHEN** se llama a `PUT /settings/link-threshold` con `{ "threshold": 0.85 }`
- **THEN** el valor 0.85 queda guardado en `app_settings` con key `link.similarity-threshold`
- **THEN** las siguientes ejecuciones de link discovery usan 0.85 como umbral

### Requirement: LinkDiscoveryService lee umbral desde app_settings

`LinkDiscoveryService` SHALL leer el umbral mínimo de similitud desde `app_settings` con key `link.similarity-threshold` en cada invocación del método `discover()`, con fallback a 0.72 si el valor no existe o no es parseable como double.

#### Scenario: Umbral dinámico aplicado en el descubrimiento

- **WHEN** `link.similarity-threshold` está configurado a 0.80 en `app_settings`
- **AND** se ejecuta un link discovery para una nota
- **THEN** solo se retornan candidatos con score >= 0.80
