# Handoff #4: miMAR — Organización / Refugio + «Mi cuenta» del dueño

> Cuarto y último paquete. Cubre dos cosas: el **back-office de la Organización/Refugio**
> (tier Operador) y el **clúster «Mi cuenta» del dueño** (estética cálida del Owner).

## Overview
Cierra el rediseño de **miMAR** sumando el actor **Organización** (refugios, clínicas, redes
de rescate) por dentro, y completando el lado **Owner** con su zona de cuenta. Con esto, las
5 personas quedan cubiertas: **Owner · Público · Organización · Gobierno · Admin**.

Pantallas (9, en `Organización y Mi Cuenta.html`, 2 secciones):

**Organización / Refugio** (tier Operador, acento teal)
1. Panel del refugio (KPIs · postulaciones a revisar · agenda de hoy · atención · equipo)
2. Mis mascotas (gestión de adopción: publicar / pausar / marcar adoptada / borrador)
3. Adopciones (pipeline de 4 etapas: Nuevas → Revisión → Entrevista → Resueltas)
4. Agenda del día (turnos por hora + selector de días)
5. Equipo y voluntarios (roles: coordinación / vet / tránsito / voluntario)

**Owner — «Mi cuenta»** (estética cálida, submenú lateral)
6. Ajustes (datos personales · notificaciones · seguridad)
7. Tránsitos (hogar temporal: en curso · disponibilidad · historial)
8. Solicitudes recibidas (invitaciones de orgs · aprobar/rechazar)
9. Membresías (orgs de las que el dueño forma parte)

---

## About the Design Files
Referencias en HTML/React+Babel (prototipos), no producción. Recrear en el codebase real
(**Next.js / React + TS**, carpeta `dim/`). Rutas reales: `/org`, `/org/pets`,
`/org/adopciones`, `/org/agenda`, `/org/equipo`, `/cuenta`, `/cuenta/transitos`,
`/cuenta/solicitudes`, `/cuenta/membresias`.

## Fidelity
Alta fidelidad. Placeholders: fotos de mascota/avatares. Reemplazar por reales.

---

## DOS tiers visuales en este paquete
Este handoff toca **dos pieles distintas a propósito**, según quién opera:

### 1) Organización → tier **Operador** (reusa el Handoff #3)
El refugio es un back-office, no un ciudadano: usa el **mismo console azul-marino** que
Gobierno/Admin (clases `.gob*` de `redesign-a-gob.css`). Para distinguirlo del gobierno, el
**rail y el scope chip viran a teal** vía la clase `.gob.is-org` (override en
`redesign-a-org.css`). Todo lo demás (KPIs, tablas, badges, topbar) es idéntico al #3.
> Si ya implementaste el #3, la Organización es ese shell + un acento de color + 5 vistas nuevas.

### 2) «Mi cuenta» del dueño → estética **cálida** (reusa el Handoff #1)
Es parte de la app del Owner: papel cálido, masthead claro, serif. Usa `.dirA*`
(`redesign-a.css`, masthead `AMast`) + clases `.acct*` (`redesign-a-cuenta.css`) para el
layout de cuenta con **submenú lateral**.

| | Organización | Mi cuenta (Owner) |
|---|---|---|
| Raíz | `.gob.is-org` | `.dirA` |
| Chrome | sidebar **teal-oscuro** | masthead claro (azul-900) |
| Lienzo | gris frío `#EEF1F4` | papel cálido `#FBFAF5` |
| CSS | `redesign-a-gob.css` + `redesign-a-org.css` | `redesign-a.css` + `redesign-a-cuenta.css` |

