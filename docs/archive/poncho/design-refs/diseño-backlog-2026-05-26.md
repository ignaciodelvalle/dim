# MiMAR — Brief de diseño · pantallas faltantes

**Fecha:** 2026-05-26
**Companion de:** `reporte-pantallas-faltantes-2026-05-26.md`
**Total a diseñar:** ~40 pantallas + 0 sheets (modal-12 ya cubre todos los eventos médicos)

## Cómo leer este doc

Cada pantalla está descrita con:
- **Path** — ruta exacta en Next.js (App Router)
- **Quién** — rol que la ve
- **Intent** — qué va a hacer el usuario en esta pantalla
- **Layout** — secciones principales (mobile-first)
- **Datos** — campos visibles
- **Acciones primarias** — botones / sheets que abre
- **Empty / loading / edge cases** — estados a diseñar explícitamente
- **Sheets que abre** — IDs del catálogo `?sheet=<id>`
- **Tests asociados** — referencia al ciclo de prueba

Las pantallas están agrupadas por **sprint sugerido** (S1 = primera tanda, S5 = última).

---

# SPRINT 1 — Desbloquear demo end-to-end

Sin estas pantallas no se puede recorrer un solo flujo completo. Objetivo: que un usuario nuevo pueda registrarse, ver su mascota, y crear una org. **6 pantallas + 1 picker.**

## S1.1 · `/login` (Auth)

- **Quién:** anónimo (autenticados se redirigen server-side)
- **Intent:** iniciar sesión
- **Layout:**
  - Standalone, no header `(public)`. `min-h-screen` centrado, max-w-sm
  - h1 "Iniciar sesión" (3xl semibold)
  - Helper text condicional: default "Bienvenido de vuelta a MiMAR" / si `?intent=apply` → "Iniciá sesión para continuar con tu postulación"
  - Botón **"Conectar con Mi Argentina (próximamente)"** disabled, neutral-300 border, cursor-not-allowed
  - Divider con la palabra "o"
  - Form email + password + submit black full-width
  - Inline error rojo con `role="alert"`
  - Footer "¿No tenés cuenta? Crear cuenta" (preserva `intent` y `returnTo`)
- **Acciones:** Submit → `loginAction(formData)` → redirect a `returnTo` o landing por rol
- **Edge cases:** wrong creds (rojo), submit pending ("Ingresando..."), Mi Argentina permanentemente disabled

## S1.2 · `/signup` (Auth)

- **Quién:** anónimo
- **Intent:** crear cuenta personal (owner por default)
- **Layout:** mismo shell que login. Two-step inline (no modals):
  - **Paso 1:** email + password + confirmar password + checkbox "Acepto términos"
  - **Paso 2:** nombre + apellido + DNI (opcional, link "Verificar después")
- **Datos:** todos los campos requeridos excepto DNI
- **Acciones:** Submit paso 2 → `signupAction` → crea profile con role=owner → redirect a `/inicio` o `returnTo`
- **Sheets:** ninguno
- **Tests:** `dni-next`, `profile`, `role-upgrade`

## S1.3 · `/cuenta` (Owner)

- **Quién:** cualquier autenticado
- **Intent:** ver y editar perfil propio, manejar settings
- **Layout:**
  - Header con avatar + nombre + email + chip de rol
  - **Bloque "Tu identidad"**: nombre, DNI, teléfono — chip "Verificado" si `dni_verified_at`
  - **Bloque "Tu cuenta"**: email (readonly), contraseña (link "Cambiar")
  - **Bloque "Privacidad"** — toggles de disclosure preferences:
    - Mostrar mi nombre en credencial pública
    - Mostrar mi teléfono en credencial
    - Permitir que orgs me contacten
    - Permitir alertas de mascotas perdidas en mi zona
  - **Bloque "Acciones"** — links a `/cuenta/memberships`, `/cuenta/solicitudes`, `/cuenta/transitos/*`, "Crear organización", "Crear consultorio veterinario", "Desactivar cuenta", "Cerrar sesión"
- **Sheets que abre:** `editar-perfil`, `verificar-dni`, `cambiar-contrasena`, `desactivar-cuenta`, `crear-organizacion`, `crear-consultorio`, `cerrar-sesion`
- **Tests:** `profile`, `profile-self-service`, `dni-verification`, `disclosure-prefs`

