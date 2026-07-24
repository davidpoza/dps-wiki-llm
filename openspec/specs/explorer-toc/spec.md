# explorer-toc Specification

## Purpose
TBD - created by syncing change explorer-sidebar-toc.
## Requirements
### Requirement: Sidebar con modo archivos y modo TOC
El sidebar del explorer SHALL ofrecer dos modos de panel excluyentes activables desde la toolbar lateral: modo **archivos** (muestra el árbol de ficheros) y modo **TOC** (muestra la tabla de contenido del fichero abierto). Ambos iconos funcionan como toggle: si el modo ya está activo y se pulsa de nuevo, el panel se colapsa.

#### Scenario: Activar modo archivos desde panel colapsado
- **WHEN** el panel está colapsado y el usuario pulsa el icono de archivos
- **THEN** el panel se expande mostrando el árbol de ficheros (`p-tree`)

#### Scenario: Colapsar panel pulsando el icono activo (archivos)
- **WHEN** el panel muestra el árbol de ficheros y el usuario pulsa el icono de archivos
- **THEN** el panel se colapsa

#### Scenario: Cambiar de archivos a TOC
- **WHEN** el panel muestra el árbol de ficheros y el usuario pulsa el icono de TOC
- **THEN** el panel cambia a mostrar la tabla de contenido sin colapsarse

#### Scenario: Activar modo TOC desde panel colapsado
- **WHEN** el panel está colapsado y el usuario pulsa el icono de TOC
- **THEN** el panel se expande mostrando la tabla de contenido

#### Scenario: Colapsar panel pulsando el icono activo (TOC)
- **WHEN** el panel muestra la TOC y el usuario pulsa el icono de TOC
- **THEN** el panel se colapsa

#### Scenario: Icono activo resaltado
- **WHEN** el panel está en modo archivos o TOC
- **THEN** el icono correspondiente al modo activo SHALL mostrar un estado visual distinto (p.ej. color primario o fondo resaltado)

### Requirement: Tabla de contenido extraída del documento abierto
Cuando el panel está en modo TOC, SHALL mostrar la lista de encabezados H1–H6 del fichero markdown actualmente abierto, con indentación visual proporcional al nivel del encabezado.

#### Scenario: Fichero con encabezados
- **WHEN** hay un fichero abierto con encabezados markdown (`# Título`, `## Sección`, etc.)
- **THEN** el panel TOC muestra cada encabezado como elemento clickable, indentado según su nivel (H1 sin indent, H2 un nivel, etc.)

#### Scenario: Fichero sin encabezados
- **WHEN** hay un fichero abierto sin encabezados markdown
- **THEN** el panel TOC muestra el mensaje "Sin encabezados"

#### Scenario: Sin fichero abierto
- **WHEN** el panel está en modo TOC y no hay ningún fichero seleccionado
- **THEN** el panel TOC muestra el mensaje "Abre un fichero para ver su índice"

#### Scenario: TOC actualizada en tiempo real
- **WHEN** el usuario edita el contenido del fichero añadiendo o eliminando encabezados
- **THEN** la TOC SHALL reflejar los cambios sin requerir acción adicional del usuario

### Requirement: Navegación por ancla desde la TOC
El usuario SHALL poder pulsar cualquier encabezado de la TOC para que el editor haga scroll suave hasta el inicio de ese encabezado.

#### Scenario: Click en encabezado visible
- **WHEN** el usuario pulsa un encabezado en la TOC
- **THEN** el editor hace scroll suave (`behavior: 'smooth'`) hasta el elemento `h1`–`h6` correspondiente dentro del área de edición

#### Scenario: Click en encabezado duplicado
- **WHEN** el documento tiene dos encabezados con el mismo texto y el usuario pulsa el primero de la lista
- **THEN** el editor hace scroll hasta el primer encabezado con ese texto en el documento
