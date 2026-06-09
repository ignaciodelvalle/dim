# Handoff #3: miMAR — Console de Gobierno y Admin («Libreta Nacional · Operador»)

> Tercer paquete de la serie. Cubre el **back-office institucional**: el console de
> **Gobierno** (operación de jurisdicción) y de **Admin** (meta-plataforma).
> Es un **tier visual distinto** del Owner/Público — ver abajo.

## Overview
Rediseño del console operador de **miMAR**. La dirección estética es
**«Libreta Nacional · Operador»**: una variante de back-office de la marca, pensada para
operadores que miran datos densos todo el día. Conserva el ADN (serif IBM Plex + mono +
sellos + expediente) pero cambia el chrome a **institucional oscuro** y el lienzo a un
**gris frío y denso**.

Personas: **Govt** (autoridad sanitaria/fiscalización por jurisdicción) y **Admin/Superadmin**
(plataforma nacional). Incluye el **acceso institucional** (login) compartido por gob/org/admin.

Pantallas (18, en un solo archivo de entrada `Console Gobierno y Admin.html`, 4 secciones):

**Gobierno**
1. Panel de jurisdicción (KPIs meta/delta · cola · audit log · casos · aside)
2. Cola de solicitudes (selección múltiple + barra sticky + tabs por tipo)
3. Detalle de solicitud (review + payload JSON + verificación + decisión firmada)
4. Casos regulatorios (índice unificado)
5. Maltrato — cola de triage (gravedad, asignación)
6. Expediente de maltrato (11 secciones + mapa + evidencia + triage + MPF + normativa)
7. **Vigilancia — mapa multicapa** (maltrato/zoonosis/brotes/pérdidas, capas toggleables)
8. Reglas por jurisdicción
9. Catálogo regulatorio

**Admin**
10. Panel de administración (outbox breach · KPIs · govts/admins · quick tools)
11. Equipo (govts y admins)
12. Moderación (contenido reportado)
13. Jurisdicciones (mapa de cobertura)
14. Sistema / Outbox (salud técnica del despachador de eventos)

**Acceso**
15. Login institucional (gob / organización / plataforma)

**Formularios del operador**
16. Acta de infracción (Gob · Ley 14.346)
17. Declarar brote (Gob · epidemiológico)
18. Nueva cuenta institucional (Admin)

---

## About the Design Files
Referencias de diseño en HTML/React+Babel (prototipos), **no** producción. Recrear en el
codebase real (**Next.js / React + TS**, carpeta `dim/`) con sus componentes y datos.
No portar el design canvas. Rutas reales: `/gob`, `/gob/cola[/token]`, `/gob/casos`,
`/gob/maltrato[/id]`, `/admin`, `/admin/sistema/outbox`, etc.

## Fidelity
Alta fidelidad. Placeholders: mapas (degradé + grilla + pins CSS → proveedor real con
capas), fotos. El JSON del payload es ilustrativo del shape real del evento de cola.

---

## ⚠️ Tier visual SEPARADO — no es la piel del Owner
Este console **NO** usa el papel cálido del Owner/Público. Es un tier propio:

| | Owner / Público | **Operador (este)** |
|---|---|---|
| Chrome | masthead claro | **sidebar + topbar azul-marino `#0A3556`** |
| Lienzo | papel cálido `#FBFAF5` | **gris frío `#EEF1F4`** |
| Densidad | cómoda | **ultra-densa (control-room)** |
| Tipo | serif + sans + mono | igual (serif títulos, **mono protagonista** en datos) |

La razón: separar señaléticamente al operador del ciudadano, y soportar tablas densas.
Tokens en `redesign-a-gob.css`, declarados sobre `.gob` (y re-declarados en
`.gob-sheetwrap` / `.gob-login` para las sheets y el login, que viven fuera de `.gob`).

### Tokens del Operador
| Token | Valor | Uso |
|---|---|---|
| `--g-navy` | `#0A3556` | sidebar, topbar oscuro, scope chip |
| `--g-page` | `#EEF1F4` | lienzo |
| `--g-card` | `#FFFFFF` | tarjetas, filas |
| `--g-ink` / `--g-mute` | `#16252F` / `#66727C` | texto / secundario |
| `--g-azul` | `#0E5A99` | acento primario, links, foco |
| `--g-danger` | `#B71C1C` | peligro, infracción, superadmin |
| `--g-warn` / `--g-ok` / `--g-viol` | `#9C6700` / `#1E7A3E` / `#6A4C93` | estados |
| severidad | crit `#B71C1C` · alta `#DC6E16` · media `#9C6700` · baja `#1E7A3E` | maltrato |
| fuentes | IBM Plex Serif / Sans / **Mono** | títulos / UI / **datos, códigos, tokens** |

Radios 4–8px · sombras suaves frías · líneas hairline. El **chip de scope** (UNIVERSAL /
localidad, o SUPERADMIN en rojo) está siempre en el topbar — comunica el alcance de los datos.

---

## Patrones clave (lo que hay que clonar bien)

