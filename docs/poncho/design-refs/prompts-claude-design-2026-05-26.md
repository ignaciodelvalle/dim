# Prompts listos para pegar en claude.ai/design

**Fecha:** 2026-05-26
**Para:** Ignacio (uso personal, claude.ai/design/)
**Companion de:** `diseño-backlog-2026-05-26.md`

## Cómo usar este doc

Esta es una serie de prompts ordenados. **Pegalos en este orden** en una sesión nueva de claude.ai/design/:

1. **Bloque A — Contexto de proyecto** → pegá UNA vez al inicio de la sesión.
2. **Bloque B — Design system y convenciones visuales** → pegá UNA vez, justo después de A.
3. **Bloque C — Referencia de pantallas existentes** → pegá UNA vez. (Si Claude Design soporta upload de archivos, también subí `index (1).html` y 4-5 pantallas de muestra como referencia visual.)
4. **Bloques D1–D7** — uno por sprint. Pegá uno por vez y dejá que termine antes de pasar al siguiente. Si la sesión empieza a perder contexto, abrí una nueva y volvé a pegar A+B+C antes del próximo sprint.

Cada bloque D te devuelve N pantallas HTML autocontenidas (siguiendo el formato `public/01-tier-0.html` del index).

---

## BLOQUE A — Contexto del proyecto

```
Estoy diseñando MiMAR, una plataforma argentina para el registro nacional de mascotas. Cubre 4 roles: dueño, organización (refugio/clínica), gobierno (autoridad sanitaria local) y admin (operadores de la plataforma).

Ya tengo 48 pantallas wireframe-hi-fi diseñadas en sesiones anteriores tuyas (te las paso como referencia abajo). Necesito que diseñes ~53 pantallas adicionales para completar el flujo, manteniendo EXACTAMENTE el mismo estilo, paleta, tipografía, jerarquía y patrón de cards/tablas/sheets.

CONTEXTO TÉCNICO (no diseñes para esto, pero es útil saberlo):
- Stack: Next.js 15 App Router, Tailwind v4, React 19, Supabase.
- Las pantallas existentes son HTML wireframes hi-fi standalone (no React components), cada una con su shell completo (sidebar/topbar incluidos).
- Mobile-first siempre, breakpoint principal en md (768px).

TONO Y AUDIENCIA:
- Audiencia primaria: dueños argentinos de mascotas (lenguaje cotidiano rioplatense — "vos", "tu mascota", "darle de alta"). Audiencia secundaria: refugios y veterinarios (lenguaje operacional). Audiencia terciaria: agentes gubernamentales (lenguaje institucional, formularios densos).
- Todo el texto en español rioplatense. Nunca uses "tú", siempre "vos".
- Tono: cálido, claro, sin jerga técnica innecesaria. Evitá emojis salvo en el rol público "marketing" si corresponde.

ENTREGABLE POR PANTALLA:
- Un archivo HTML standalone autocontenido (mismo formato que `public/01-tier-0.html` que ya generaste).
- Embeber Lora + Montserrat de Google Fonts.
- Usar viewBox/viewport apropiado.
- Comentarios HTML que indiquen rol/path/intent al inicio.
- NO uses framework JS. Es wireframe estático.

Cuando estés listo, te paso el design system y la referencia de las 48 pantallas existentes.
```

---

## BLOQUE B — Design system y convenciones visuales

```
DESIGN SYSTEM — MiMAR / Poncho

PALETA (extraída del index actual):
- Fondo página: #f3f5f8
- Texto principal: #0e1f33
- Cards/superficies: #ffffff
- Borde default: #dee3eb / #e8ecf2
- Texto secundario: #3b4a5d / #6b7689
- Hover de card: borde #0e1f33

COLORES POR ROL (el "dot" del header de cada sección):
- Público: #0e1f33 (negro azulado)
- Dueño: #0072b8 (azul oficial gob.ar)
- Dueño/hojas modales: #6a4c93 (violeta)
- Organización: #1e7a3e (verde)
- Gobierno: #b71c1c (rojo institucional)
- Admin/plataforma: #9c6700 (mostaza)

COLORES SEMÁNTICOS (de Poncho design system):
- Primary CTA: #242c4f con hover #1a2240 y active #121830
- Celeste decorativo / focus ring: #37bbed
- Link azul: #0072bb con hover #005a93
- Success: #2e7d33
- Danger: #c62828
- Warning: #e7ba61 (texto de warning más oscuro: #bb861c)
- Info: #2897d4

TIPOGRAFÍA:
- Headings: 'Lora' serif weight 600-700, letter-spacing -0.02em en h1 (42px)
- Body / UI: 'Montserrat' sans weight 400-700
- Códigos/números técnicos: 'JetBrains Mono' weight 700, font-size 11px

ESCALA DE HEADINGS:
- h1: 42px Lora bold (página)
- h2: 18px Lora bold (sección dentro de card)
- h3-h4: 14-16px Montserrat semibold
- Eyebrow / label: 11-12px uppercase Montserrat semibold

LAYOUT:
- Container max-width: 1080px (`max-width: 1080px; margin: 0 auto; padding: 48px 32px 96px`)
- Cards: padding 20px 22px, border-radius 8px, border 1px solid #dee3eb, shadow-sm
- Cards chicas (item): padding 10px 12px, border-radius 4px, fondo #fafbfc, border #e8ecf2
- Grid de cards: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px`
- Mobile: stackeado, full-width
- Touch target mínimo: 44×44 px