### Tokens nuevos
- **Org**: solo el acento teal del rail — `#0B3B42` (fondo) y `#5FD0B0` (marca/activo). El
  resto son los `--g-*` del Operador (ver Handoff #3).
- **Cuenta**: usa los `--a-*` de «Libreta Nacional» (ver Handoff #1) — azul `#0E5A99`,
  papel `#FBFAF5`, serif IBM Plex, etc. Sin tokens nuevos.

---

## Patrones nuevos a clonar

### Organización
- **Gestión de mascotas** (`.org-petcard`): card con foto, nombre serif, **state-badge**
  (`published/paused/draft/adopted`) y pie con acciones contextuales (Pausar/Reanudar/Publicar/
  Marcar adoptada). Estados → color y acciones distintas.
- **Pipeline de adopciones** (`.org-pipe`): 4 columnas por etapa (Nuevas/Revisión/Entrevista/
  Resueltas), cada postulación es una `.org-appcard` (mascota + postulante + match score).
  Drag entre columnas avanza la etapa (a implementar).
- **Agenda** (`.org-agenda`): grilla hora × slot; turnos `.org-appt` coloreados por tipo
  (vet/adopción/castración/visita). Selector de días `.org-daypills` arriba.
- **Equipo**: filas `.gob-member` + `.org-rolepill` por rol (coordinación/vet/tránsito/voluntario).

### Mi cuenta (Owner)
- **Layout con submenú** (`.acct-layout`): aside sticky (`.acct-side` con ítems + contadores)
  + contenido. El masthead marca "Cuenta" activo. Wrapper `AcctShell({active, crumb})`.
- **Filas de ajuste** (`.acct-setrow`): label mono + valor + acción "Editar". **Prefs**
  (`.acct-pref`) con toggle. **Seguridad** (contraseña, 2FA).
- **Tránsitos**: `.acct-foster` (foster en curso con "desde / N días") + disponibilidad
  (estado, capacidad, preferencias) + historial (adoptados).
- **Solicitudes / Membresías** (`.acct-listcard`): logo + cuerpo (rol propuesto, cita,
  vencimiento) + acciones (Aprobar/Rechazar · Ir al panel/Salir).

---

## Interactions & State
- **Org · mascotas**: estado de publicación (`published/paused/draft/adopted`) define acciones
  y visibilidad en el catálogo público (handoff #2).
- **Org · pipeline**: cada postulación tiene etapa; avanzar notifica al postulante (que lo ve
  en «Mis postulaciones», handoff #2). Match score es heurístico (hogar vs necesidades).
- **Org · agenda**: turnos con tipo + responsable; integra con vet/castración/adopción.
- **Cuenta · tránsitos**: disponibilidad on/off alimenta a las orgs que buscan hogar temporal.
- **Cuenta · solicitudes**: aprobar crea una **membresía** (aparece en Membresías + da acceso
  al panel de esa org). Cada invitación expira.
- **Cross-actor**: una misma persona puede ser dueño Y miembro de orgs → el "Cambiar de org"
  del rail y "Ir al panel" de Membresías son el puente entre las dos pieles.

## Assets
IBM Plex Serif/Sans/Mono + Caveat (Google Fonts) · Font Awesome 4.7.0 (CDN) · fotos = placeholders.

## Files
| Archivo | Contenido |
|---|---|
| `Organización y Mi Cuenta.html` | Entry único (9 pantallas, 2 secciones) |
| `redesign-a.css` / `redesign-a.jsx` | Base Owner «Libreta Nacional» + masthead `AMast` (lo usa Mi cuenta) |
| `redesign-a-gob.css` | Tier Operador (lo usa Organización; ver Handoff #3 para el detalle) |
| `redesign-a-org.css` | Acento teal + pipeline + agenda + gestión de mascotas |
| `redesign-a-org.jsx` | Organización: Panel + Mascotas + Adopciones + Agenda + Equipo |
| `redesign-a-cuenta.css` | Layout de cuenta + settings rows + cards de tránsito/solicitud/membresía |
| `redesign-a-cuenta.jsx` | Mi cuenta: Ajustes + Tránsitos + Solicitudes + Membresías |
| `app-org.jsx` / `design-canvas.jsx` | Entrada del canvas / andamiaje (no portar) |

**Orden de carga** (scope global de Babel): design-canvas → redesign-a.jsx (define `AMast`) →
redesign-a-org.jsx → redesign-a-cuenta.jsx → app-org.jsx. **Preview:** abrir el `.html`.

---

## La serie completa de handoffs
1. **#1 Owner** — inicio, mascotas, perfil (+ perdido/fallecido), libreta, forms.
2. **#2 Público** — portada, catálogos, credencial por tiers, denuncia, transferencias, reclamar.
3. **#3 Gob + Admin** — console operador (panel, cola, expedientes, vigilancia/mapa, forms, acceso).
4. **#4 Organización + Mi cuenta** — este paquete.

Todos comparten la marca «Libreta Nacional» en dos pieles: **cálida** (ciudadanía: Owner/
Público) y **Operador** (back-office: Gobierno/Admin/Organización).