### Shell del console (`.gob`)
`<aside.gob-rail>` (secciones + ítems con contador) + `<.gob-main>` con `.gob-topbar`
(breadcrumb + scope chip + acciones) + `.gob-scroll`. El sidebar de Admin agrega un link
cross-portal a Gobierno y el scope chip vira a **SUPERADMIN rojo**. Componentes:
`GobRail({active, admin})`, `GobTopbar`, `GobScope`. La Organización (handoff #4) reusa
este shell con un acento teal — es deliberadamente la misma familia.

### KPI tiles (`.gob-kpi`)
Label mono · número serif grande · variante **target** (barra de progreso a meta) ·
variante **delta** (↑% vs período). Tonos danger/warn/ok pintan fondo + número.

### Cola con selección múltiple
Barra de acción **sticky azul-marino** (`.gob-bulkbar`) que muestra el N seleccionado +
Aprobar/Rechazar en bloque. Filas con checkbox, **kind-badge** (matrícula vet / org / RUPGA),
aplicante + token mono, jurisdicción. Tabs por tipo arriba.

### Review de solicitud + decisión firmada
Secciones: Aplicante · Organización a verificar (def-grid + links a **AFIP** / registro) ·
**Payload** (bloque JSON oscuro) · **Decidir** (notas internas + Rechazar/Aprobar). Pie con
hint de audit (`request_viewed → audit_log`). **Toda decisión queda firmada y auditada.**

### Expediente (case file)
El patrón más rico: eyebrow de severidad + pills, **chip-cards** de resumen, y secciones
apiladas (`GobFSec`-style): Asignación · ¿Qué pasó? · Sujeto · Lugar (mini-mapa) · Evidencia
(filas de archivo) · Reportante (datos enmascarados) · **Acciones de triage** (botones de
color: triada/investigación/escalar/derivar/cerrar/inválida/duplicada) · **Export MPF**
(dossier fiscal) · Línea de tiempo · **Normativa aplicable** (Ley 14.346, etc.).

### Mapa multicapa (Vigilancia) — pieza estrella
`.gob-mapwrap` = mapa + panel de capas. El mapa tiene **heat blobs** (`.gob-heat`) y **pins**
por capa (`.gob-pin[data-layer]`: maltrato rojo, zoonosis violeta, brotes ámbar/cluster,
pérdidas azul). El panel `.gob-layers` lista capas con **toggle on/off** + contador, y stats.
Implementar con el proveedor real (Leaflet/Mapbox) y capas conmutables; el diseño define
colores, leyenda e interacción.

### Formularios del operador (sheets)
`.gob-sheetwrap > .gob-sheet`: header con borde superior de color por categoría (azul/rojo/
ámbar/violeta), cuerpo con **secciones numeradas** (`.gob-fsec` con `01/02/…`), campos
(`.gob-field` + `.gob-input/.gob-select`), opciones radio (`.gob-fopt`), chips, toggles,
callouts y mini-mapa. Pie sticky con CTA. Tres ejemplos:
- **Acta de infracción** — acto sancionatorio: infractor → hecho → antecedentes → sanción
  (apercibimiento/multa en UMA/clausura/suspensión) → notificación + firma.
- **Declarar brote** — enfermedad/severidad → foco + radio de alerta (mini-mapa) → alcance →
  medidas (vacunación obligatoria, cuarentena, restricción de tránsito).
- **Nueva cuenta institucional** — identidad → rol (Govt/Admin) → jurisdicción + localidades →
  permisos (toggles) → invitación por correo (link de un solo uso).

### Acceso institucional (`.gob-login`)
Split: panel izquierdo azul-marino (escudo, "Acceso institucional", los 3 tipos de actor) +
panel derecho con form (correo institucional + contraseña, identidad federada AFIP/MiArgentina).
**Separado del login del dueño** — incluye nota que deriva a `mimar.gob.ar`. Acceso nominal,
por invitación, sin alta pública.

---

## Interactions & State
- **Scope**: govt ve solo su jurisdicción; admin/superadmin ve Universal. El chip de scope y
  los filtros (provincia/localidad/tipo) recortan TODO el dataset de la página.
- **Cola**: selección múltiple → acción en bloque; rechazo exige razón; cada decisión firma + auditea.
- **Expediente**: asignación (tomar/reasignar), triage cambia estado, export MPF genera PDF.
- **Vigilancia**: capas on/off; declarar brote dispara alerta territorial + radio.
- **Outbox**: eventos sin despachar >5 min = breach; reintento con backoff. Cero pérdida.
- Estados de caso: `open · triaged · escalated · in_progress · closed`. Severidad welfare:
  `critical/high/medium/low`. Tipos de cola: `role_upgrade_vet · organization_verification ·
  service_dog_credential_verification`.

## Assets
IBM Plex Serif/Sans/Mono (Google Fonts) · Font Awesome 4.7.0 (CDN) · mapas/QR/fotos = placeholders.

## Files
| Archivo | Contenido |
|---|---|
| `Console Gobierno y Admin.html` | Entry único (18 pantallas, 4 secciones) |
| `redesign-a-gob.css` | Tokens Operador + todo el shell, KPIs, tablas, badges, expediente, **mapa multicapa** |
| `redesign-a-gob-forms.css` | Sheets del operador + **login institucional** (tokens re-declarados) |
| `redesign-a-gob.jsx` | Shell (`GobRail/GobTopbar`) + Panel + Cola + Detalle |
| `redesign-a-gob2.jsx` | Casos + Maltrato + Expediente |
| `redesign-a-gob3.jsx` | Vigilancia (mapa) + Reglas + Catálogo |
| `redesign-a-admin.jsx` | Admin: Panel + Equipo + Moderación + Jurisdicciones + Sistema/Outbox |
| `redesign-a-gob-forms.jsx` | Login + Acta + Brote + Nueva cuenta |
| `app-gob.jsx` / `design-canvas.jsx` | Entrada del canvas / andamiaje de revisión (no portar) |

**Orden de carga** (scope global de Babel): design-canvas → gob → gob2 → gob3 → admin →
gob-forms → app-gob. **Preview:** abrir el `.html` (requiere internet para fuentes/íconos).