## S1.4 · `/cuenta/memberships` (Owner)

- **Intent:** ver en qué orgs soy miembro y con qué rol
- **Layout:**
  - h1 "Mis organizaciones"
  - Lista de cards (una por org): logo + nombre + chip de rol membership (admin/coordinator/member/volunteer/foster/vet_individual) + capability flags
  - CTA "Solicitar membership" si hay orgs vinculables
- **Empty state:** "Todavía no sos miembro de ninguna organización."
- **Sheets:** `renunciar-rol`, `ofrecerme-transito`
- **Tests:** `org-welfare-report`, `institutional-scope`

## S1.5 · `/cuenta/solicitudes` (Owner)

- **Intent:** ver approval requests recibidos (otra org te invita)
- **Layout:** lista de solicitudes pendientes (org, rol propuesto, fecha, expira en X días). Acciones por card: **Aprobar** · **Rechazar**.
- **Empty:** "No tenés solicitudes pendientes."
- **Sheets:** `aprobar-solicitud`, `rechazar-solicitud`
- **Tests:** `approval-request-withdraw`

## S1.6 · `/org` (Org picker · root)

- **Quién:** autenticados con ≥1 membership
- **Intent:** elegir qué org operar cuando sos miembro de varias
- **Layout:**
  - Si tenés 1 org: redirect inmediato a `/org/[orgToken]`
  - Si tenés 2+: lista de cards con logo, nombre, rol membership, última actividad
  - CTA "Crear nueva organización"
- **Empty:** "Todavía no sos miembro de ninguna organización. [Crear una.]"

## S1.7 · `/mis-mascotas/reclamar` (Owner)

- **Intent:** reclamar una mascota cuyo chip ya está registrado bajo otro dueño/sin dueño
- **Layout:**
  - h1 "Reclamar mascota"
  - Form: número de microchip o tatuaje
  - Resultado de búsqueda (después de submit):
    - **Caso 1: existe y libre** — card de la mascota + botón "Reclamarla"
    - **Caso 2: existe con dueño activo** — mensaje "Ya tiene dueño. Iniciar disputa."
    - **Caso 3: no existe** — "No encontramos ese chip. ¿Querés registrarla como nueva?"
  - Si la mascota está marcada perdida: badge "Perdida desde [fecha]" + flujo de devolución
- **Sheets:** `claim-gate` (confirma identidad antes de transferir ownership)
- **Tests:** `claim-gate`, `chip-match`, `microchip-validation`
- **Edge cases:** chip duplicado, chip reemplazado (`microchip-replaced`), pet en custodia de org

---

# SPRINT 2 — Adopción + turnos (los workflows más vistosos)

Estos dos flujos son la cara de la demo. Sin ellos los catálogos quedan colgando. **10 pantallas.**

## S2.1 · `/adoptar/[petToken]` (Público)

- **Intent:** ver el detalle de una mascota adoptable; convencerse de postular
- **Layout:**
  - Galería de fotos (1 hero + carrusel)
  - h1 nombre · chip especie · chip raza · chip edad estimada · chip sexo · chip tamaño
  - **Bloque "Sobre [nombre]"** — historia (texto libre)
  - **Bloque "Salud"** — vacunado ✓/✗, esterilizado ✓/✗, condiciones permanentes (lista)
  - **Bloque "Personalidad"** — chips: bueno con niños, bueno con gatos, energía baja/media/alta, etc.
  - **Bloque "Refugio"** — logo + nombre + ubicación + link `/refugios/[orgToken]`
  - CTA principal "Postular para adoptar [nombre]"
- **Si no auth:** CTA abre `/login?intent=apply&returnTo=/adoptar/[petToken]/postular`
- **Edge cases:** mascota ya adoptada (badge "Adoptada", CTA grayed), mascota pausada por org (banner "Esta mascota no está disponible ahora"), foto faltante (placeholder)
- **Tests:** `adoption-listing`, `apply-intent`

## S2.2 · `/adoptar/[petToken]/postular` (Owner authenticated)