COMPONENTES POR PATRÓN (replicá del index existente):

1. Page shell: header con back chevron + title + role-dot, content stack vertical
2. Card de listado (de un "grid"): num gris pequeño (JetBrains Mono) + title (medium weight)
3. Hero de detalle: título grande Lora + chips de metadata + bloque de descripción
4. Forms: label arriba en uppercase 12px gris, input con border 1px solid #dee3eb radius 4px, helper text 11px gris
5. Botones primarios: bg #242c4f text white, radius 4px, padding 10px 20px, weight 600
6. Botones secundarios: border 1px solid #0e1f33 transparent bg, mismo padding
7. Chips de estado: pill (radius-full), padding 4px 10px, weight 500, fondo coloreado al 10% del color principal + texto del color al 100%
8. Banners: card con border-left 4px del color del estado + título + descripción
9. Tabs sticky: barra horizontal con underline en activa
10. Empty states: ícono grande gris + título + descripción + CTA

REGLAS DE ESCRITURA DE COPY:
- Botones: verbo en infinitivo o imperativo segunda persona ("Reservar este turno", "Confirmar", "Postular")
- Empty states: empezá con el contexto ("Todavía no tenés..."), seguí con CTA accionable
- Errores: explicá qué pasó y qué hacer ("No pudimos encontrar ese chip. Verificá el número o registrá la mascota.")
- Banners de estado: 1 línea de título + máximo 2 líneas de descripción
- Nunca uses "Por favor" — directo y respetuoso

