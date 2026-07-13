## ADDED Requirements

### Requirement: Sin literales hardcodeados en templates

Todos los componentes Angular SHALL sustituir los textos visibles en sus templates por el pipe `transloco` o la directiva `[transloco]`. No SHALL existir ningún string de texto visible al usuario escrito directamente en el HTML del template.

Componentes afectados: `login`, `home`, `chat`, `ingest`, `jobs-viewer`, `review`, `git-history`, `explorer`.

#### Scenario: Texto interpolado en template usa pipe transloco

- **WHEN** un template contiene texto visible al usuario como `{{ 'someText' }}` o contenido estático
- **THEN** ese texto se sustituye por `{{ 'namespace.key' | transloco }}`

#### Scenario: Atributos de PrimeNG usan binding con pipe

- **WHEN** un componente PrimeNG tiene `label="Sign in"`, `placeholder="..."`, `title="..."` u `header="..."`
- **THEN** se convierte a `[label]="'login.signIn' | transloco"` usando property binding

#### Scenario: TranslocoPipe importado en cada componente standalone

- **WHEN** un componente standalone usa el pipe `transloco` en su template
- **THEN** `TranslocoPipe` aparece en el array `imports` del componente

### Requirement: Claves de interpolación para textos con variables

Los textos que incluyan valores dinámicos SHALL usar la sintaxis de interpolación de Transloco `{{ varName }}` en el fichero JSON y pasar el objeto de parámetros al pipe.

#### Scenario: Texto con jobId usa interpolación

- **WHEN** el template de ingest muestra "Job enqueued: <id>"
- **THEN** la clave JSON es `"jobEnqueued": "Job encolado: {{ id }}"` y el template usa `{{ 'ingest.jobEnqueued' | transloco: { id: lastJobId() } }}`

#### Scenario: Texto con nombre de fichero usa interpolación

- **WHEN** explorer muestra "Fichero renombrado a <nombre>"
- **THEN** la clave usa `{{ name }}` y el código TS pasa `{ name: newName }` al método `translate`