- **Intent:** completar postulación de adopción
- **Layout:**
  - h1 "Postular para adoptar a [nombre]" + thumbnail
  - Form 4 campos (versión MVP, no la wizard 28-q diferida):
    1. **¿Por qué querés adoptar a [nombre]?** — textarea, min 50 chars
    2. **¿Tenés experiencia con [especie]?** — radio: Sí / Algo / Es mi primera vez
    3. **¿Cómo es tu hogar?** — radio: Casa con patio / Departamento / Casa sin patio / Otro
    4. **¿Hay otros animales en el hogar?** — radio + textarea opcional
  - Banner "Tu información de contacto se compartirá con el refugio."
  - Submit "Enviar postulación"
- **Después de submit:** redirect a `/mis-mascotas/postulaciones?new=[appId]` con toast de éxito
- **Tests:** `adoption-applications`, `adoption-review`

## S2.3 · `/mis-mascotas/postulaciones` (Owner)

- **Intent:** ver postulaciones que envié + su estado
- **Layout:**
  - h1 "Mis postulaciones"
  - Lista de cards: foto pet + nombre + org + estado (pendiente/aprobada/rechazada/retirada) + fecha
  - Cada card linka a `/adoptar/[petToken]` (read-only de la postulación)
- **Empty:** "Todavía no postulaste para adoptar a ninguna mascota. [Explorar adopciones]"
- **Tests:** `adoption-applications`, `adoption-cascade`

## S2.4 · `/turnos/buscar` (Owner)

- **Intent:** explorar servicios disponibles (vacunación, esterilización, consulta vet)
- **Layout:**
  - Filtros sticky top: tipo de servicio · localidad · fecha · precio
  - Lista de offering cards: nombre del servicio + org + ubicación + precio (o "Gratis") + próximo slot disponible
  - Mapa toggleable (opcional, P2)
- **Empty:** "No hay servicios disponibles con esos filtros."
- **Tests:** `business-rules-flow`, `business-rules-resolver`

## S2.5 · `/turnos/buscar/[offeringToken]` (Owner)

- **Intent:** elegir slot y reservar
- **Layout:**
  - Hero: nombre del servicio + org + chip "Gratis" o precio
  - **Bloque "Qué incluye"** — descripción libre
  - **Bloque "Cuándo"** — calendar widget con slots disponibles (próximos 30 días), agrupado por día
  - **Bloque "Quién lo hace"** — nombre del profesional/refugio + matrícula si vet
  - **Bloque "Cómo llegar"** — dirección + link Maps
  - CTA "Reservar este turno" → `/turnos/buscar/[offeringToken]/reservar/[slotId]`
- **Edge cases:** sin slots disponibles, servicio pausado, fuera de jurisdicción
- **Tests:** `booking`

## S2.6 · `/turnos/buscar/[offeringToken]/reservar/[slotId]` (Owner)

- **Intent:** confirmar reserva con datos del turno
- **Layout:**
  - h1 "Confirmar reserva"
  - Resumen del turno: servicio + org + día/hora + duración + precio
  - **Picker "¿Para qué mascota?"** — dropdown con `/mis-mascotas`
  - Textarea "Algo que el profesional deba saber (opcional)"
  - Bloque "Política de cancelación" (texto del offering)
  - CTA "Confirmar reserva"
- **Después:** redirect a `/mis-turnos/[appointmentToken]` + toast "Turno reservado"
- **Race condition:** si el slot se tomó mientras estabas viendo, mostrar error inline + sugerir otros slots
- **Tests:** `booking`, `booking-race`

## S2.7 · `/mis-turnos` (Owner)

- **Intent:** ver mis turnos próximos + pasados
- **Layout:**
  - Tabs: **Próximos** · **Historial**
  - Lista cards: mascota + servicio + org + día/hora + estado (confirmado/cancelado/asistió/no asistió)
- **Empty:** "No tenés turnos próximos. [Explorar servicios]"

## S2.8 · `/mis-turnos/[appointmentToken]` (Owner)

- **Intent:** ver detalle de un turno; cancelar / reprogramar
- **Layout:**
  - Resumen turno (igual que S2.6)
  - **Bloque "Antes del turno"** — checklist (carnet de vacunas / ayuno / etc., si el offering lo define)
  - Botones: **Reprogramar** · **Cancelar turno** · **Cómo llegar**
  - Después del turno: bloque "Evento registrado" (link al `pet_event` que creó la asistencia)