ACCESIBILIDAD:
- Contraste WCAG AA mínimo (4.5:1 para texto, 3:1 para UI)
- Focus visible siempre (outline 2px solid #37bbed)
- Form fields con label asociado (for/id)
- Error inline con role="alert"
- Touch target 44×44

Confirmá que entendiste y te paso la referencia de las 48 pantallas existentes.
```

---

## BLOQUE C — Referencia de pantallas existentes

```
Estas son las 48 pantallas ya diseñadas (las generaste vos en sesiones anteriores). Te las paso para que mantengas consistencia de estilo y patrón. NO las rediseñes — son la verdad de referencia.

PÚBLICO (9):
01 Credencial Tier 0 — `public/01-tier-0.html`
02 Credencial Tier 0+ banners opcionales — `public/02-tier-0-plus.html`
03 Credencial Tier 2 médico — `public/03-tier-2-medico.html`
04 Credencial Tier 1 LOST mode — `public/04-tier-1-perdida.html`
05 Adoptar catálogo público — `public/05-adoptar.html`
06 Mascotas perdidas /perdidas — `public/06-perdidas.html`
07 Denuncias wizard 5 pasos + success — `public/07-denuncias-wizard.html`
08 Buscar denuncia por código — `public/08-denuncias-buscar.html`
09 Detalle público de denuncia — `public/09-denuncias-detalle.html`

DUEÑO /(app) (9):
01 Inicio Owner dashboard — `owner/01-inicio.html`
02 Mis Mascotas listado — `owner/02-mis-mascotas.html`
03 Nueva mascota wizard — `owner/03-mascota-nueva.html`
04 Perfil de mascota — `owner/04-pet-perfil.html`
05 Perfil todos los status banners (stacked) — `owner/05-pet-perfil-banners.html`
06 Pet detail Libreta tab — `owner/06-pet-libreta.html`
07 Pet detail Historial tab — `owner/07-pet-historial.html`
08 Lost cockpit owner view — `owner/08-lost-cockpit.html`
09 In memoriam — `owner/09-memoriam.html`

DUEÑO HOJAS MODALES (12):
01 Sheet Vacuna — `owner/sheets/01-vacuna.html`
02 Sheet Peso — `owner/sheets/02-peso.html`
03 Sheet Síntoma — `owner/sheets/03-sintoma.html`
04 Sheet Medicación inicio — `owner/sheets/04-medicacion.html`
05 Sheet Nota — `owner/sheets/05-nota.html`
06 Sheet Marcar perdida — `owner/sheets/06-marcar-perdida.html`
07 Sheet Marcar encontrada — `owner/sheets/07-marcar-encontrada.html`
08 Sheet Editar mascota — `owner/sheets/08-editar-mascota.html`
09 Sheet Compartir libreta — `owner/sheets/09-compartir-libreta.html`
10 Sheet Transferir mascota — `owner/sheets/10-transferir.html`
11 Sheet Mostrar Libreta Tier 2 — `owner/sheets/11-mostrar-libreta.html`
12 Sheet Vet registra evento (UNIVERSAL — cubre todos los eventos médicos) — `owner/sheets/12-vet-evento.html`

ORGANIZACIÓN /org/[orgToken] (7):
01 Panel Refugio Belgrano R — `org/01-panel.html`
02 Agenda del día — `org/02-agenda.html`
03 Turno detalle — `org/03-agenda-detalle.html`
04 Animales en custodia — `org/04-mascotas.html`
05 Servicios catálogo — `org/05-servicios.html`
06 Portal de adopción interno — `org/06-adopciones.html`
07 Equipo — `org/07-equipo.html`

GOBIERNO /gob (10):
01 Panel de jurisdicción — `govt/01-panel.html`
02 Cola de solicitudes — `govt/02-cola.html`
03 Solicitud detalle — `govt/03-cola-detalle.html`
04 Organizaciones — `govt/04-organizaciones.html`
05 Servicios pendientes — `govt/05-servicios.html`
06 Servicio detalle — `govt/06-servicio-detalle.html`
07 Usuarios — `govt/07-usuarios.html`
08 Casos index — `govt/08-casos.html`
09 Maltrato queue — `govt/09-maltrato.html`
10 Maltrato expediente — `govt/10-maltrato-detalle.html`

ADMIN /admin (1):
01 Panel de administración — `admin/01-panel.html`

PATRONES RECURRENTES que debés mantener:
- Sidebar fijo izq desktop / drawer móvil para owner-app, org y gob/admin
- Topbar con título de sección + acciones derecha
- Tabs sticky cuando hay subsecciones de la misma entidad
- Cards de listado con num + título + chips de metadata
- Sheets (modales): bottom-sheet en mobile, right-drawer 480px en desktop
- Empty states siempre presentes

Confirmá que tenés el contexto y arrancamos por el Sprint 1.
```

---

## BLOQUE D1 — Sprint 1 (7 pantallas)

```
SPRINT 1 — Desbloquear demo end-to-end. Diseñá las siguientes 7 pantallas como HTML standalone, manteniendo el estilo del index. Devolvé un archivo HTML por pantalla, en el orden que te las paso.

---

S1.1 · LOGIN
Archivo: `auth/01-login.html`
Path: /login
Rol: anónimo

Layout (mobile-first, standalone, NO usa shell `(public)`):
- `min-h-screen` centrado vertical, max-w-sm
- h1 "Iniciar sesión" (Lora 3xl semibold, centrado)
- Helper text bajo el h1: por default "Bienvenido de vuelta a MiMAR". Variante para mostrar al lado: "Iniciá sesión para continuar con tu postulación."
- Botón "Conectar con Mi Argentina (próximamente)" — disabled, border neutral-300, cursor-not-allowed, ícono escarapela arg gris
- Divider horizontal con la palabra "o" en el medio (xs neutral-500)
- Form vertical: label "Tu correo" + input email, label "Tu contraseña" + input password
- Submit black full-width "Iniciar sesión" (estado pending: "Ingresando..." disabled)
- Inline error en rojo (#c62828) con role="alert" — mostrá un estado de error como variante secundaria
- Footer "¿No tenés cuenta? Crear cuenta" — link Crear cuenta a /signup

Estados a mostrar: default + variante con error inline + variante con helper "intent=apply"

---

S1.2 · SIGNUP
Archivo: `auth/02-signup.html`
Path: /signup
Rol: anónimo

Layout (two-step inline, NO modales):
- Mismo shell que login (centrado, max-w-sm, standalone)
- h1 "Crear cuenta"
- Stepper top: "Paso 1 de 2" → "Paso 2 de 2"
- Paso 1: email + password + confirmar password + checkbox "Acepto los términos y la política de privacidad" (linkifiable) + submit "Continuar"
- Paso 2: nombre + apellido + DNI (helper "Podés agregarlo después" — opcional) + submit "Crear cuenta"
- Link footer: "¿Ya tenés cuenta? Iniciar sesión"

Mostrá los DOS pasos como variantes en la misma pantalla (uno abajo del otro con un divider y label "Paso 2"), para que se vea ambos.

---

S1.3 · MI CUENTA
Archivo: `owner/10-cuenta.html`
Path: /cuenta
Rol: cualquier autenticado (color owner azul #0072b8)

Layout (shell completo dueño con sidebar):
- Header: avatar circular (placeholder) + h1 "Tu cuenta" + chip de rol ("Dueño")
- Bloque "Tu identidad" (card):
  - Campo nombre completo (readonly con botón "Editar")
  - Campo DNI (con chip "Verificado ✓" si verificado, o botón "Verificar mi DNI" si no)
  - Campo teléfono (editable inline)
- Bloque "Tu cuenta" (card):
  - Campo email (readonly)
  - Botón "Cambiar contraseña"
- Bloque "Privacidad" (card) — toggles iOS-style:
  - Mostrar mi nombre en credencial pública
  - Mostrar mi teléfono en credencial
  - Permitir que orgs me contacten
  - Permitir alertas de mascotas perdidas en mi zona
- Bloque "Más" (card) — links navegables:
  - Mis organizaciones (con count badge)
  - Solicitudes recibidas (con count badge si hay pendientes)
  - Mis tránsitos
  - Crear organización (link azul)
  - Crear consultorio veterinario (link azul)
- Bloque "Acciones de cuenta" (card) — destructivos al final:
  - Cerrar sesión (botón outline)
  - Desactivar cuenta (texto rojo pequeño)

---

S1.4 · MIS ORGANIZACIONES
Archivo: `owner/11-cuenta-memberships.html`
Path: /cuenta/memberships
Rol: autenticado

Layout (shell dueño):
- Breadcrumb "Tu cuenta › Mis organizaciones"
- h1 "Mis organizaciones"
- Sub: "Sos miembro de las siguientes organizaciones"
- Grid de cards (una por org):
  - Logo placeholder cuadrado + nombre + chip rol membership (admin/coordinator/member/volunteer/foster/vet_individual) + chips de capabilities ("Escribir eventos", "Adopciones")
  - Acción contextual: "Renunciar" (link rojo pequeño)
- Card de empty/CTA al final: "¿Tu organización todavía no está en MiMAR? Crear una"

Variante empty state: card sola "Todavía no sos miembro de ninguna organización. [Crear una]"

---

S1.5 · SOLICITUDES RECIBIDAS
Archivo: `owner/12-cuenta-solicitudes.html`
Path: /cuenta/solicitudes

Layout (shell dueño):
- Breadcrumb "Tu cuenta › Solicitudes"
- h1 "Solicitudes que recibiste"
- Sub: "Organizaciones que te invitaron a sumarte"
- Lista de cards:
  - Logo org + nombre + chip "Te proponen: [rol]" + fecha + chip "Expira en X días"
  - Botones por card: "Aprobar" (primary) · "Rechazar" (outline)
- Empty: "No tenés solicitudes pendientes."

---

S1.6 · SELECTOR DE ORGANIZACIÓN
Archivo: `org/00-picker.html`
Path: /org
Rol: autenticado con ≥2 memberships (color org verde #1e7a3e)

Layout (standalone, NO usa shell de org porque no hay org elegida aún):
- Centrado vertical, max-w-2xl
- h1 "Elegí una organización"
- Sub: "Sos miembro de varias. ¿En cuál querés operar hoy?"
- Grid de cards grandes (2 columnas en desktop, 1 en mobile):
  - Logo + nombre + chip rol membership + última actividad ("Último acceso: hace 2 horas") + chip ubicación
  - Card entera clickeable
- CTA secundario al final: "+ Crear nueva organización"

---

S1.7 · RECLAMAR MASCOTA
Archivo: `owner/13-reclamar.html`
Path: /mis-mascotas/reclamar
Rol: dueño autenticado

Layout (shell dueño):
- Breadcrumb "Mis mascotas › Reclamar"
- h1 "Reclamar una mascota"
- Sub: "Si tu mascota ya está registrada en MiMAR con un chip o tatuaje a nombre de otra persona, podés iniciar el reclamo."
- Form card:
  - Tabs/segmented control: "Por microchip" | "Por tatuaje"
  - Input principal con el número
  - Submit "Buscar"
- Resultado (mostrá 3 variantes en la misma pantalla apiladas con divider):
  1. **Mascota encontrada, libre**: card con foto + nombre + chips + botón "Reclamarla"
  2. **Mascota encontrada, con dueño**: card + banner "Esta mascota ya tiene dueño registrado. Para reclamarla iniciá una disputa de custodia." + botón "Iniciar disputa"
  3. **Mascota no encontrada**: card vacío + texto "No encontramos ese chip en MiMAR." + botón "Registrar como nueva mascota"

Bonus: mostrá el banner especial "Esta mascota está marcada como PERDIDA desde [fecha]. ¿La encontraste? Iniciá la devolución." cuando aplique.

---

Cuando termines las 7, decime y arrancamos con Sprint 2.
```

---

## BLOQUE D2 — Sprint 2 (11 pantallas)

```
SPRINT 2 — Adopción + turnos. Diseñá 11 pantallas más manteniendo el estilo. Sigamos numerando dentro de cada carpeta de rol.

---

S2.1 · DETALLE DE MASCOTA ADOPTABLE (público)
Archivo: `public/10-adoptar-pet.html`
Path: /adoptar/[petToken]

Layout (shell público):
- Galería: 1 imagen hero grande + thumbnails carrusel debajo
- h1 nombre con chip "Adoptable" verde al lado
- Row de chips de metadata: especie · raza · edad estimada · sexo · tamaño
- Bloque "Sobre [nombre]" — texto descriptivo largo
- Bloque "Salud" (card con grid 2 cols):
  - ✓ Vacunación al día / ✗ Pendiente
  - ✓ Esterilizado/a / ✗ No esterilizado/a
  - Condiciones permanentes (lista)
- Bloque "Personalidad" — chips coloreados: "Bueno con niños", "Bueno con gatos", "Energía media", etc.
- Bloque "Refugio" (card):
  - Logo + nombre del refugio + ubicación + link "Ver perfil del refugio"
- CTA sticky bottom (mobile) / lateral (desktop): "Postular para adoptar a [nombre]"

Variante: cuando NO está autenticado, el CTA dice "Iniciar sesión para postular" y abre tooltip explicando.

---

S2.2 · POSTULACIÓN DE ADOPCIÓN
Archivo: `public/11-adoptar-postular.html`
Path: /adoptar/[petToken]/postular

Layout (shell público minimalista, ya autenticado):
- Header: thumbnail pet + nombre + "Postulación de adopción"
- Banner informativo: "Tu información de contacto se compartirá con el refugio."
- Form (4 campos, NO wizard 28-q):
  1. Textarea (min 50 chars): "¿Por qué querés adoptar a [nombre]?"
  2. Radio group: "¿Tenés experiencia con [especie]?" — opciones: Sí, mucha · Algo · Es mi primera vez
  3. Radio group: "¿Cómo es tu hogar?" — Casa con patio · Departamento · Casa sin patio · Otro
  4. Radio group + textarea condicional: "¿Hay otros animales?" — No · Sí (textarea "Contanos cuáles")
- Bloque "Tus datos de contacto" (read-only, prefilled del perfil): nombre, email, teléfono. Link "Editar mis datos"
- CTA "Enviar postulación" primary full-width
- Helper: "El refugio responde en aproximadamente 5 días."

---

S2.3 · MIS POSTULACIONES
Archivo: `owner/14-postulaciones.html`
Path: /mis-mascotas/postulaciones

Layout (shell dueño):
- Breadcrumb "Mis mascotas › Postulaciones"
- h1 "Mis postulaciones de adopción"
- Filtros chip: Todas · Pendientes · Aprobadas · Rechazadas
- Lista cards:
  - Thumbnail pet + nombre pet + nombre org + chip estado + fecha postulación
  - Botón "Ver detalle"
- Empty: "Todavía no postulaste para adoptar a ninguna mascota. [Explorar adopciones]"

---

S2.4 · BUSCAR TURNOS
Archivo: `owner/15-turnos-buscar.html`
Path: /turnos/buscar

Layout (shell dueño):
- h1 "Buscar turnos"
- Filtros sticky top (en card horizontal):
  - Tipo de servicio (dropdown): Vacunación / Esterilización / Consulta vet / Castración / Microchip / Otro
  - Localidad (autocomplete con localidades AR)
  - Fecha desde — fecha hasta
  - Precio: Cualquiera / Gratis / Hasta $X
- Toggle "Vista de lista | Mapa"
- Lista de offering cards:
  - Nombre servicio (Lora 18px) + org + ubicación (con ícono)
  - Chip de precio o "Gratis" en verde
  - "Próximo turno: [fecha]"
  - Botón "Ver detalle"
- Empty: "No hay servicios con esos filtros."

---

S2.5 · DETALLE DE OFERTA DE TURNO
Archivo: `owner/16-turnos-detalle.html`
Path: /turnos/buscar/[offeringToken]

Layout (shell dueño):
- Breadcrumb
- Hero card:
  - Chip categoría servicio + h1 nombre + chip "Gratis" o precio
  - Sub: org nombre + ubicación
- Bloque "Qué incluye" — bullets descriptivos
- Bloque "Cuándo" — calendar widget de slots (semana actual + siguiente, days as columns, slots as rows). Slots disponibles en blanco, ocupados grises tachados.
- Bloque "Quién lo hace" — avatar + nombre profesional + matrícula vet si aplica
- Bloque "Cómo llegar" — dirección + mini mapa + link "Cómo llegar"
- Bloque "Política de cancelación" — texto legal corto
- CTA sticky "Reservar este turno"

---

S2.6 · CONFIRMAR RESERVA
Archivo: `owner/17-turnos-reservar.html`
Path: /turnos/buscar/[offeringToken]/reservar/[slotId]

Layout (shell dueño):
- Breadcrumb
- h1 "Confirmar tu reserva"
- Card resumen del turno (no editable):
  - Servicio + org + día + hora + duración + precio
- Form:
  - Dropdown "¿Para qué mascota?" — lista de mis mascotas con thumbnails
  - Textarea opcional "Algo que el profesional deba saber"
- Bloque "Política" (texto legal del offering)
- CTA "Confirmar reserva" primary full-width
- Variante de error: banner rojo "Este turno se acaba de tomar. Mirá otros slots disponibles" + lista de alternativas

---

S2.7 · MIS TURNOS
Archivo: `owner/18-mis-turnos.html`
Path: /mis-turnos

Layout (shell dueño):
- h1 "Mis turnos"
- Tabs: Próximos · Historial
- Lista cards:
  - Thumbnail pet + nombre pet + nombre servicio + org + día/hora + chip estado (Confirmado/Cancelado/Asistió/No asistió)
  - Click → detalle
- Empty: "No tenés turnos próximos. [Explorar servicios]"

---

S2.8 · DETALLE DE TURNO
Archivo: `owner/19-mis-turno-detalle.html`
Path: /mis-turnos/[appointmentToken]

Layout (shell dueño):
- Breadcrumb
- Hero card (mismo formato que S2.6 resumen) + chip estado grande
- Bloque "Antes del turno" — checklist (carnet, ayuno, etc.) si aplica
- Bloque "Cómo llegar" — mapa + dirección
- Acciones (botones row): "Reprogramar" outline · "Cancelar turno" outline rojo · "Cómo llegar" outline
- Después del turno (variante a mostrar): bloque verde "Evento registrado el [fecha]" + link al pet_event creado

---

S2.9 · NUEVO SERVICIO (org)
Archivo: `org/08-servicio-nuevo.html`
Path: /org/[orgToken]/servicios/nuevo
Rol: org admin/coordinator (color org verde)

Layout (shell org con sidebar):
- Breadcrumb "Servicios › Nuevo"
- h1 "Publicar servicio"
- Stepper: 1. Qué es → 2. Cuándo → 3. Quién
- Paso 1 (form):
  - Nombre del servicio
  - Tipo (radios con íconos): Vacunación · Esterilización · Consulta vet · Microchip · Otro
  - Descripción (textarea)
  - Precio (radio: Gratis · Pagado) + input numérico condicional
  - Submit "Continuar"

Mostrá los 3 pasos en la misma pantalla apilados con divider.

Paso 2:
- Duración del slot (dropdown: 15/30/45/60 min)
- Capacidad por slot (input numérico, default 1)
- Días/horarios template (grid de días con time-pickers desde-hasta)
- Submit "Continuar"

Paso 3:
- Dropdown "Responsable" (lista de miembros del staff)
- Si tipo=vacunación o consulta: input matrícula vet (con validación)
- Submit "Publicar servicio"

---

S2.10 · DETALLE DE SERVICIO (org)
Archivo: `org/09-servicio-detalle.html`
Path: /org/[orgToken]/servicios/[offeringToken]

Layout (shell org):
- Breadcrumb
- Hero: h1 nombre + chip estado (Activo verde / Pausado amarillo)
- Bloque "Detalle" (card editable inline con accordions):
  - Lo básico (nombre/tipo/descripción/precio)
  - Disponibilidad (slots template)
  - Responsable
- Bloque "Métricas" (card con 4 metric-cards):
  - Turnos próximos (count)
  - Ocupación últimos 30d (%)
  - Asistencia % últimos 30d
  - Reseñas (avg + count)
- Botones top: "Ver agenda" · "Pausar" · "Eliminar" (rojo pequeño)

---

S2.11 · AGENDA DE SERVICIO (org)
Archivo: `org/10-servicio-agenda.html`
Path: /org/[orgToken]/servicios/[offeringToken]/agenda

Layout (shell org):
- Breadcrumb
- Toggle vista: Semana | Mes
- Calendar grid:
  - Columnas = días, filas = horas
  - Cada slot muestra "X/Y" reservados (X actuales, Y capacidad)
  - Color: verde si libre, amarillo si parcial, rojo si lleno, gris si bloqueado
- Click en slot abre panel lateral con lista de reservas + acciones (bloquear/crear manual)
- Acciones top: "Bloquear día" · "Crear turno manual" · "Exportar CSV"

---

Cuando termines, decime y vamos a Sprint 3.
```

---

## BLOQUE D3 — Sprint 3 (8 pantallas)

```
SPRINT 3 — Govt value prop. Color rol rojo institucional #b71c1c. Diseñá 8 pantallas del portal gobierno.

---

S3.1 · VIGILANCIA — RESUMEN
Archivo: `govt/11-vigilancia.html`
Path: /gob/vigilancia

Layout (shell gob):
- Header con chip JurisdictionSwitcher (ej "CABA · Comuna 2") + PeriodPicker (7d/30d/90d/custom)
- h1 "Vigilancia epidemiológica"
- Grid de 4 MetricCards:
  - Zoonosis declaradas (count + delta vs período anterior)
  - Síntomas reportados
  - Brotes activos
  - Observaciones rábicas activas
- Bloque "Síntomas en el tiempo" — TimeSeriesChart (área stacked por categoría)
- Bloque "Densidad por barrio" — MapChoropleth con leyenda
- Bloque "Señales recientes" — lista cards: fecha + síntoma + barrio + link al caso

---

S3.2 · BROTES
Archivo: `govt/12-vigilancia-brotes.html`
Path: /gob/vigilancia/brotes

Layout (shell gob):
- Breadcrumb "Vigilancia › Brotes"
- h1 "Brotes"
- Tabs: Activos · Cerrados
- CTA top: "Declarar brote nuevo"
- Lista cards: enfermedad + chip especie + localidad + N casos + desde + estado (con color)

---

S3.3 · ZOONOSIS
Archivo: `govt/13-vigilancia-zoonosis.html`
Path: /gob/vigilancia/zoonosis

Layout (shell gob):
- Breadcrumb "Vigilancia › Zoonosis"
- h1 "Eventos zoonóticos"
- Filtros: enfermedad (dropdown) · especie · severidad
- Lista cards: enfermedad + sparkline temporal mini + chip severidad + última actividad
- Botón top "Exportar CSV"

---

S3.4 · DISPUTAS QUEUE
Archivo: `govt/14-disputas.html`
Path: /gob/disputas

Layout (shell gob):
- h1 "Disputas de custodia"
- Tabs: Mías asignadas · Sin asignar · Cerradas
- Filtros: estado · prioridad · antigüedad
- Lista cards: thumbnail pet + chip prioridad + nombres partes + "Abierta hace X días" + chip estado
- Acción contextual por card: "Asignarme" (si sin asignar) / "Ver expediente"

---

S3.5 · EXPEDIENTE DE DISPUTA
Archivo: `govt/15-disputa-detalle.html`
Path: /gob/disputas/[disputeToken]

Layout (shell gob):
- Breadcrumb "Disputas › Expediente"
- Hero: thumbnail pet + nombre + chip estado disputa + chip prioridad
- Bloque "Partes" (card con 2-3 columnas):
  - Por cada parte (owner A / owner B / org): nombre + chip rol + "Custodio desde [fecha]" + link a eventos relevantes
- Bloque "Timeline" — vertical timeline con events filtrados (registros, transferencias, denuncias, observaciones)
- Bloque "Evidencia adjunta" — grid de attachments (PDFs, fotos) + botón "Solicitar más"
- Bloque "Notas internas" — solo gov/admin, lista cronológica con autor
- Acciones bottom: "Decidir disputa" primary · "Solicitar evidencia" outline · "Escalar" outline · "Cerrar" outline

---

S3.6 · MASCOTAS PERDIDAS (govt)
Archivo: `govt/16-perdidas.html`
Path: /gob/perdidas

Layout (shell gob):
- h1 "Mascotas perdidas"
- Filtros: especie · días desde reporte · barrio
- MetricCards top: Total activas · Recuperadas últimos 30d · Sin chip
- MapChoropleth con pins (cluster si zoom out)
- Lista cards: thumbnail + nombre pet + última ubicación + "Reportada hace X días" + chips (chip/tatuaje)

---

S3.7 · REGLAS JURISDICCIONALES (govt, read-only)
Archivo: `govt/17-reglas.html`
Path: /gob/reglas

Layout (shell gob):
- h1 "Reglas jurisdiccionales"
- Tabs país / provincia / localidad
- Lista de reglas: nombre + chip tipo (PPP, antirrábica, etc.) + vigencia (desde-hasta) + link "Ver texto"
- Banner info: "Las reglas las edita la administración nacional. Para sugerir cambios, contactá a admin@."

---

S3.8 · ANALYTICS + HISTORIAL (govt)
Archivo: `govt/18-analytics.html`
Path: /gob/analytics

Layout (shell gob):
- h1 "Analytics"
- Tabs: KPIs · Historial de acciones · Export
- KPIs (default tab):
  - Grid de MetricCards: servicios activos, denuncias del período, adopciones del período, cobertura vacunación %
  - 2 TimeSeriesCharts: eventos por mes, denuncias por categoría
  - Tabla rankeada: top orgs por servicios, top barrios por denuncias
- Historial tab: lista paginada de acciones tomadas por el agent (audit log)
- Export tab: wizard para export async (dataset · rango · formato CSV/JSON · email destino) + lista "Mis exports recientes"

---

Cuando termines, vamos a Sprint 4.
```

---

## BLOQUE D4 — Sprint 4 (15 pantallas)

```
SPRINT 4 — Foster, transferencias, maltrato, notificaciones. 15 pantallas.

[Por brevedad, te paso solo paths + intent. Pedime cualquiera en detalle si necesitás más spec.]

OWNER:
- `owner/20-transitos-activos.html` — /cuenta/transitos/activos — Lista de mascotas que tengo en foster ahora (cards con pet + org + desde + chip "Co-foster")
- `owner/21-transitos-propuestas.html` — /cuenta/transitos/propuestas — Lista cards: org + pet + chip "expira en X días" + CTA "Ofrecerme como tránsito" secundario
- `owner/22-transitos-propuesta-detalle.html` — /cuenta/transitos/propuestas/[token] — Detalle pet + condiciones + botones Aceptar/Rechazar
- `owner/23-transitos-historial.html` — /cuenta/transitos/historial — Archivo cronológico de tránsitos cerrados
- `owner/24-notificaciones.html` — /notificaciones — Inbox con tabs Todo/Recordatorios/Avisos/Comunidad, lista con estado leído/no-leído, CTA contextual por item
- `owner/25-denuncias-mias.html` — /denuncias/mias — Lista cards: código + estado + fecha
- `owner/26-denuncia-detalle.html` — /denuncias/[id] — Detalle denuncia firmada + comentarios + agregar evidencia

ORG:
- `org/11-voluntarios.html` — /org/[orgToken]/voluntarios — Tabs Activos/Disponibles/Histórico + lista cards: nombre + capacidades + zona + última actividad
- `org/12-voluntarios-propuestas.html` — /org/[orgToken]/voluntarios/propuestas — Lista con estados (enviada/aceptada/rechazada/expirada)
- `org/13-transitos.html` — /org/[orgToken]/transitos — Vista unificada tránsitos org (member-based + voluntarios externos)
- `org/14-transferencias.html` — /org/[orgToken]/transferencias — Lista cards de transferencias salientes + CTA "Nueva"
- `org/15-transferencias-nueva.html` — /org/[orgToken]/transferencias/nueva — Wizard 3 pasos: mascota / destino (search org) / confirmar (razón + T&Cs)
- `org/16-transferencias-recibidas.html` — /org/[orgToken]/transferencias/recibidas — Lista con acciones Aceptar/Rechazar
- `org/17-maltrato-recibidos.html` — /org/[orgToken]/maltrato/recibidos — Queue con prioridad, estado, fecha
- `org/18-maltrato-nuevo.html` — /org/[orgToken]/maltrato/nuevo — Form firmado por la org (similar al wizard público pero con autocomplete de pets en custodia)
- `org/19-mordedura-nuevo.html` — /org/[orgToken]/mordedura/nuevo — Form bite incident: víctima (humano/animal), severidad, provocación, lugar, fecha, observación rábica required auto-checked si humano+skin break

Mantené el estilo del index y las convenciones de los sprints anteriores. Cuando termines, vamos a Sprint 5.
```

---

## BLOQUE D5 — Sprint 5 (8 pantallas)

```
SPRINT 5 — Owner eventos especiales + tab Vacunas. 8 pantallas.

- `owner/27-pet-vacunas.html` — Pet detail tab Vacunas (?tab=vacunas) — Bloque "Estado de vacunación" con badges (Antirrábica vigente/pendiente/vencida) + calendario próximas dosis + historial completo + CTA "Programar próxima vacuna"
- `owner/28-vacuna-programar.html` — /mis-mascotas/[token]/vacunas/programar — Picker de vacuna + fecha sugerida auto + checkbox "¿Reservar turno?" con link a /turnos/buscar
- `owner/29-anotar.html` — /mis-mascotas/[token]/anotar — Quick-capture mobile-first: hero pet chip + textarea grande "¿Qué pasó hoy?" + 5 chips quick (Vacuna/Peso/Síntoma/Medicación/Nota) + parser hint inline mientras escribís
- `owner/30-asistencia-presentar.html` — /mis-mascotas/[token]/asistencia/presentar — Pantalla para mostrar al vet en la clínica: hero pet + nombre dueño + chip turno + QR GRANDE con appointment_token + botón "Presentar" que marca asistencia
- `owner/31-devolucion.html` — /mis-mascotas/[token]/devolucion — Form de devolución al refugio: radios razón + fecha sugerida + textarea notas + confirmar
- `owner/32-ppp-atestar.html` — /mis-mascotas/[token]/eventos/atestar-raza-peligrosa — Wizard 2 pasos: checkboxes legales requeridos / firma digital + foto + ubicación
- `owner/33-evento-detalle.html` — /mis-mascotas/[token]/eventos/[eventId] — Read-only: tipo de evento chip + fecha + autor chip rol + payload renderizado por tipo + adjuntos + banner "Append-only: no editable. Para corregir, agregá una nota."
- `owner/34-nueva-match.html` — /mis-mascotas/nueva/match/[matchedToken] — Banner "Encontramos esta mascota con el mismo chip:" + card pet + 3 opciones: "Es la misma — reclamarla" / "No es la misma — registrar igual" (con captcha + warning legal) / "Cancelar"

Cuando termines, vamos a Sprint 6.
```

---

## BLOQUE D6 — Sprint 6 (4 pantallas)

```
SPRINT 6 — Públicas secundarias. 4 pantallas.

- `public/12-landing.html` — / (Marketing landing) — Hero con value prop + 3 CTAs (Soy dueño / Soy refugio / Soy gobierno) + bloques explicativos (¿Qué es la credencial? / ¿Cómo reportar perdida? / ¿Cómo denunciar? / ¿Cómo adoptar?) + footer con legales. Estilo cálido, primera impresión.
- `public/13-refugio-publico.html` — /refugios/[orgToken] — Perfil público refugio: hero logo + nombre + ubicación + chips verificación + bloques "Sobre nosotros" / "Mascotas en adopción" (grid linkeable) / "Servicios" (lista linkeable) / "Contacto" (email + tel + maps). Variante: banner "No verificada por autoridad sanitaria" si aplica.
- `public/14-caso-publico.html` — /casos/[publicCode] — Hero "Caso [CODE]" + chip estado + timeline público (eventos que la jurisdicción decide hacer públicos) + NO revela datos personales.
- `public/15-libreta-compartida.html` — /libreta/compartir/[shareToken] — Hero pet + chip "Compartido por [dueño]" + chip "Expira en X horas" + libreta sanitaria filtrada por category=medical + banner "Esta libreta es pública por tiempo limitado. Para registrar eventos, el vet debe iniciar sesión."

Cuando termines, hablamos de Sprint 7 (admin platform, opcional).
```

---

## BLOQUE D7 — Sprint 7 (OPCIONAL — admin platform)

```
SPRINT 7 — Admin platform. Solo si lo necesitamos para la demo. 13-15 pantallas. Color rol mostaza #9c6700.

Sub-rutas a diseñar:
- `admin/02-admins.html` — Lista de admins
- `admin/03-admins-new.html` — Crear admin
- `admin/04-admin-detalle.html` — Detalle de un admin
- `admin/05-govts.html` — Lista de govt agents
- `admin/06-govts-new.html` — Crear govt agent
- `admin/07-govt-detalle.html` — Detalle de govt agent
- `admin/08-moderacion.html` — Queue de moderación welfare
- `admin/09-moderacion-item.html` — Detalle item de moderación
- `admin/10-jurisdicciones.html` — Index de jurisdicciones (país/provincia/localidad tree)
- `admin/11-reglas-list.html` — Reglas por localidad
- `admin/12-regla-form.html` — Form nueva/editar regla
- `admin/13-auditoria.html` — Audit log universal
- `admin/14-outbox.html` — Outbox event queue
- `admin/15-outbox-item.html` — Outbox event detail (payload + retry)
- `admin/16-observaciones.html` — Observaciones queue
- `admin/17-observacion-detalle.html` — Detalle + acciones (reasignar, reemplazar microchip)
- `admin/18-sistema.html` — Health dashboard (DB, jobs, latencia, errores)
- `admin/19-historial.html` — Historial admin scope

Decime si lo necesitamos y te paso el spec detallado por pantalla.
```

---

## Tips para sacarle más jugo a claude.ai/design

1. **Una sesión por sprint.** Si la sesión se "atonta" o pierde estilo, abrila nueva y volvé a pegar los bloques A+B+C antes del siguiente sprint.
2. **Subí los archivos HTML existentes.** Si Claude Design soporta upload (lo hace), subí los 48 archivos ya generados como referencia visual. Le ayuda muchísimo.
3. **Iterá pantalla por pantalla.** Si te devuelve un layout que no te gusta, pegale solo el HTML y decile qué cambiar ("hacé el header más chico, mové la CTA arriba, los chips en la primera fila"). No vuelvas a pegar todo el sprint.
4. **Verificá los estados.** Pedile siempre las variantes: empty / loading / error / disabled. Ahorra rondas.
5. **Pegale screenshots de ejemplos reales** si querés que un patrón se parezca a algo específico (no de competidores — pegá patterns genéricos como "calendar de Cal.com").
6. **Si rompe la consistencia,** pegale la URL del archivo HTML de referencia y decile "seguí EXACTAMENTE el patrón de este archivo".
7. **No le pidas más de 5 pantallas por turno** si querés calidad alta. Las podés acumular en orden.

---

## Decisiones que tenés que cerrar antes de arrancar Sprint 1

Decirle a Claude Design la respuesta de estas 5 cosas (van en el Bloque A o por separado):

1. **Modal-12 accesible desde owner flow** — Sí/No
2. **Sheet library / framework** — Vaul (recomendado), Radix, o custom (afecta cómo dibujás los modales en mobile vs desktop)
3. **Wizard alta** — accordions o stepper (afecta S2.9 y el wizard de alta de mascota existente)
4. **Tier 2 público** — ¿incluir la pantalla pública receptora en S6 o diferir?
5. **Marketing landing** — ¿reusamos lo de feat/landing-redesign (pediríamos a Claude Design que la copie) o rediseñamos desde cero?

Cuando tengas respuestas, agregalas al final del Bloque A antes de pegarlo.

---

*Generado 2026-05-26. Companion del brief de diseño.*
