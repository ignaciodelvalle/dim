# Pantallas pendientes — claude.ai/design

**Fecha:** 2026-05-26 (revisado tras cross-check con boards JSX)
**Companion de:** `plan-cc-2026-05-26.md`, `spec-claude-design.md`, `diseño-backlog-2026-05-26.md`
**Total real:** ~39 pantallas faltantes — agrupadas en 7 tandas paste-ready.

## Cambios en esta revisión

Después de hacer grep contra los 30+ boards JSX en `C:\Users\ignac\Downloads\Pantallas`, detecté **3 falsos positivos** que NO necesitan diseño nuevo:

| Antes listado como pendiente | Estado real | Razón |
|---|---|---|
| `/org/[orgToken]/pets/no-aptas` (era TANDA 6.3) | **Cubierto por F4.3 del plan CC** | Es tab/filtro dentro de `board-org-pets.jsx`. CC lo agrega al portar. |
| `/gob/vigilancia/brotes` (era en TANDA 7) | **Cubierto por F4.8 del plan CC** | Sección dentro de `board-gob-caba.jsx`. Anchor o filtro, no página. |
| `/gob/vigilancia/zoonosis` (era en TANDA 7) | **Cubierto por F4.8** | Idem brotes. |
| `/org/[orgToken]/admin/permisos` (era TANDA 6.16) | **AMBIGUO** | Probable que ya esté en `board-org-equipo.jsx`. Verificar antes de diseñar. |

Confirmaciones que sí siguen pendientes:
- `/adoptar/[petToken]` (TANDA 2.1) → confirmado por comentario en `board-public-adoptar.jsx`: "Click card → /adoptar/[petToken] → eventually public credential /p/[token]". Es página intermedia, no redundante.
- Tab Vacunas del pet detail → confirmado pendiente; el plan F3.4 lo marca como TODO.

## Cómo usar este doc

1. **Una vez** al inicio de la sesión de claude.ai/design, pegá el `spec-claude-design.md` completo + este preamble:

```
Estamos completando MiMAR. Ya tenés (de sesiones anteriores) los 30+ board JSX que cubren owner, org, gob, admin, public. Usan poncho.css con #0072b8 + Lora/Montserrat. La taxonomía de estados visibles ahora es solo 4: ok / lost / found / deceased.

Mantené EXACTAMENTE el mismo estilo, paleta, sidebar, topbar, cards, sheets y patterns que tus boards ya tienen. Las pantallas que te voy a pedir se integran al mismo sistema y deben verse indistinguibles.

Formato del archivo: HTML standalone que carga poncho.css + Lora/Montserrat por Google Fonts + FontAwesome 4.7.0 + React/Babel inline (mismo shell que Owner Screens.html). El componente principal va en un board-XXX.jsx adjunto que vos también me devolvés.

Confirmá y te paso la primera pantalla.
```

2. Pegá las pantallas **una a la vez** o **en grupos de 3-4 max** del orden de abajo. Cada pantalla tiene el spec listo entre code fences.

3. Cuando te devuelva el HTML+JSX, guardalo en `C:\Users\ignac\Downloads\Pantallas\` con el naming `board-NOMBRE.jsx` y un shell HTML.

4. Cuando termines una tanda, decime "tanda X lista" y agendamos su PR correspondiente en CC.

---

# TANDA 1 — Auth + Cuenta + Reclamar (7 pantallas)

Habilita Fase 6 del plan CC. Sin estas pantallas no hay demo end-to-end.

## 1.1 · `/login`

```
PANTALLA: Login
ARCHIVO: board-auth-login.jsx + shell auth-login.html
PATH: /login
ROL: anónimo (auth)

INTENT: dueño/vet/org/gob inicia sesión.