- **Sheets:** `cancelar-turno`, `reprogramar`
- **Tests:** `scheduling-attendance`

## S2.9 · `/org/[orgToken]/servicios/nuevo` (Org · admin/coordinator)

- **Intent:** publicar un servicio nuevo
- **Layout:** wizard 3 pasos:
  1. **Qué es** — nombre, tipo (vacuna/esterilización/consulta/otro), descripción, precio o gratis
  2. **Cuándo** — política de duración, capacidad por slot, días/horarios template (recurring)
  3. **Quién** — responsable (member del staff), matrícula si vet
- **CTA final:** "Publicar servicio"
- **Edge cases:** validación de matrícula vet, conflicto con otros servicios

## S2.10 · `/org/[orgToken]/servicios/[offeringToken]` (Org)

- **Intent:** ver/editar detalle de un servicio publicado
- **Layout:**
  - h1 nombre + chips de estado (Activo/Pausado)
  - **Bloque "Detalle"** — todos los campos del wizard, editables inline
  - **Bloque "Métricas"** — turnos próximos, ocupación últimos 30d, asistencia %
  - Acciones: **Pausar**, **Eliminar**, **Ver agenda** → `/org/.../servicios/[token]/agenda`
- **Sheets:** `editar-servicio`, `pausar-servicio`, `eliminar-servicio`

## S2.11 · `/org/[orgToken]/servicios/[offeringToken]/agenda` (Org)

- **Intent:** ver/gestionar la agenda de slots para este servicio
- **Layout:**
  - Vista calendar semanal por default (toggleable a mes)
  - Slots con count "X de Y reservados"
  - Acciones: bloquear slot, crear slot manual, ver detalle de slot (lista de reservas)
- **Sheets:** `bloquear-slot`, `crear-turno-manual`

---

# SPRINT 3 — Govt value prop

Vigilancia, disputas y perdidas son la razón de existir del portal gobierno. **8 pantallas.**

## S3.1 · `/gob/vigilancia` (Govt)

- **Intent:** resumen epidemiológico de la jurisdicción
- **Layout:**
  - JurisdictionSwitcher (chip top) + PeriodPicker (7d/30d/90d/custom)
  - **Grid de MetricCards:** zoonosis declaradas · síntomas reportados · brotes activos · observaciones rábicas
  - **TimeSeriesChart** — síntomas por categoría a lo largo del tiempo
  - **MapChoropleth** — densidad de casos por barrio/localidad
  - Lista "Señales recientes" con link a cada caso
- **Tests:** `symptom-surveillance`, `disease-diagnosis-flow`

## S3.2 · `/gob/vigilancia/brotes` (Govt)

- **Intent:** gestionar brotes declarados (abrir, escalar, cerrar)
- **Layout:**
  - Tabs: Activos · Cerrados
  - Lista cards: enfermedad + localidad + N casos + desde + estado
  - CTA "Declarar brote"
- **Sheets:** `declarar-brote`, `cerrar-brote`, `filtrar-especie`
- **Tests:** `disease-public-alert-catalog`

## S3.3 · `/gob/vigilancia/zoonosis` (Govt)

- **Intent:** vista filtrada de eventos zoonóticos (rabia, leptospirosis, etc.)
- **Layout:**
  - Filtros: enfermedad, especie, severidad
  - Lista de casos con sparkline temporal
  - Export CSV
- **Sheets:** `exportar-csv`, `filtrar-por-jurisdiccion`
- **Tests:** `eno-trigger`, `disease-legal-anchors`

## S3.4 · `/gob/disputas` (Govt)

- **Intent:** queue de disputas de custodia pendientes
- **Layout:**
  - Filtros: estado (abierta/escalada/cerrada), prioridad, antigüedad
  - Lista cards: pet + partes + abierta-hace + estado
  - Tabs: **Mías asignadas** · **Sin asignar** · **Cerradas**
- **Sheets:** `asignarme`, `reasignar`
- **Tests:** `custody-dispute-cases-d4`

## S3.5 · `/gob/disputas/[disputeToken]` (Govt)

- **Intent:** expediente completo + tomar decisión
- **Layout:**
  - Hero: pet + chip estado de disputa
  - **Bloque "Partes"** — owner A (chip + historia con la pet) · owner B (idem) · org si aplica
  - **Bloque "Timeline"** — todos los events relevantes ordenados
  - **Bloque "Evidencia"** — documentos adjuntos
  - **Bloque "Notas internas"** — solo govt/admin
  - Acciones: **Decidir disputa** · **Solicitar evidencia** · **Escalar** · **Cerrar**
- **Sheets:** `decidir-disputa`, `solicitar-evidencia`, `cerrar-disputa`, `escalar-caso`, `agregar-nota-gov`
- **Tests:** `custody-dispute-cases-d4`, `admin-decisions`

## S3.6 · `/gob/perdidas` (Govt)

- **Intent:** mapa + lista de mascotas perdidas en la jurisdicción
- **Layout:**
  - Filtros: especie, días desde reporte, barrio
  - **MapChoropleth** + pins por reporte (cluster si zoom out)
  - Lista cards: foto + nombre + última ubicación + reportada hace + ¿chip? ¿tatuaje?
  - Métricas resumidas: total activas, recuperadas últimos 30d, sin chip
- **Tests:** `lost-cases-d3`, `lost-pet-broadcast`, `lost-listing`

## S3.7 · `/gob/reglas` (Govt)

- **Intent:** ver reglas jurisdiccionales aplicables (read-only para govt; admin las edita)
- **Layout:**
  - Tabs por país/provincia/localidad
  - Lista de reglas: nombre + tipo (PPP, rabies, etc.) + vigencia
- **Tests:** `case-normatives`

## S3.8 · `/gob/historial` + `/gob/analytics` + `/gob/analytics/export` (Govt)

- **Historial:** lista paginada de acciones tomadas por el govt-agent (audit log propio)
- **Analytics:** dashboards de KPIs jurisdiccionales (servicios, denuncias, adopciones, vacunación cobertura)
- **Export:** wizard de export async (selección de dataset, rango temporal, formato CSV/JSON, email destino)
- **Tests:** `govt-dashboards`, `govt-exports`

---

# SPRINT 4 — Foster, transferencias, maltrato, notificaciones

Workflows operacionales del owner + org. **13 pantallas.**

## S4.1 · `/cuenta/transitos/activos` (Owner)

- **Intent:** ver mascotas que tengo en tránsito (foster)
- **Layout:** lista de cards: pet + org + desde-fecha + chip "Co-foster con [nombre]" si aplica
- **Sheets:** `finalizar-transito`, `co-foster-toggle`
- **Tests:** `foster-e2e-flow`

## S4.2 · `/cuenta/transitos/propuestas` (Owner)

- **Intent:** ver propuestas de tránsito que me enviaron orgs
- **Layout:** lista cards: org + pet + chip "expira en X días"
- **Empty:** "Todavía no recibiste propuestas. Para recibir, ofrece tu casa como tránsito."
- **CTA secundario:** "Ofrecerme como tránsito" → sheet `ofrecerme-transito`
- **Tests:** `foster-proposal-expirer`

## S4.3 · `/cuenta/transitos/propuestas/[proposalToken]` (Owner)

- **Intent:** decidir aceptar/rechazar propuesta
- **Layout:** detalle pet + org + condiciones (duración estimada, gastos cubiertos por org, etc.)
- **Sheets:** `aceptar-propuesta`, `rechazar-propuesta`
- **Tests:** `foster-matching`

## S4.4 · `/cuenta/transitos/historial` (Owner)

- **Intent:** archivo de tránsitos cerrados
- **Layout:** lista cronológica
- **Tests:** `foster-cases-d5`

## S4.5 · `/org/[orgToken]/voluntarios` (Org)

- **Intent:** ver voluntarios disponibles + pool foster externo
- **Layout:**
  - Tabs: **Activos** · **Disponibles** (owners que se ofrecieron) · **Histórico**
  - Lista cards: nombre + capacidades + última actividad
  - Filtro: zona, especies aceptadas