LAYOUT (standalone, sin sidebar):
- Centrado vertical max-w-sm sobre fondo var(--p-bg).
- Brand "MiMAR" arriba (Lora 22 #0072b8 + sub "Mi Mascota Arg.").
- H1 "Iniciar sesión" + helper variable ("Bienvenido de vuelta" / "Iniciá sesión para continuar con tu postulación" si ?intent=apply).
- Botón "Conectar con Mi Argentina (próximamente)" disabled, con ícono escarapela.
- Divider con la palabra "o".
- Form: label "Tu correo" → input email; label "Tu contraseña" → input password.
- Submit primary full-width "Iniciar sesión" (pending: "Ingresando…").
- Inline error rojo role="alert".
- Footer "¿No tenés cuenta? Crear cuenta" (preserva intent + returnTo).

ESTADOS: default · error inline (credenciales malas) · variante con intent=apply.
```

## 1.2 · `/signup`

```
PANTALLA: Signup
ARCHIVO: board-auth-signup.jsx
PATH: /signup
ROL: anónimo

INTENT: crear cuenta personal.

LAYOUT (standalone, same shell que login):
- H1 "Crear cuenta" + stepper "Paso 1 de 2" → "Paso 2 de 2".
- Paso 1: email + password + confirmar + checkbox términos + submit "Continuar".
- Paso 2: nombre + apellido + DNI (opcional con helper "Podés agregarlo después") + submit "Crear cuenta".
- Mostrá AMBOS pasos apilados con divider y label "Paso 2".
- Footer link a /login.
```

## 1.3 · `/cuenta` (Owner — Tab "Yo")

```
PANTALLA: Mi cuenta
ARCHIVO: board-cuenta.jsx
PATH: /cuenta
ROL: owner (autenticado · shell OwnerShell)

INTENT: ver y editar perfil, settings de privacidad, acciones de cuenta.

LAYOUT (OwnerShell sidebar + topbar):
- Header con avatar Photo size lg + h1 "Tu cuenta" + chip rol ("Dueño").
- Card "Tu identidad" — nombre · DNI (chip verificado o botón verificar) · teléfono.
- Card "Tu cuenta" — email readonly · "Cambiar contraseña".
- Card "Privacidad" — 4 toggles iOS-style:
  · Mostrar mi nombre en credencial pública
  · Mostrar mi teléfono en credencial
  · Permitir que orgs me contacten
  · Permitir alertas de mascotas perdidas en mi zona
- Card "Más" — links: Mis organizaciones (count) · Solicitudes recibidas (count) · Mis tránsitos · Crear organización · Crear consultorio veterinario.
- Card "Acciones" — Cerrar sesión (ghost) + Desactivar cuenta (texto rojo pequeño).

SHEETS QUE ABRE: editar-perfil · verificar-dni · cambiar-contrasena · desactivar-cuenta · crear-organizacion · crear-consultorio · cerrar-sesion.
```

## 1.4 · `/cuenta/memberships`

```
PANTALLA: Mis organizaciones
ARCHIVO: board-cuenta-memberships.jsx
PATH: /cuenta/memberships
ROL: owner (OwnerShell, tab "Yo")

INTENT: ver en qué orgs es miembro y con qué rol.

LAYOUT:
- Breadcrumb "Tu cuenta › Mis organizaciones".
- H1 + sub.
- Grid de cards: logo org placeholder + nombre + chip rol membership (admin/coordinator/member/volunteer/foster/vet_individual) + chips capabilities ("Escribir eventos", "Adopciones") + acción "Renunciar" (link rojo pequeño).
- CTA al final "¿Tu org no está en MiMAR? Crear una".

ESTADOS: default (3 orgs) + empty ("Todavía no sos miembro de ninguna…").
```

## 1.5 · `/cuenta/solicitudes`

```
PANTALLA: Solicitudes recibidas
ARCHIVO: board-cuenta-solicitudes.jsx
PATH: /cuenta/solicitudes
ROL: owner (OwnerShell)

INTENT: ver approval requests recibidos de orgs.

LAYOUT:
- Breadcrumb + H1 "Solicitudes que recibiste".
- Lista cards: logo org + nombre + chip "Te proponen: [rol]" + fecha + chip "Expira en X días" + botones Aprobar (primary) / Rechazar (ghost rojo).

ESTADOS: default · empty ("No tenés solicitudes pendientes").
```

## 1.6 · `/org` (Picker)

```
PANTALLA: Selector de organización
ARCHIVO: board-org-picker.jsx
PATH: /org
ROL: autenticado con ≥2 memberships (standalone, sin OrgShell todavía)

INTENT: elegir org para operar.

LAYOUT:
- Centrado max-w-2xl. Brand MiMAR + h1 "Elegí una organización" + sub "Sos miembro de varias…".
- Grid 2 cols (desktop) / 1 col (mobile) de cards grandes: logo + nombre + chip rol membership + ubicación + "Último acceso: hace X".
- Card entera clickeable.
- CTA "+ Crear nueva organización" al final.

NOTA: si solo hay 1 org, server redirige a /org/[token] (no se ve esta pantalla).
```

## 1.7 · `/mis-mascotas/reclamar`

```
PANTALLA: Reclamar mascota
ARCHIVO: board-pet-reclamar.jsx
PATH: /mis-mascotas/reclamar
ROL: owner (OwnerShell, tab "Mascotas")

INTENT: reclamar una mascota cuyo chip ya está registrado bajo otro dueño / sin dueño.

LAYOUT:
- Breadcrumb "Mis mascotas › Reclamar" + H1 + sub explicativo.
- Card "Buscar por": segmented control Microchip | Tatuaje + input + submit "Buscar".
- Resultado en 3 variantes apiladas (mostrar las 3 para review):
  1. Mascota encontrada libre — card pet con Photo status=ok + nombre + chips + botón "Reclamarla" (primary).
  2. Mascota encontrada con dueño — card + banner "Ya tiene dueño. Iniciar disputa." (warning) + botón "Iniciar disputa" (ghost).
  3. No encontrada — empty state + botón "Registrar como nueva mascota" (primary).
- BONUS: banner especial "Esta mascota está marcada como PERDIDA desde [fecha]. ¿La encontraste? Iniciá la devolución" cuando aplique.
```

---

# TANDA 2 — Adopción postular (3 pantallas)

Habilita Fase 8 del plan CC (parte adopción). Conecta el catálogo público con el flujo dueño.

## 2.1 · `/adoptar/[petToken]`

```
PANTALLA: Detalle público de mascota adoptable
ARCHIVO: board-public-adoptar-pet.jsx
PATH: /adoptar/[petToken]
ROL: público (PublicShell minimalista)

INTENT: ver detalle, convencerse, postular.

LAYOUT:
- Hero gallery: 1 imagen grande + thumbnails carrusel.
- H1 nombre + chip verde "Adoptable" + Photo status=ok (size xl, embedded en el hero).
- Row chips: especie · raza · edad estimada · sexo · tamaño.
- Card "Sobre [nombre]" — texto largo descriptivo.
- Card "Salud" (grid 2 cols): ✓/✗ Vacunación al día · ✓/✗ Esterilizado · condiciones permanentes (lista).
- Card "Personalidad" — chips coloreados (bueno con niños, energía media, etc.).
- Card "Refugio" — logo + nombre + ubicación + link "Ver perfil del refugio".
- CTA sticky "Postular para adoptar a [nombre]" (primary).

VARIANTES: no autenticado (CTA dice "Iniciar sesión para postular") · ya adoptado (badge "Adoptada", CTA grayed) · pausada por org (banner "No disponible ahora").
```

## 2.2 · `/adoptar/[petToken]/postular`

```
PANTALLA: Postulación adopción (4 campos)
ARCHIVO: board-public-adoptar-postular.jsx
PATH: /adoptar/[petToken]/postular
ROL: owner autenticado

INTENT: completar postulación (versión MVP, no wizard 28-q).

LAYOUT:
- Header: thumbnail pet + nombre + "Postulación de adopción".
- Banner info "Tu información de contacto se compartirá con el refugio".
- Form:
  1. Textarea (min 50 chars) "¿Por qué querés adoptar a [nombre]?"
  2. Radio "¿Tenés experiencia con [especie]?" — Sí mucha / Algo / Es mi primera vez.
  3. Radio "¿Cómo es tu hogar?" — Casa con patio / Departamento / Casa sin patio / Otro.
  4. Radio + textarea condicional "¿Hay otros animales?" — No / Sí (textarea).
- Card "Tus datos de contacto" (read-only del perfil) + link "Editar mis datos".
- CTA primary "Enviar postulación".
- Helper "El refugio responde en aproximadamente 5 días".
```

## 2.3 · `/mis-mascotas/postulaciones`

```
PANTALLA: Mis postulaciones
ARCHIVO: board-postulaciones.jsx
PATH: /mis-mascotas/postulaciones
ROL: owner (OwnerShell)

INTENT: ver postulaciones enviadas + estado.

LAYOUT:
- Breadcrumb + H1 + sub.
- Filtros chip: Todas · Pendientes · Aprobadas · Rechazadas.
- Lista cards: thumbnail pet + nombre + org + chip estado + fecha + botón "Ver detalle".

ESTADOS: default · empty ("Todavía no postulaste…").
```

---

# TANDA 3 — Turnos completo (8 pantallas)

Habilita Fase 7 del plan CC. 5 owner + 3 org.

## 3.1 · `/turnos/buscar`

```
PANTALLA: Buscar turnos
ARCHIVO: board-turnos-buscar.jsx
PATH: /turnos/buscar
ROL: owner (OwnerShell)

LAYOUT:
- H1 + sticky filtros: Tipo dropdown (Vacunación/Esterilización/Consulta vet/Castración/Microchip/Otro) · Localidad autocomplete · Fecha desde-hasta · Precio (Cualquiera/Gratis/Hasta $X).
- Toggle "Vista lista | Mapa".
- Lista offering cards: nombre Lora 18px + org + ubicación con ícono + chip Gratis/precio + "Próximo: [fecha]" + botón "Ver detalle".

ESTADOS: default (10 cards) · empty.
```

## 3.2 · `/turnos/buscar/[offeringToken]`

```
PANTALLA: Detalle de oferta
ARCHIVO: board-turno-offering.jsx
PATH: /turnos/buscar/[offeringToken]
ROL: owner

LAYOUT:
- Hero card: chip categoría + H1 nombre + chip precio. Sub: org + ubicación.
- Bloque "Qué incluye" — bullets.
- Bloque "Cuándo" — calendar widget de slots (semana + siguiente, días columnas, slots filas). Slots disponibles blanco, ocupados grises tachados.
- Bloque "Quién lo hace" — avatar + nombre + matrícula vet.
- Bloque "Cómo llegar" — dirección + mini mapa + link.
- Bloque "Política de cancelación" — texto legal.
- CTA sticky "Reservar este turno".
```

## 3.3 · `/turnos/buscar/[offeringToken]/reservar/[slotId]`

```
PANTALLA: Confirmar reserva
ARCHIVO: board-turno-reservar.jsx
PATH: /turnos/buscar/[offeringToken]/reservar/[slotId]
ROL: owner

LAYOUT:
- H1 "Confirmar tu reserva".
- Card resumen no editable: servicio + org + día + hora + duración + precio.
- Form: dropdown "¿Para qué mascota?" (lista mis mascotas con thumbnails) + textarea opcional.
- Bloque política.
- CTA primary "Confirmar reserva".

VARIANTE: race-condition error rojo "Este turno se acaba de tomar" + lista alternativas.
```

## 3.4 · `/mis-turnos`

```
PANTALLA: Mis turnos
ARCHIVO: board-mis-turnos.jsx
PATH: /mis-turnos
ROL: owner (OwnerShell, tab "Turnos")

LAYOUT:
- H1 + tabs Próximos / Historial.
- Lista cards: thumbnail pet + nombre pet + nombre servicio + org + día/hora + chip estado (Confirmado/Cancelado/Asistió/No asistió).

ESTADOS: default · empty.
```

## 3.5 · `/mis-turnos/[appointmentToken]`

```
PANTALLA: Detalle de mi turno
ARCHIVO: board-mi-turno-detail.jsx
PATH: /mis-turnos/[appointmentToken]
ROL: owner

LAYOUT:
- Breadcrumb + hero card (mismo formato que 3.3 resumen) + chip estado grande.
- Bloque "Antes del turno" — checklist condicional.
- Bloque "Cómo llegar" — mapa + dirección.
- Row botones: Reprogramar (ghost) · Cancelar turno (ghost rojo) · Cómo llegar (ghost).

VARIANTE POST-TURNO: bloque success "Evento registrado el [fecha]" + link al pet_event.

SHEETS: cancelar-turno · reprogramar.
```

## 3.6 · `/org/[orgToken]/servicios/nuevo`

```
PANTALLA: Publicar nuevo servicio
ARCHIVO: board-org-servicio-nuevo.jsx
PATH: /org/[orgToken]/servicios/nuevo
ROL: org admin/coordinator (OrgShell)

LAYOUT (wizard 3 pasos apilados con divider para review):
- Paso 1 "Qué es": nombre + radio tipo con íconos (Vacunación/Esterilización/Consulta vet/Microchip/Otro) + descripción textarea + radio precio (Gratis/Pagado) + input condicional.
- Paso 2 "Cuándo": duración slot (15/30/45/60 min) + capacidad por slot + grid días con time-pickers.
- Paso 3 "Quién": dropdown responsable (miembros staff) + matrícula vet condicional.
- CTA final "Publicar servicio".
```

## 3.7 · `/org/[orgToken]/servicios/[offeringToken]`

```
PANTALLA: Detalle de servicio (org)
ARCHIVO: board-org-servicio-detail.jsx
PATH: /org/[orgToken]/servicios/[offeringToken]
ROL: org (OrgShell)

LAYOUT:
- Hero: H1 nombre + chip estado (Activo verde / Pausado amarillo).
- Card "Detalle" con accordions: Lo básico · Disponibilidad · Responsable.
- Grid 4 MetricCards: Turnos próximos · Ocupación 30d · Asistencia % 30d · Reseñas avg.
- Botones top: Ver agenda · Pausar · Eliminar (rojo pequeño).

SHEETS: editar-servicio · pausar-servicio · eliminar-servicio.
```

## 3.8 · `/org/[orgToken]/servicios/[offeringToken]/agenda`

```
PANTALLA: Agenda de servicio
ARCHIVO: board-org-servicio-agenda.jsx
PATH: /org/[orgToken]/servicios/[offeringToken]/agenda
ROL: org (OrgShell)

LAYOUT:
- Toggle Semana | Mes.
- Calendar grid (columnas días, filas horas).
- Slots con "X/Y reservados" + color (verde libre / amarillo parcial / rojo lleno / gris bloqueado).
- Click slot abre panel lateral con lista reservas.
- Acciones top: Bloquear día · Crear turno manual · Exportar CSV.

SHEETS: bloquear-slot · crear-turno-manual.
```

---

# TANDA 4 — Foster + Notificaciones + Denuncias dueño (10 pantallas)

Habilita Fase 8 (foster) + Fase 12 (notificaciones, denuncias-mias).

## 4.1 — 4.4 · Tránsitos owner (4 pantallas)

```
PANTALLA: Tránsitos activos
ARCHIVO: board-transitos-activos.jsx
PATH: /cuenta/transitos/activos
ROL: owner (OwnerShell)

LAYOUT: lista cards (pet + org + desde + chip "Co-foster con [nombre]"). Sheets: finalizar-transito · co-foster-toggle.
ESTADOS: default · empty.
```

```
PANTALLA: Propuestas de tránsito
ARCHIVO: board-transitos-propuestas.jsx
PATH: /cuenta/transitos/propuestas
ROL: owner

LAYOUT: lista cards (org + pet + chip "expira en X días") + CTA secundario "Ofrecerme como tránsito" (abre sheet ofrecerme-transito).
ESTADOS: default · empty con CTA grande.
```

```
PANTALLA: Detalle de propuesta
ARCHIVO: board-transitos-propuesta-detail.jsx
PATH: /cuenta/transitos/propuestas/[proposalToken]
ROL: owner

LAYOUT: detalle pet + condiciones (duración estimada, gastos cubiertos por org, etc.) + botones Aceptar (primary) / Rechazar (ghost rojo).
SHEETS: aceptar-propuesta · rechazar-propuesta.
```

```
PANTALLA: Historial de tránsitos
ARCHIVO: board-transitos-historial.jsx
PATH: /cuenta/transitos/historial
ROL: owner

LAYOUT: lista cronológica de tránsitos cerrados con duración, motivo, evaluación.
ESTADOS: default · empty.
```

## 4.5 · `/notificaciones`

```
PANTALLA: Inbox de notificaciones
ARCHIVO: board-notificaciones.jsx
PATH: /notificaciones
ROL: owner (OwnerShell, tab "Avisos")

LAYOUT:
- H1 + tabs Todo / Recordatorios / Avisos / Comunidad.
- Lista cards con estado leído/no-leído (bullet azul si no leído).
- Cada notif tiene icon + título + sub + tiempo + CTA contextual ("Ver mascota", "Confirmar turno", etc.).
- Acción "Marcar todas como leídas" en topbar de la sección.

SHEETS: marcar-como-leido.
ESTADOS: default · empty ("Estás al día — no hay avisos nuevos").
```

## 4.6 · `/denuncias/mias`

```
PANTALLA: Mis denuncias
ARCHIVO: board-denuncias-mias.jsx
PATH: /denuncias/mias
ROL: owner autenticado (OwnerShell, sub-tab dentro de Avisos)

LAYOUT: lista cards (código DEN-XXXX + título + chip estado + fecha + ubicación denunciada).
ESTADOS: default · empty.
```

## 4.7 · `/denuncias/[id]`

```
PANTALLA: Detalle de mi denuncia (auth)
ARCHIVO: board-denuncia-detail-auth.jsx
PATH: /denuncias/[id]
ROL: owner autenticado (el denunciante firmado)

LAYOUT:
- Hero: código + chip estado + fecha.
- Bloque "Lo que reportaste" — narrativa.
- Bloque "Evidencia adjunta" — grid de attachments.
- Bloque "Timeline" — acciones públicas del expediente.
- Bloque "Comentarios" — public-side hilo de comentarios.
- Acciones: agregar evidencia · agregar comentario.
SHEETS: agregar-evidencia · agregar-comentario.
```

## 4.8 · `/casos/[publicCode]`

```
PANTALLA: Caso público
ARCHIVO: board-caso-publico.jsx
PATH: /casos/[publicCode]
ROL: público

LAYOUT:
- Hero "Caso [CODE]" + chip estado.
- Timeline público filtrado (solo eventos que la jurisdicción decide hacer públicos).
- NO revela datos personales — solo progreso.
- Banner "Este caso es público porque [razón]".
```

## 4.9 · `/libreta/compartir/[shareToken]`

```
PANTALLA: Libreta compartida (público)
ARCHIVO: board-libreta-compartida.jsx
PATH: /libreta/compartir/[shareToken]
ROL: público (con token corto)

LAYOUT:
- Hero pet + Photo status (la real) + chip "Compartido por [dueño]" + chip "Expira en X horas".
- Libreta filtrada por category=medical (NO incluye: ubicación, contacto dueño, notes no-medical).
- Banner top "Esta libreta es pública por tiempo limitado. Para registrar eventos, el vet debe iniciar sesión".
```

## 4.10 · Marketing landing `/`

```
PANTALLA: Marketing landing
ARCHIVO: board-landing.jsx
PATH: /
ROL: público (entry point)

LAYOUT:
- Hero: H1 grande "MiMAR — el registro nacional de mascotas" + sub corto + 3 CTAs grandes (Soy dueño · Soy refugio · Soy gobierno).
- Bloque "¿Qué es la credencial pública?" con visual.
- Bloque "¿Cómo reportar una mascota perdida?".
- Bloque "¿Cómo denunciar maltrato?".
- Bloque "¿Cómo adoptar en MiMAR?".
- Footer con legales (ley 14.346, datos personales).

TONE: cálido, primera impresión, accesible, no jerga técnica.
```

---

# TANDA 5 — Owner eventos especiales + tab Vacunas (8 pantallas)

Habilita Fase 12 del plan.

## 5.1 · Pet detail tab Vacunas

```
PANTALLA: Tab Vacunas
ARCHIVO: board-pet-vacunas.jsx (se integra a BoardPetDetail con ?tab=vacunas)
PATH: /mis-mascotas/[publicToken]?tab=vacunas
ROL: owner

LAYOUT (dentro del shell pet detail):
- Bloque "Estado de vacunación" con 3 badges: Antirrábica (vigente verde / pendiente amarillo / vencida rojo), Quíntuple (idem), Otras (idem).
- Calendario próximas dosis: lista de próximas 12 semanas con dosis recordadas.
- Historial completo de vacunas (tabla): fecha · vacuna · marca · lote · vet · adjunto.
- CTA "Programar próxima vacuna".
```

## 5.2 · `/mis-mascotas/[token]/vacunas/programar`

```
PANTALLA: Programar vacuna
ARCHIVO: board-vacuna-programar.jsx
PATH: /mis-mascotas/[publicToken]/vacunas/programar
ROL: owner

LAYOUT:
- Hero pet chip.
- Form: dropdown vacuna + fecha sugerida auto-calculada + checkbox "¿Reservar turno?" con link a /turnos/buscar (filtros prefilled).
- CTA "Programar recordatorio" + (si reservar turno) "Programar y reservar".
```

## 5.3 · `/mis-mascotas/[token]/anotar`

```
PANTALLA: Quick capture detail
ARCHIVO: board-anotar.jsx
PATH: /mis-mascotas/[publicToken]/anotar
ROL: owner (mobile-first)

LAYOUT:
- Hero pet chip (selectable si hay varias mascotas).
- Textarea grande "¿Qué pasó?" con autofocus y altura 4 líneas.
- Parser hint inline mientras escribís ("Detecté: Vacuna antirrábica · 18 de mayo").
- 5 chips quick: Vacuna · Peso · Síntoma · Medicación · Nota.
- CTA principal "Anotar" → abre ?sheet=<inferido> con prefill.

CONEXIÓN: este es el destino del "Anotar" del EventCatcher del /inicio.
```

## 5.4 · `/mis-mascotas/[token]/asistencia/presentar`

```
PANTALLA: Presentar asistencia (vet check-in)
ARCHIVO: board-asistencia-presentar.jsx
PATH: /mis-mascotas/[publicToken]/asistencia/presentar
ROL: owner (mostrarle al vet)

LAYOUT (full-screen vertical, mobile):
- Hero pet (Photo size xl) + nombre dueño + chip turno (servicio + hora).
- QR grande con appointment_token.
- Botón "Presentar" full-width primary → marca asistencia.
- Helper "Mostrale esto al vet. Después de confirmar, el evento queda registrado en tu libreta".
```

## 5.5 · `/mis-mascotas/[token]/devolucion`

```
PANTALLA: Devolución a refugio
ARCHIVO: board-devolucion.jsx
PATH: /mis-mascotas/[publicToken]/devolucion
ROL: owner (mascotas recibidas de un refugio)

LAYOUT:
- H1 "Devolver [nombre]" + sub.
- Banner amarillo "Estás iniciando la devolución de una mascota recibida en adopción/tránsito de [Refugio X]".
- Form: radio razón (Cambio de circunstancias / Comportamiento / Salud / Otro) + textarea notas + fecha sugerida default hoy.
- CTA "Confirmar devolución" (rojo).
```

## 5.6 · `/mis-mascotas/[token]/eventos/atestar-raza-peligrosa`

```
PANTALLA: Atestación PPP (perro potencialmente peligroso)
ARCHIVO: board-ppp-atestar.jsx
PATH: /mis-mascotas/[publicToken]/eventos/atestar-raza-peligrosa
ROL: owner

LAYOUT (wizard 2 pasos):
- Paso 1: checkboxes legales requeridos (responsabilidad civil, registro RUPPPA, etc.) + texto legal completo.
- Paso 2: firma digital (canvas o "Firmar con DNI") + foto del animal + ubicación (geolocation).
- CTA final "Atestar".
- Banner info "Este registro queda anclado a tu DNI y a la jurisdicción de tu domicilio (CABA RUPPPA)".
```

## 5.7 · `/mis-mascotas/[token]/eventos/[eventId]`

```
PANTALLA: Detalle de evento (read-only)
ARCHIVO: board-evento-detail.jsx
PATH: /mis-mascotas/[publicToken]/eventos/[eventId]
ROL: owner (read-only)

LAYOUT:
- Hero: chip tipo de evento + fecha + autor (avatar + chip rol).
- Payload renderizado según tipo (campos del payload del evento).
- Adjuntos si hay (grid).
- Timeline relacionada (qué case_id abrió o cerró este evento).
- Banner info "Append-only: este registro no puede editarse. Para corregir, agregá una nota".
```

## 5.8 · `/mis-mascotas/nueva/match/[matchedPetToken]`

```
PANTALLA: Match confirmation en alta
ARCHIVO: board-pet-nueva-match.jsx
PATH: /mis-mascotas/nueva/match/[matchedPetToken]
ROL: owner (durante wizard de alta)

LAYOUT:
- Banner amarillo "Encontramos esta mascota con el mismo chip:".
- Card pet read-only: Photo + nombre + chips + dueño actual masked.
- 3 botones grandes apilados:
  1. "Es la misma — reclamarla" (primary) → /mis-mascotas/reclamar?chip=…
  2. "No es la misma — registrar igual" (ghost) → captcha + warning legal + continuar.
  3. "Cancelar" (quiet) → vuelve al wizard.
```

---

# TANDA 6 — Org extension (12 pantallas)

Habilita Fase 9 del plan.

## 6.1 — 6.2 · Intake

```
PANTALLA: Intake queue
ARCHIVO: board-org-intake.jsx
PATH: /org/[orgToken]/intake
ROL: org (OrgShell, tab "Operaciones")

LAYOUT: lista de mascotas en proceso de ingreso (capturadas, sin alta formal todavía) con tabs por estado. CTA "Nuevo ingreso".
```

```
PANTALLA: Intake match
ARCHIVO: board-org-intake-match.jsx
PATH: /org/[orgToken]/intake/match/[matchedPetToken]
ROL: org

LAYOUT: igual estructura que owner match (5.8) pero contextualizado para org.
```

## 6.3 · ~~No aptas~~ — REMOVIDO (cubierto por plan F4.3)

`/org/[orgToken]/pets/no-aptas` no necesita diseño separado. El plan CC F4.3 ya pide a CC agregar **no-aptas como tab/filtro dentro de `board-org-pets.jsx`** al portar a `/org/[orgToken]/mascotas`. Si CC ve que el tab no está en el board actual, lo crea como filtro adicional sin layout nuevo.

## 6.4 · Check-ins
```
PANTALLA: Check-ins del día
ARCHIVO: board-org-checkins.jsx
PATH: /org/[orgToken]/checkins
ROL: org

LAYOUT: lista de turnos del día con estado (esperando/atendido/no asistió) + botones rápidos por card.
```

## 6.5 · Casos abiertos org
```
PANTALLA: Casos abiertos
ARCHIVO: board-org-casos.jsx
PATH: /org/[orgToken]/casos
ROL: org

LAYOUT: queue de cases asociados a la org (bite, lost, welfare, foster, transfer, adoption_application) con filtros por kind + prioridad + asignado.
```

## 6.6 · Adopción detail org
```
PANTALLA: Detalle de postulación de adopción
ARCHIVO: board-org-adopcion-detail.jsx
PATH: /org/[orgToken]/adopciones/[appEventId]
ROL: org coordinator/admin

LAYOUT: postulante (datos + perfil) + respuestas form + timeline + acciones (aprobar/rechazar/solicitar info/cerrar).
SHEETS: aprobar-postulacion · rechazar-postulacion · solicitar-info.
```

## 6.7 · Tránsitos org
```
PANTALLA: Tránsitos (vista unificada)
ARCHIVO: board-org-transitos.jsx
PATH: /org/[orgToken]/transitos
ROL: org

LAYOUT: tabs Activos / Próximos a cerrar / Histórico. Lista cards: pet + cuidador (member o owner volunteer) + duración + chip tipo. CTA "Iniciar tránsito" / "Buscar voluntario".
```

## 6.8 — 6.9 · Voluntarios
```
PANTALLA: Voluntarios
ARCHIVO: board-org-voluntarios.jsx
PATH: /org/[orgToken]/voluntarios
ROL: org

LAYOUT: tabs Activos / Disponibles (owners que se ofrecieron) / Histórico. Lista cards: nombre + capacidades + zona + última actividad. Filtro por zona + especies aceptadas.
SHEETS: invitar-voluntario · revocar-acceso.
```

```
PANTALLA: Propuestas a voluntarios
ARCHIVO: board-org-voluntarios-propuestas.jsx
PATH: /org/[orgToken]/voluntarios/propuestas
ROL: org

LAYOUT: lista con estados (enviada/aceptada/rechazada/expirada).
```

## 6.10 — 6.12 · Transferencias
```
PANTALLA: Transferencias salientes
ARCHIVO: board-org-transferencias.jsx
PATH: /org/[orgToken]/transferencias
ROL: org

LAYOUT: lista cards (pet + org destino + chip estado handshake + propuesta-hace). CTA "Nueva transferencia".
```

```
PANTALLA: Nueva transferencia
ARCHIVO: board-org-transferencia-nueva.jsx
PATH: /org/[orgToken]/transferencias/nueva
ROL: org

LAYOUT: wizard 3 pasos: mascota (picker) / destino (search org) / confirmar (razón + T&Cs).
```

```
PANTALLA: Transferencias recibidas
ARCHIVO: board-org-transferencias-recibidas.jsx
PATH: /org/[orgToken]/transferencias/recibidas
ROL: org

LAYOUT: lista con acciones Aceptar / Rechazar.
SHEETS: aceptar-transferencia · rechazar-transferencia.
```

## 6.13 — 6.14 · Maltrato org
```
PANTALLA: Maltrato recibidos
ARCHIVO: board-org-maltrato.jsx
PATH: /org/[orgToken]/maltrato/recibidos
ROL: org

LAYOUT: queue con prioridad, estado, fecha, fuente (derivación gob / interna).
SHEETS: tomar-caso · derivar-a-org.
```

```
PANTALLA: Levantar denuncia org
ARCHIVO: board-org-maltrato-nuevo.jsx
PATH: /org/[orgToken]/maltrato/nuevo
ROL: org

LAYOUT: wizard parecido al /denuncias/nueva público PERO con autocomplete de pets en custodia y firma org.
```

## 6.15 · Mordedura nuevo
```
PANTALLA: Bite incident
ARCHIVO: board-org-mordedura.jsx
PATH: /org/[orgToken]/mordedura/nuevo
ROL: org

LAYOUT: form: víctima (radio humano/animal) + severidad + provocación + lugar + fecha + checkbox "Requiere observación rábica" (auto-checked si humano + skin break).
```

## 6.16 · ~~Permisos org~~ — VERIFICAR si hace falta

`/org/[orgToken]/admin/permisos` puede que ya esté cubierto por **`board-org-equipo.jsx`** (que referencia `permisos`, `capability`, `invitar-voluntario` según grep). El plan CC F4.6 ya pide portar equipo con sheets `cambiar-rol-miembro / invitar / revocar`.

**Acción:** abrir `board-org-equipo.jsx` y confirmar si la matriz de permisos está integrada como tab/sección. Si SÍ → eliminar de pendientes. Si NO → diseñar como sigue:

```
PANTALLA: Permisos & roles (solo si no está en equipo)
ARCHIVO: board-org-permisos.jsx
PATH: /org/[orgToken]/admin/permisos
ROL: org admin (A only)

LAYOUT: matriz de miembros × capabilities. Toggle por celda. Filtro por rol.
SHEETS: cambiar-rol-miembro · aprobar-capacidad · revocar-capacidad.
```

---

# TANDA 7 — Gob + Admin extensión (15 pantallas)

Habilita Fases 10 + 11 del plan.

## 7.1 — 7.7 · Gob extensión

**Nota previa:** `board-gob-caba.jsx` (cubierto en F4.8 → `/gob/vigilancia`) ya **incluye brotes y zoonosis como secciones** del resumen de vigilancia. Por eso `/gob/vigilancia/brotes` y `/gob/vigilancia/zoonosis` **no se diseñan como páginas separadas** — quedan como deep-links a anchors (`/gob/vigilancia#brotes`, `#zoonosis`) o como filtros de la misma página. CC decide al implementar F4.8.

| Path | Archivo | Resumen |
|---|---|---|
| /gob/disputas | board-gob-disputas.jsx | Queue + tabs (Mías asignadas / Sin asignar / Cerradas) |
| /gob/disputas/[disputeToken] | board-gob-disputa-detail.jsx | Expediente: partes, timeline, evidencia, notas internas, decidir/escalar/cerrar |
| /gob/perdidas | board-gob-perdidas.jsx | Mapa + lista + MetricCards (activas / recuperadas 30d / sin chip) |
| /gob/reglas | board-gob-reglas.jsx | Read-only de reglas jurisdiccionales — tabs país/provincia/localidad |
| /gob/historial | board-gob-historial.jsx | Audit log del agent govt |
| /gob/analytics | board-gob-analytics.jsx | KPIs + TimeSeriesCharts + rankings |
| /gob/analytics/export | board-gob-analytics-export.jsx | Wizard de export async (dataset · rango · formato · email) |

> Antes estaban listados aquí `/gob/vigilancia/brotes` y `/gob/vigilancia/zoonosis` — quedan **cubiertos por board-gob-caba** (secciones de la pantalla `/gob/vigilancia`), no requieren diseño nuevo.

## 7.8 — 7.15 · Admin extensión

| Path | Archivo | Resumen |
|---|---|---|
| /admin/admins | board-admin-admins.jsx | Lista admins + new + detail (3 sub-pantallas) |
| /admin/govts | board-admin-govts.jsx | Govt agents list + new + detail (3 sub-pantallas) |
| /admin/moderacion | board-admin-moderacion.jsx | Queue + item (2 sub-pantallas) |
| /admin/jurisdicciones | board-admin-jurisdicciones.jsx | Tree país→provincia→localidad + reglas list/new/edit |
| /admin/auditoria | board-admin-auditoria.jsx | Audit log universal |
| /admin/outbox | board-admin-outbox.jsx | Outbox queue + item detail |
| /admin/observaciones | board-admin-observaciones.jsx | Observaciones rábicas + detail + reemplazar microchip |
| /admin/sistema | board-admin-sistema.jsx | Health dashboard |

(Por brevedad para esta tanda, te paso el spec detallado de cada una sólo cuando arranques la tanda. Avísame y completo.)

---

# Lista priorizada para arrancar

1. **TANDA 1** (7 pantallas) — auth + cuenta + reclamar → habilita Fase 6 del plan CC → bloquea demo end-to-end.
2. **TANDA 2** (3 pantallas) — adopción postular → habilita Fase 8 parcial.
3. **TANDA 3** (8 pantallas) — turnos → habilita Fase 7 (más vistoso de la demo).
4. **TANDA 4** (10 pantallas) — foster + notif + denuncias-mias + landing + libreta-compartir.
5. **TANDA 5** (8 pantallas) — owner eventos especiales.
6. **TANDA 6** (12 pantallas) — org extension.
7. **TANDA 7** (15 pantallas) — gob + admin extension.

**Total: ~60 entregables de claude.ai/design** (después de remover los 3 falsos positivos del cross-check). Algunos boards son multi-pantalla — wizards de 3-5 pasos, list+detail, etc.

---

*Generado 2026-05-26. Pegá una tanda por vez en claude.ai/design. Cuando termines guardalos en C:\Users\ignac\Downloads\Pantallas\ y avisame para que actualice el plan CC.*