- **Sheets:** `invitar-voluntario`, `revocar-acceso`
- **Tests:** `foster-matching`

## S4.6 · `/org/[orgToken]/voluntarios/propuestas` (Org)

- **Intent:** propuestas enviadas a voluntarios (estado)
- **Layout:** lista con estados (enviada/aceptada/rechazada/expirada)
- **Tests:** `foster-proposal-expirer`

## S4.7 · `/org/[orgToken]/transitos` (Org)

- **Intent:** vista unificada de tránsitos activos de la org (mezcla member-based + voluntarios externos)
- **Layout:** lista cards: pet + cuidador + duración + chip tipo (member/owner volunteer)
- **Sheets:** `iniciar-transito`, `finalizar-transito` (org variant)
- **Tests:** `foster-cases-d5`

## S4.8 · `/org/[orgToken]/transferencias` (salientes) (Org)

- **Intent:** transferencias que la org inició hacia otra org
- **Layout:** lista cards: pet + org destino + estado handshake + propuesta-hace
- **CTA:** "Nueva transferencia"
- **Tests:** `cross-org-transfer`

## S4.9 · `/org/[orgToken]/transferencias/nueva` (Org)

- **Intent:** iniciar transferencia hacia otra org
- **Layout:** wizard 3 pasos
  1. **Mascota** — picker desde `/org/.../mascotas`
  2. **Destino** — search org por nombre/token
  3. **Confirmar** — razón + T&Cs
- **Tests:** `cross-org-transfer`

## S4.10 · `/org/[orgToken]/transferencias/recibidas` (Org)

- **Intent:** transferencias que otra org propuso hacia esta
- **Layout:** lista con estados, acción "Aceptar"/"Rechazar"
- **Sheets:** `aceptar-transferencia`, `rechazar-transferencia`

## S4.11 · `/org/[orgToken]/maltrato/recibidos` (Org)

- **Intent:** denuncias de maltrato derivadas a la org
- **Layout:** queue con prioridad, estado, fecha
- **Sheets:** `tomar-caso`, `derivar-a-org`
- **Tests:** `welfare-cases-d1`, `welfare-moderation`

## S4.12 · `/org/[orgToken]/maltrato/nuevo` (Org)

- **Intent:** levantar denuncia desde la org (no anónima, queda firmada)
- **Layout:** wizard parecido al `/denuncias/nueva` público pero con autocomplete de pets en custodia
- **Tests:** `welfare-cases-d1`

## S4.13 · `/org/[orgToken]/mordedura/nuevo` (Org)

- **Intent:** registrar bite incident (abre case `bite_incident`)
- **Layout:** form: víctima (humano/animal), severidad, provocación, lugar, fecha, requiere observación rábica (auto-checked si humano + skin break)
- **Tests:** `bite-cases-d2`

## S4.14 · `/notificaciones` (Owner)

- **Intent:** inbox del dueño
- **Layout:**
  - Tabs por categoría: **Todo** · **Recordatorios** · **Avisos** · **Comunidad**
  - Lista de notificaciones con estado leído/no-leído
  - Cada una tiene CTA contextual (ir a la pet, ir al turno, etc.)
- **Sheets:** `marcar-como-leido`
- **Tests:** `notifications`, `notifications-by-category`, `notification-templates`, `active-reminders`

## S4.15 · `/denuncias/mias` + `/denuncias/[id]` (Owner authenticated)

- **Intent:** ver denuncias que envié firmadas (no anónimas)
- **Layout `/mias`:** lista cards: código + estado + fecha
- **Layout `/[id]`:** detalle completo + comentarios + acciones permitidas (agregar evidencia)
- **Sheets:** `agregar-evidencia`, `agregar-comentario`
- **Tests:** `welfare-moderation`

---

# SPRINT 5 — Owner eventos especiales + tabs pet detail

Pantallas que conectan flujos avanzados del owner. **8 pantallas.**

## S5.1 · Pet detail tab `?tab=vacunas`

- **Intent:** vista detallada del estado de vacunación
- **Layout:**
  - Bloque "Estado de vacunación" con badges: Antirrábica vigente / pendiente / vencida
  - Calendario de próximas dosis
  - Historial completo de vacunas con marca, lote, vet, fecha
  - CTA "Programar próxima vacuna"
- **Sheets:** `evento.vacuna`, programar vacuna
- **Tests:** `vaccine-due-scan`, `vaccine-reminder-state`

## S5.2 · `/mis-mascotas/[publicToken]/vacunas/programar`

- **Intent:** programar recordatorio + reserva en clínica
- **Layout:** picker de vacuna + fecha sugerida (auto-calculada) + ¿reservar turno? (link a `/turnos/buscar`)
- **Tests:** `vaccine-reminder-state`

## S5.3 · `/mis-mascotas/[publicToken]/anotar`

- **Intent:** quick-capture (mobile-first) — escribir texto libre que el parser detecta y abre el sheet correcto
- **Layout:**
  - Hero pet chip
  - Textarea grande "¿Qué pasó hoy?"
  - 5 chips quick: Vacuna · Peso · Síntoma · Medicación · Nota
  - Parser hint inline mientras escribís
- **Acciones:** detecta keyword → abre `?sheet=<inferido>` con prefill
- **Tests:** `event-catcher-handoff`

## S5.4 · `/mis-mascotas/[publicToken]/asistencia/presentar`

- **Intent:** pantalla para mostrar al vet en el consultorio (check-in del turno)
- **Layout:**
  - Hero pet + nombre dueño + chip turno
  - QR grande con `appointment_token`
  - Botón "Presentar" → marca asistencia
- **Tests:** `scheduling-attendance`

## S5.5 · `/mis-mascotas/[publicToken]/devolucion`

- **Intent:** devolver una mascota recibida en tránsito/adopción al refugio de origen
- **Layout:** form: razón (radios), notas, ¿fecha sugerida?
- **Tests:** `return-to-owner`

## S5.6 · `/mis-mascotas/[publicToken]/eventos/atestar-raza-peligrosa`

- **Intent:** owner declara/atestiga PPP (perro potencialmente peligroso)
- **Layout:** wizard 2 pasos:
  1. **Atestación** — checkboxes legales requeridos
  2. **Firma digital** + foto + ubicación
- **Tests:** `ppp-caba-export`

## S5.7 · `/mis-mascotas/[publicToken]/eventos/[eventId]` (read-only)

- **Intent:** ver detalle de un evento (eventos son append-only, no editables)
- **Layout:**
  - Tipo de evento (chip) + fecha + autor (chip rol)
  - Payload renderizado por tipo (campos del payload)
  - Adjuntos si hay
  - Banner "Append-only: no editable. Para corregir, agregá una nota."
- **Tests:** `event-schemas`, `event-payload-validation-convention`, `pet-events-append-only`

## S5.8 · `/mis-mascotas/nueva/match/[matchedPetToken]`

- **Intent:** confirmación cuando el wizard detecta que el chip ya está registrado
- **Layout:**
  - Banner "Encontramos esta mascota con el mismo chip:"
  - Card de la mascota detectada (read-only)
  - 3 opciones:
    - **"Es la misma — reclamarla"** → `/mis-mascotas/reclamar?chip=...`
    - **"No es la misma — registrar igual"** (requiere captcha + warning legal)
    - **"Cancelar"** → vuelve al wizard
- **Tests:** `chip-match`

---

# SPRINT 6 — Públicas secundarias + libreta compartida

3 pantallas que rellenan los huecos del lado público. **3 pantallas.**

## S6.1 · `/` (Marketing landing)

- **Intent:** entry point público — qué es MiMAR, CTAs por persona
- **Layout (referencia: `feat/landing-redesign`):**
  - Hero con value prop + 3 CTAs (Soy dueño / Soy refugio / Soy gobierno)
  - Bloques: ¿Qué es la credencial?, ¿Cómo reportar perdida?, ¿Cómo denunciar?, ¿Cómo adoptar?
  - Footer con legales

## S6.2 · `/refugios/[orgToken]` (Público)

- **Intent:** perfil público de un refugio (sin necesidad de auth)
- **Layout:**
  - Hero: logo + nombre + ubicación + chips de verificación
  - **Bloque "Sobre nosotros"** — descripción libre
  - **Bloque "Mascotas en adopción"** — grid de cards (link a `/adoptar/[petToken]`)
  - **Bloque "Servicios"** — lista (link a `/turnos/buscar/[offeringToken]`)
  - **Bloque "Contacto"** — email + teléfono + maps
- **Edge case:** org no verificada → banner "Esta organización no está verificada por la autoridad sanitaria"

## S6.3 · `/casos/[publicCode]` (Público)

- **Intent:** seguimiento público de un caso (denuncia, bite, etc.) por código compartible
- **Layout:**
  - h1 "Caso [CODE]" + chip estado
  - Timeline público (eventos que la jurisdicción decide hacer públicos)
  - **No revela datos personales** — solo el progreso
- **Tests:** `case-public-code`

## S6.4 · `/libreta/compartir/[shareToken]` (Público)

- **Intent:** vista pública (limitada en tiempo) de la libreta compartida
- **Layout:**
  - Hero pet + chip "Compartido por [dueño]" + chip "Expira en X horas"
  - Libreta sanitaria filtrada por `category=medical`
  - No incluye: ubicación, contacto del dueño, notes con category!=medical
  - Banner "Esta libreta es pública por tiempo limitado. Para registrar eventos, el vet debe iniciar sesión."
- **Tests:** `libreta-share`

---

# SPRINT 7 (P2) — Admin platform + org operations secundarias

Solo si se quiere mostrar admin en la demo. **~15 pantallas.** No las desgloso a nivel S1–S5 hasta decidir el alcance.

Lista corta:
- `/admin/admins`, `/admin/admins/new`, `/admin/admins/[userId]`
- `/admin/govts`, `/admin/govts/new`, `/admin/govts/[userId]`
- `/admin/moderacion`, `/admin/moderacion/[id]`
- `/admin/jurisdicciones` + reglas (list/new/edit)
- `/admin/auditoria`
- `/admin/outbox`, `/admin/outbox/[id]`
- `/admin/observaciones`, `/admin/observaciones/[publicToken]`, `/admin/observaciones/[publicToken]/microchip/reemplazar`
- `/admin/sistema` (health)
- Org secundarias: `/org/.../checkins`, `/org/.../casos`, `/org/.../adopciones/[id]`, `/org/.../pets/no-aptas`, `/org/.../admin/permisos`

---

# Decisiones a confirmar antes de empezar diseño

1. **Modal-12 vs sheets per-tipo:** ¿modal-12 "Vet registra evento" es accesible también desde el flujo owner, o el owner sigue usando los 5 sheets quick-capture (vacuna, peso, síntoma, medicación, nota) + el modal-12 para "lo demás"? Esto afecta cómo se diseña el EventCatcher.

2. **Sheet library:** el plan de redesign menciona Vaul vs Radix vs custom. Decisión bloquea Phase B.

3. **Wizard alta accordions vs stepper:** el plan menciona ambos. Definir antes de S2.

4. **Tier 2 público (24h):** está en Phase G del plan, no es prioridad demo pero el sheet `mostrar-libreta` ya está entregado (modal-11). ¿Diseñar la pantalla pública que lo recibe?

5. **Marketing landing:** ¿se reusa `feat/landing-redesign` o se rediseña desde cero?

---

# Resumen de impacto

| Sprint | Pantallas | Bloqueo si falta |
|---|---:|---|
| S1 — Auth + cuenta + org picker + claim | 7 | Demo end-to-end imposible |
| S2 — Adopción + turnos | 11 | Catálogos colgando |
| S3 — Govt vigilancia/disputas/perdidas | 8 | Sin valor prop govt |
| S4 — Foster + transferencias + maltrato + notif | 15 | Operación org incompleta |
| S5 — Owner eventos especiales + tabs | 8 | Workflows avanzados rotos |
| S6 — Públicas secundarias | 4 | Entry point sin landing |
| S7 — Admin platform (opcional demo) | ~15 | Solo ops de plataforma |
| **Total accionable** | **~53** | |

(Los números no suman a 40 del top porque incluyen sub-pantallas y tabs explícitas que conté agrupadas en el reporte original.)

---

*Generado 2026-05-26 · Companion del reporte de auditoría · Para iterar con el equipo de diseño.*
