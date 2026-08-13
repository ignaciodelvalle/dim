# Clickthrough de territorio nunca recorrido — staging · corrida TN0813

**Build verificado:** staging expone `mimar-version: fac92e1` = prefijo de **`fac92e19`** (fac92e195e5c790c0876df50202e581a68596e1b). Verificado **al inicio (~00:50)** y **releído al cierre (02:15): sin cambios** — toda la corrida fue contra el mismo build.
**Entorno:** https://dim-staging.vercel.app · **Fecha:** 2026-08-13, 00:45–02:20 ART (horas por hallazgo aproximadas) · **Guion:** docs/agents/prompt-cowork-clickthrough-territorio-nuevo.md
**Método:** una sola corrida en serie, con navegador (Chrome automatizado), deep-links del apéndice + verificación de alcanzabilidad desde la navegación. Todo lo creado quedó prefijado **TN0813** (append-only, nada borrado; el único dato que "limpié" fue cancelar mi propio turno duplicado, que era el objeto del test).
**Cuentas usadas y mapa de roles descubierto en esta pasada:** owner@ (dueño; creó TN0813-Luna y TN0813-Sombra) · graciela@ (ciudadana; voluntaria de tránsito, reservó turno) · noeli@ (ciudadana voluntaria, no operada) · alejo@ (admin de 4 orgs: Refugio Patitas del Norte, Clínica Vet. Recoleta, Red de Rescate Puerto Madero, Mascotas BA Centro) · lilian@ (vet de planta, Clínica Recoleta) · lucas@ (**gobierno**, 5 localidades CABA) · admin@ (superadmin, /admin y /gob).
**Datos creados (quedan en staging):** mascotas TN0813-Luna (DIM-ZNBD-C5GZ, 15 asientos + atestación PPP + observación antirrábica cerrada negativa), TN0813-Sombra (DIM-BV3Z-GVRD, fallecida), TN0813-Rocco (DIM-NREV-XZPS, refugio); slot de voluntaria de graciela; propuesta de tránsito FP-B2KU-T6XR (aceptada y cerrada); turnos APT-DPQC-EYEX (asistido) y APT-BYDB-EAV4 (cancelado); ~16+ slots materializados en DEMO-SVO-CABA-RABIES; regla PPP AR·CABA·Recoleta (3c5e368e…, con nota "no borrar"); link de libreta LBR-68RD-448Q (vence 20/8); vacuna programada 20/8 en Luna.

---

## Resumen ejecutivo — lo que más duele primero

1. **[ALTO · turnos] El buscador no encuentra un servicio aprobado y con agenda en su propia localidad.** "Vacunación antirrábica + Recoleta" → "sin servicios", mientras /turnos/buscar/DEMO-SVO-CABA-RABIES declara "· Recoleta" con ~16 slots/día. El mismo buscador SÍ devuelve la clínica Cursor en Palermo. Pista: la vista admin del servicio dice jurisdicción "Ciudad Autónoma de Buenos Aires, CABA" y la ciudadana dice "Recoleta" — dos localidades distintas para el mismo offering. Sin link directo, un ciudadano no llega nunca.
2. **[ALTO · turnos] Los slots no existen hasta apretar "Materializar ahora" a mano** ("el cron lo hace automáticamente" — regla activa desde el 9-ago, cero turnos el 13-ago). Si el cron no corre en staging, cualquier servicio nuevo nace invisible.
3. **[ALTO · turnos] Doble reserva silenciosa:** el mismo slot, para la misma mascota, se reserva dos veces sin aviso (dos confirmados 09:00). El doble click ansioso come cupo de campañas. (Contraste: mordedura SÍ tiene guard anti-duplicado.)
4. **[ALTO · tránsitos] La propuesta de tránsito no notifica al voluntario.** Expira a los 7 días y puede morir sin que nadie se entere (el cierre del tránsito sí genera 2 notificaciones — asimetría). Además el feed /notificaciones ordena por tipo (ATENCIÓN→LISTO→INFO) y no por fecha: lo de hace 1 minuto queda al fondo, debajo de alertas de hace una semana, con campanita "9+" crónica.
5. **[ALTO · eventos] `eventos/nuevo/checkin` → 404.** La ruta del inventario no existe en el build; el org ve "check-ins post-adopción autoreportados" pero el adoptante no tiene la página para autoreportarse.
6. **[MEDIO] Matching de razas PPP por string exacto:** "Pitbull" tipeado no matchea "Pit Bull Terrier" del catálogo; hubo que agregar la variante literal a la regla. Dueños con la raza mal tipeada quedan fuera del régimen en silencio.
7. **[MEDIO] Coherencia clínica sin red:** embarazo aceptado minutos después de esterilización, misma perra, mismo día, sin aviso.
8. **[MEDIO] Gemelas rotas puntuales:** /gob/servicios/[token] → 404 (admin sí renderiza); /admin/observaciones/[token] → 404 con su hija …/microchip/reemplazar viva (huérfana de facto); /admin/outbox/[id] con panel autocontradictorio (Entregado + pendiente + 0 intentos + reintento en fecha pasada).
9. **[MEDIO] Deep-links de /cuenta muertos:** /cuenta/transitos, /cuenta/renunciar, /cuenta/desactivar redirigen al hub sin abrir el flujo (los flujos reales viven en sheets/subpáginas).
10. **Lo que funciona, funciona en serio:** el circuito regla jurisdiccional→notificación al dueño→atestación→cumplimiento→credencial pública cerró de punta a punta en minutos; tránsito completo con dos cuentas; 14/15 formularios de eventos con historial correcto (fechas retro incluidas); KPIs de gobierno moviéndose en vivo con mis datos; privacidad por capas (nivel 0 público / link con vencimiento / tiers declarado-verificado) de lo mejor del producto.

---

# Bloque 1 — Tránsitos / hogar temporal (punta a punta)

Corrida TN0813 · cuentas: graciela@ (voluntaria/ciudadana) + alejo@ (admin Refugio Patitas del Norte, DIM-389S-JFKJ)
Mascota creada: TN0813-Rocco (DIM-NREV-XZPS), ingreso por /org/…/intake, custodia temporal.
Propuesta: FP-B2KU-T6XR (12 sem., Rocco → Graciela). Aceptada ~00:58, cerrada ~01:03 (ART).

## Funcionó (con método)
- Registro voluntario 3 pasos (/cuenta/ofrecerme-como-transito): localidad autocomplete "Palermo, CABA", duración 8, especies/tamaños/edad, hogar, notas. Banner "Estás inscripto · 1 slot".
- Alta de mascota org por intake 4 pasos → token DIM-NREV-XZPS con CTA "Asignar tránsito" que preselecciona la mascota en el pool (?pet=…).
- Pool org (/org/…/voluntarios): la voluntaria apareció EN EL ACTO (recarga inmediata), con "match 100/100" al filtrar por mascota. Otro voluntario preexistente: Noelí Assandri (propuesta Toby pendiente del 11-ago, seed o corrida previa).
- Propuesta org→voluntaria con notas; detalle del lado ciudadano (/cuenta/transitos/propuestas/FP-B2KU-T6XR) completo: quién propone, duración, expiración, notas del refugio, y AVISO de matching "12 sem. excede el máximo del voluntario (8)".
- Aceptación con confirmación en 2 pasos + checkbox de co-foster (default off) + notas.
- Tránsito activo visible en ambos lados; la foster abre /mis-mascotas/DIM-NREV-XZPS con badge EN TRÁNSITO y banner "la libreta que armes acá viaja con la mascota" → la promesa de permisos de dueño se cumple en superficie (página, cumplimiento, acciones).
- Cierre org: sheet "Cerrar tránsito" (?sheet=fin-transito) con quién-finalizó + motivo + modal de confirmación. Estado vuelve a "Activa"/custodia refugio; /org/…/transitos queda sin activos; historial ciudadano registra "TN0813-Rocco 13 ago → 13 ago"; llegan 2 notifs nuevas a la voluntaria (fin de tránsito + invitación a re-inscribirse ✻ buen detalle).
- Guard correcto en devolver-al-dueno: "La mascota debe estar en estado perdida y sin propuesta de devolución pendiente."

## Hallazgos (OBSERVACIÓN / HIPÓTESIS)
1. [ALTO][seguimiento] La PROPUESTA de tránsito NO generó ninguna notificación in-app a la voluntaria. OBS: emitida ~00:52; a los ~4 min, /notificaciones pasó de 34→34; tras el cierre pasó a 36 y las 2 nuevas son solo del cierre. La propuesta expira a los 7 días — puede morir en silencio si la voluntaria no entra a /cuenta/transitos/propuestas por su cuenta. HIP: no existe notif para foster_proposal (¿o va solo por push/email?). URL: /cuenta/transitos/propuestas · cuenta graciela@ · ~00:56 · me trabó (creí que no había llegado).
2. [ALTO][claridad] El feed /notificaciones ordena por tipo/prioridad (ATENCIÓN→LISTO→INFO), no por fecha: lo de "hace 1 min" (fin de tránsito) queda AL FONDO, debajo de alertas de hace 3-7 días. Con 19 sin leer heredadas, la campanita "9+" es crónica y ciega. OBS: orden literal del DOM. HIP: sort por categoría sin desempate por recencia. · ~01:05 · me trabó.
3. [MEDIO][consistencia] El refugio pudo proponer 12 semanas a una voluntaria con máximo declarado de 8 SIN ningún aviso al emitir; el aviso lo ve solo la voluntaria al abrir la propuesta. El match "100/100" tampoco refleja el conflicto. OBS: form org sin warning; detalle ciudadano con warning; score inalterado. HIP: la validación corre solo en la vista del receptor. · ~00:52 · dudé.
4. [MEDIO][seguimiento] "El tránsito recibe el mensaje" (texto del sheet de cierre) NO se cumple in-app: el motivo que escribí no aparece ni en la notificación ("…cerró el tránsito de TN0813-Rocco.") ni en /cuenta/transitos/historial (solo nombre y fechas), y el "Ver detalle" de la notif apunta a /mis-mascotas (genérico). HIP: el mensaje viaja por email o se perdió. · ~01:05 · me molestó.
5. [MEDIO][claridad] La nota de aceptación de la voluntaria ("puedo hasta 8 semanas, no 12") no aparece en el lado org (propuestas: "Aceptada · 12 sem." y nada más). La duración quedó 12 sin reconciliación. OBS en /org/…/voluntarios/propuestas · ~01:00.
6. [MENOR][seguimiento] /cuenta/transitos redirige a /cuenta: el "hub" listado en el inventario no existe como página.
7. [MENOR][claridad] Tras "Inscribirme (sumar slot)" el wizard vuelve a Paso 1 con los MISMOS datos cargados y el dropdown abierto → invita a crear un slot duplicado; el slot creado no tiene vista de detalle posterior (ni el voluntario ni el refugio ven las preferencias/notas cargadas: el pool muestra solo nombre/slots/aceptadas/localidad/match). "1 slot(s)": plural perezoso.
8. [MENOR][números] Badge sidebar "Voluntarios" = propuestas pendientes (fue 1→2→1 mientras el pool listaba 2 personas). El número no mide lo que el label dice.
9. [MENOR][consistencia] /org/…/mascotas/…/foster (asignar) no refleja que ya hay tránsito activo: muestra el form de asignación como si nada (no ejecuté el submit). Riesgo de doble asignación o error críptico. También coexisten 2 vías: asignación directa a "miembro activo" vs. propuesta por pool — sin explicación de la diferencia.
10. [MENOR][claridad] Al aceptar, la página queda en "estado Aceptada" sin CTA hacia el tránsito activo o la mascota (dead-end).
11. [MENOR] Título de pestaña fijo "Mis mascotas — miMAR" en todo /cuenta/* y /notificaciones.
12. [INFO] Intake: resumen del paso 4 omite sexo/edad/raza/color/señas/condición/jurisdicción; jurisdicción es texto libre acá pero autocomplete en el wizard de voluntario (unificación). Cada ingreso/propuesta parece sumar al badge "Casos" (2→3 con el intake) — semántica de "caso" no explicada en UI.

## Rutas del apéndice cubiertas
/cuenta/ofrecerme-como-transito ✓ · /cuenta/transitos (redirige) ✓ · /cuenta/transitos/activos ✓ · /cuenta/transitos/historial ✓ · /cuenta/transitos/propuestas ✓ · /cuenta/transitos/propuestas/[FP-B2KU-T6XR] ✓ · /org/…/transitos ✓ · /org/…/voluntarios ✓ · /org/…/voluntarios/propuestas ✓ · /org/…/mascotas/…/foster ✓ · foster-fin (via sheet fin-transito) ✓ · devolver-al-dueno (sheet, guard) ✓
No cubiertas del bloque: /mis-mascotas/[t]/devolucion · /mis-mascotas/[t]/buscar-hogar (va en Bloque 4) · historial org de tránsitos (tab).

---

# Bloque 2 — Turnos y agenda (reservar de verdad)

Cuentas: graciela@ (reserva) + alejo@ (Clínica Veterinaria Recoleta, DIM-9XKC-ZDQK). Offering seed: DEMO-SVO-CABA-RABIES ("Campaña antirrábica CABA (demo focal)", APROBADO, gratuita, 15 min, 6 lugares/turno, localidad Recoleta). Turnos creados: APT-DPQC-EYEX (confirmado→asistido) y APT-BYDB-EAV4 (duplicado→cancelado por mí).

## Funcionó (con método)
- Descubrimiento ciudadano: /mis-turnos → "Buscar turnos" → /turnos/buscar con 10 tipos de servicio; búsqueda con localidad autocomplete y filtro "solo campañas gratuitas".
- El buscador SÍ devuelve resultados donde el índice está bien: "Vacunación antirrábica — Cursor Staging · 96 turnos disponibles en 7 días" en Palermo.
- Reserva punta a punta: página de offering con slots por día → /reservar/[slotId] con resumen + selector de mascota → confirmación inmediata → /mis-turnos/APT-DPQC-EYEX con QR de check-in + código + teléfono + Cancelar.
- Cancelación: sheet con confirmación ("no se puede deshacer") → estado "CANCELADO POR VOS", QR desaparece; /mis-turnos lista Próximos/Cancelados.
- Capacidad consistente: 6→5 lugares tras reservar; 5→4→5 con el duplicado y su cancelación; org agenda "1/6 RESERVADOS" ✓.
- Org: /org/…/agenda (cupos del día + turnos con estado y teléfono del dueño, "Bloquear" solo en slots vacíos) y /org/…/agenda/turnos/[APT] con form de asistencia (vacuna, marca, lote, profesional, próxima dosis → "recordatorio automático") + No vino + Cancelar. Marcar asistencia funcionó → estado ASISTIDO.
- /org/…/servicios, /servicios/[t] (métricas), /servicios/[t]/agenda (reglas + materializar), /servicios/nuevo (wizard 3 pasos, aprobación por autoridad).

## Hallazgos
1. [ALTO][bug] Servicio APROBADO con agenda activa es INVISIBLE en el buscador de su propia localidad declarada. OBS: búsqueda orgánica (UI, con Buscar) "Vacunación antirrábica" + "Recoleta, CABA" → "Sin servicios disponibles en Recoleta", mientras /turnos/buscar/DEMO-SVO-CABA-RABIES muestra "…· Recoleta" con ~16 slots/día. El mismo buscador SÍ encuentra la clínica Cursor en Palermo. HIP: mismatch de localidad indexada (¿la del org vs la del servicio?), o el resultado depende de un campo (localityNameIndecId) que la campaña seed no tiene. Sin el link directo, un ciudadano NUNCA llega. · ~01:15-01:18 · me trabó.
2. [ALTO][bug] Doble reserva del MISMO slot para la MISMA mascota: permitida sin aviso. OBS: dos turnos CONFIRMADOS (APT-DPQC-EYEX y APT-BYDB-EAV4) para CW-Rescate-QA-0808b, mismo slot 13-ago 09:00. El clásico doble click ansioso genera duplicados y come cupo de campaña. · ~01:19 · me molestó (lo tuve que limpiar yo).
3. [MEDIO][infra?] Los slots NO existían hasta que apreté "Materializar ahora" en la agenda org ("El cron lo hace automáticamente" — regla activa desde el 9-ago y 0 turnos el 13-ago). HIP: el cron de materialización no corre en staging → cualquier servicio nuevo queda invisible aunque el buscador funcione. OBS: botón manual → "Reglas procesadas: 2. Turnos nuevos: 16." · ~01:12.
4. [MEDIO][claridad] El offering org no muestra LOCALIDAD (el form de crear servicio tampoco la pide): el org no puede ver/corregir dónde está indexado su servicio. La localidad aparece solo en la vista ciudadana.
5. [MENOR][números] Métricas del servicio: "PRÓXIMOS CONFIRMADOS 1" con "OCUPACIÓN PRÓX. 7 DÍAS 0%" conviven sin explicación (¿el confirmado está a >7 días? ¿redondeo?). Dudé del número.
6. [MENOR][números] "Materializar: turnos nuevos: 16" pero la vista pública ya mostraba ~16 slots/día en varios días — no se entiende qué contó el 16 (¿solo hoy?).
7. [MENOR][claridad] Se puede "Marcar asistencia" de un turno de las 09:00 a la 01:20 AM (7,5 h antes) sin aviso. Razonable para campañas, peligroso para mis-clicks.
8. [MENOR][ux] /mis-turnos numera secciones "01 Próximos / 03 Cancelados" — el 02 (¿pasados?) desaparece cuando está vacío y la numeración delata el hueco.
9. [MENOR][seguimiento] /mis-turnos no es alcanzable desde ninguna navegación visible (ni top-nav, ni /cuenta, ni footer). Llegué por URL; el link "AGENDA DE TURNOS" existe DENTRO de /mis-turnos. ¿Desde dónde entra un usuario normal? (quizás desde la mascota — pendiente de confirmar en Bloque 4).
10. [INFO] /turnos (index) → 404 con página de error decente.

## Rutas apéndice cubiertas
/turnos/buscar/[offeringToken] ✓ · /turnos/buscar/[t]/reservar/[slotId] ✓ · /mis-turnos/[appointmentToken] ✓ · /org/[t]/agenda ✓ · /org/[t]/agenda/turnos/[APT] ✓ · /org/[t]/servicios ✓ · /org/[t]/servicios/nuevo ✓ (form, sin submit) · /org/[t]/servicios/[offeringToken] ✓ · /org/[t]/servicios/[t]/agenda ✓
Pendientes (van con gob/admin): /admin/servicios/[t] · /gob/servicios/[t] · /admin/suscripciones · /gob/suscripciones

---

# Bloque 3 — Eventos médicos del dueño (15 formularios)

Cuenta: owner@ ("Dueño"). Mascotas creadas: TN0813-Luna (DIM-ZNBD-C5GZ, hembra, Palermo) para 13 eventos; TN0813-Sombra (DIM-BV3Z-GVRD) para fallecimiento.
Fechas de prueba: peso retro-fechado al 12-ago, síntoma al 10-ago, resto 13-ago (~01:20-01:40 ART).

## Resultado por formulario (14/15 OK, 1 roto)
- peso ✅ (21,4 kg, fecha 12-ago) · sintoma ✅ (10-ago) · medicacion-inicio ✅ (Amoxicilina, 2×/día, 7 días) · medicacion-fin ✅ (el select lista "Amoxicilina · iniciado 13 de agosto" — encadenado inicio→fin FUNCIONA) · antiparasitario ✅ (próx. dosis 13-nov → recordatorio) · clinico ✅ · esterilizacion ✅ (ovariectomía) · embarazo ✅ · microchip ✅ (…0001) · microchip-reemplazo ✅ (muestra "Chip actual …0001", reemplazo por …0002) · tatuaje ✅ (con foto obligatoria) · vet ✅ · mordedura ✅ (persona, leve, consentimiento legal 10 días) · fallecimiento ✅ (en Sombra; la página queda FALLECIDA · EN MEMORIA con acciones reducidas — lock correcto)
- **checkin ❌ 404** — /mis-mascotas/[t]/eventos/nuevo/checkin devuelve "No encontramos esta página" y ?sheet=checkin tampoco abre nada. Ruta del inventario ROTA o renombrada del lado dueño (los check-ins existen del lado org). "No llegué desde ningún lado" + 404 directo.
- atestar-raza-peligrosa: redirige en silencio al perfil si la mascota no tiene raza cargada (sin mensaje). Reintento en Bloque 4 tras cargar raza PPP vía /editar.

## Verificación en historial (la parte que importa)
Timeline de Luna: 15 entradas = 13 eventos míos + "Mascota registrada" + "Observación antirrábica iniciada (Registrado automáticamente)".
- ORDEN ✅ reverso-cronológico con fechas retroactivas bien ubicadas: peso "ayer · 12 de ago" y síntoma "hace 3 días · 10 de ago" quedaron al fondo; el resto "hoy".
- FECHAS ✅ correctas las tres cohortes (13/12/10-ago).
- Encadenados ✅: mordedura → badge "EN OBSERVACIÓN ANTIRRÁBICA" en la credencial + evento automático de observación + aviso "Vigilancia por mordedura… 10 días" en el perfil; chip …0001 → reemplazo …0002 y CUMPLIMIENTO muestra el chip vigente (…0002); embarazo activo → el perfil ofrece link "finalizar embarazo" (?phase=ended).
- CUMPLIMIENTO con niveles de confianza ✅: esterilización "DECLARADA — sin verificación profesional… pedile a tu veterinario que la registre para que cuente"; microchip "DECLARADO". "0 de 4 al día" coherente con la política declarado≠verificado.

## Hallazgos
1. [ALTO][bug] checkin del dueño: 404 (ruta del inventario inexistente en el build). · 01:31 · me trabó.
2. [MEDIO][confirmación] Mordedura: mi primer submit mostró "(OBLIGATORIO)" en '¿a quién mordió?' como si hubiera fallado, pero al reintentar el sistema respondió "Ya hay una observación en curso… por otra mordedura" — es decir, ALGÚN intento había entrado sin confirmación visible. En el historial quedó UNA sola mordedura (el guard anti-duplicado existe y funciona 👍), pero la secuencia deja al dueño sin saber si reportó o no — exactamente la pregunta "¿hiciste algo dos veces por no saber si salió?". HIP: validación cliente/servidor desincronizada en el selector de blanco de la mordedura.
3. [MEDIO][coherencia] Cargué EMBARAZO minutos después de ESTERILIZACIÓN (misma perra, mismo día): aceptado sin ningún aviso. En una libreta sanitaria oficial, una advertencia de inconsistencia clínica parece necesaria. · 01:33.
4. [MENOR][i18n] El embarazo aparece en el historial como "Información clínica · pregnancy" (inglés + tipo genérico); el ícono/título no dice "Embarazo".
5. [MENOR][datos] Antiparasitario muestra "Vía Oral · Dosis Sin dato" — "vía" nunca se preguntó en el form (default presentado como dato) y elegí "Ambos" (interno+externo, no necesariamente oral). Números/datos que no cargué aparecen como registro.
6. [MENOR][ux] atestar-raza-peligrosa: redirect mudo si falta raza (debería explicar el requisito).
7. [MENOR][i18n/formato] Formato de fecha inconsistente entre forms: la mayoría muestra mm/dd/aaaa (08/13/2026) pero fallecimiento muestra dd/mm/aaaa (13/08/2026). En un formulario de salud, mm/dd en es-AR es trampa de carga (¿08/12 es 12-ago o 8-dic?). También idioma del input nativo según navegador.
8. [MENOR] Fallecida: "FALLECIDA · EN MEMORIA" junto a "REGISTRADO/A · No especificado" — concordancia de género despareja en la misma credencial.
9. [INFO] Placeholders personalizados con el nombre de la mascota ("Ej: hace dos días que TN0813-Luna vomita…") — lindo detalle ✻. El éxito del síntoma viaja como query param (?evento=sintoma_registrado).

## Rutas apéndice cubiertas
peso✓ sintoma✓ medicacion-inicio✓ medicacion-fin✓ antiparasitario✓ clinico✓ esterilizacion✓ embarazo✓ checkin✗404 microchip✓ microchip-reemplazo✓ tatuaje✓ vet✓ mordedura✓ fallecimiento✓ · atestar-raza-peligrosa: redirect condicional (pendiente retry con raza PPP)
Nota: /eventos/nuevo/mordedura/exito no se visitó como URL propia (el flujo no me llevó ahí; el resultado fue el guard de observación en curso).

---

# Bloque 4 — Superficies de identidad de la mascota (viewport 390×850)

Mascota: TN0813-Luna (DIM-ZNBD-C5GZ), owner@. Todo el bloque recorrido en pantalla de teléfono (~01:35 ART).

## Funcionó (con método)
- Mobile en general: bien resuelto — aparece tab-bar inferior (Mis mascotas / Asentar / Denuncias); formularios y credencial legibles a 390px.
- /editar: especie FIJA ("para no romper las reglas PPP") con link a corregir-especie; localidad FIJA con link a mudanza — los datos estructurales solo se mueven por eventos, coherente con el modelo append-only. El peso 21,40 estaba sincronizado desde el evento peso. Guardé raza "Pitbull" → visible al toque en credencial ("Pitbull · Hembra · Perro").
- /mudanza: form provincia+localidad autocomplete, motivo; ejecutada Palermo→Recoleta y la credencial se actualizó al instante. "El movimiento queda asentado en la libreta y actualiza la jurisdicción."
- /chapita: 3 formatos imprimibles (portachapita Ø30mm, tag collar 50×30, tarjeta billetera 85,6×54) con QR e instrucción "imprimí al 100%". (No ejecuté la impresión a PDF: window.print() bloquea el harness de automatización — limitación mía, no del producto.)
- /cartel: guard correcto si no está perdida ("Marcala como perdida primero…").
- /mostrar-libreta → sheet Compartir: link público + LINK PRIVADO CON VENCIMIENTO (7/30 días/sin), propósito, revocable, contador "Sin vistas", y "Mostrar libreta médica (TIER 2)" para exponer info médica temporalmente en el QR. Generé LBR-68RD-448Q (vence 20/8) — lo pruebo anónimo en Bloque 9. Diseño de privacidad muy fino ✻.
- /vacunas → tab "LIBRETA · DORSO": estado de vacunación ("Sin vacunas registradas · 3 del calendario recomendado sin aplicar"), PRÓXIMOS, y ASIENTOS con filtros por tipo — acá verifica el Bloque 3 desde otra vista.
- /vacunas/programar: form simple + **el único link ciudadano a /turnos/buscar** ("Buscar turno con veterinario en mi zona →"). Programé antirrábica 20-ago OK.
- /corregir-especie: form claro ("solo si se cargó mal… vuelve a evaluar las reglas PPP"; especies: perro/gato/conejo/cobayo/hurón/otra). No lo ejecuté (la especie es correcta; corregirla en falso ensucia).
- /asistencia: página seria — marco legal (Ley 26.858, Dec. 792/2019, RUPGA/ANDIS Res. 2588/2022) y privacidad Ley 25.326 Art. 7 con banner público APAGADO por defecto. No registré (dato sensible; alcanza con documentar).
- /viaje: "Próximamente" honesto (corredores y semáforo de cumplimiento) — WIP declarado, no abandono.

## Hallazgos
1. [MEDIO][bug] /mis-mascotas/[t]/buscar-hogar → **404 crudo** en mascota propia. El botón "Buscar nuevo hogar" existía en la vista de FOSTER (Rocco); acá ni guard ni explicación. HIP: ruta condicional al rol de tenencia sin fallback. · ~01:35.
2. [MEDIO][seguimiento] El recordatorio "PRÓXIMO: Amoxicilina – Dosis 13 ago [Marcar dada]" sigue vivo en la libreta DESPUÉS de registrar fin de medicación, pese a que el form de inicio promete "cuando el tratamiento termine… cancelamos los pendientes". O no canceló, o muestra la dosis del día ya vencida sin decirlo. Dudé.
3. [MEDIO][números] Conteos de historia que no cierran entre vistas: perfil = 15 entradas de timeline; libreta = "ASIENTOS · 16 REGISTROS"; los filtros tipados suman 12. Tres números distintos para "lo mismo" sin explicación de qué cuenta cada uno.
4. [MENOR][ppp] Raza "Pitbull" tipeada a mano + 21,4 kg NO activó Régimen PPP: la fila PPP desapareció del cumplimiento (denominador pasó de "0 de 4" a "0 de 3") y atestar-raza-peligrosa sigue redirigiendo mudo. HIP: la raza tipeada no matchea el catálogo PPP (¿hacía falta elegirla del dropdown?) o falta la regla jurisdiccional (se retoma en Bloque 5). Silencioso en ambos casos.
5. [MENOR][naming] /mostrar-libreta en realidad abre "Compartir" (útil, pero el nombre promete mostrar la libreta en pantalla al vet); /asistencia/presentar redirige a /asistencia (paso no accesible directo).
6. [INFO] /vacunas y /mostrar-libreta son redirects a tabs/sheets del perfil (?tab=vacunas / ?sheet=compartir) — rutas del inventario que viven como estados del perfil.

## Rutas apéndice cubiertas
chapita✓ cartel✓(guard) mostrar-libreta✓ vacunas✓ vacunas/programar✓ viaje✓(WIP) mudanza✓(ejecutada) editar✓(ejecutada) corregir-especie✓(sin submit) buscar-hogar✗404 asistencia✓ asistencia/presentar→redirige
No ejecutadas: /mis-mascotas/nueva/match/[matchedPetToken] y /org/[t]/intake/match/[matchedPetToken] (requieren colisión de chip real: crear perdida-con-chip + intake del mismo chip; lo dejo mapeado para la próxima corrida).

---

# Bloque 5 — Reglas jurisdiccionales (gob y admin)

Cuenta: admin@ (SUPERADMIN; en /admin figura "· Universal", en /gob "· Nacional"). Regla creada: Lista de razas PPP para AR·CABA·Recoleta (ruleId 3c5e368e-…), con "Pitbull" agregada como raza no estándar. Verificación de impacto con owner@ / TN0813-Luna (Recoleta). ~01:45 ART.

## La respuesta a la pregunta del bloque: SÍ — y con toda la cadena
1. Wizard 4 pasos (/admin/reglas/nueva): provincia → localidad (o toda la provincia) → tipo (9 tipos: razas PPP, umbral peso PPP, atestación requerida, canales credencial física, microchip obligatorio, ventana observación antirrábica, ventana 'próximo a vencer', ventana recordatorios, umbral estadía, formato export fiscalía MPF) → configuración.
2. El editor de razas trae defaults AR tildados y PREVIEW DE IMPACTO EN VIVO: "Esta regla no afecta a ninguna mascota…" → al agregar "Pitbull" como no estándar cambió a "afecta a ~1 mascota" y apareció un checkbox de consentimiento "…reevaluará y notificará a 1 dueño" ✻ diseño excelente.
3. Al guardar: detalle /admin/reglas/AR/CABA/Recoleta con la regla activa, timestamp y autor; gemela /gob/reglas/AR/CABA/Recoleta muestra EXACTAMENTE lo mismo ✓; /gob/reglas/nueva = mismo wizard; /admin/reglas/…/editar/[ruleId] funciona.
4. En ~1 minuto, la mascota de esa jurisdicción CAMBIÓ: apareció "Atestación PPP — ATESTACIÓN REQUERIDA" en su cumplimiento (0→ de 4), la dueña recibió notificación ATENCIÓN "Lista de razas PPP actualizada — aplica a tu mascota", y /eventos/atestar-raza-peligrosa pasó de redirect mudo a wizard 2 pasos (leyes CABA 4078 / PBA 14.107, 4 confirmaciones, registro CABA/PBA/otro). Registré la atestación (exp TN0813-EXP-001) → cumplimiento pasó a "1 de 4 al día". Circuito completo regla→notificación→atestación→cumplimiento: FUNCIONA.

## Hallazgos
1. [MEDIO][confirmado] La raza tipeada libre NO matchea el catálogo: "Pitbull" (tipeado en /editar) no activó PPP con la lista default que incluye "Pit Bull Terrier" y "American Pit Bull Terrier"; recién al agregar "Pitbull" LITERAL como raza no estándar la regla la tomó. El matching es por string exacto, sin normalización — cualquier dueño que tipee una variante queda fuera del régimen silenciosamente. (Conecta con hallazgo 4 del Bloque 4.)
2. [MENOR][claridad] El detalle de la regla muestra la config como JSON crudo ({"breeds": […]}) — legible para admins técnicos, áspero para un funcionario.
3. [MENOR][semántica] En cumplimiento de la mascota, la vacuna PROGRAMADA (nunca aplicada) aparece como "Vacuna antirrábica — POR VENCER — Vence 20/08": mezcla "programada para el 20/08" con "vence el 20/08". Dudé del estado.
4. [MENOR][texto] "afecta a ~1 mascota actualmente no clasificadAS" — concordancia.
5. [INFO] Roles/etiquetas: admin@ se presenta "SUPERADMIN · UNIVERSAL" en /admin y "SUPERADMIN · NACIONAL" en /gob — mismo usuario, dos etiquetas de alcance; la vista gob acotada POR JURISDICCIÓN real queda para el Bloque 8 (con cuenta gob si existe).

## Rutas apéndice cubiertas
/admin/reglas/nueva ✓ (ejecutada) · /admin/reglas/[c]/[p]/[l] ✓ · /admin/reglas/[c]/[p]/[l]/editar/[ruleId] ✓ · /gob/reglas/nueva ✓ (vista) · /gob/reglas/[c]/[p]/[l] ✓ · /gob/reglas/[c]/[p]/[l]/nueva — no visitada directa (mismo wizard, alcanzable) · /gob/…/editar/[ruleId] — no visitada (gemela exacta de la admin)

---

# Bloque 6 — Maltrato y mordedura (organización)

Cuenta: alejo@ · Refugio Patitas del Norte. ~01:50 ART.

## Visto y verificado
- /org/…/maltrato/nuevo: "canal profesional" con reglas explícitas — severidad crítica automática (ignora lo que elijas), mínimo 1 evidencia + descripción ≥100 caracteres, SIN moderación previa con responsabilidad institucional, notificación inmediata a autoridades. Tipos (9) y gravedad (4). Mapa OSM + "usar mi ubicación". Cita Ley 14.346.
- La exigencia de evidencia SE CUMPLE server-side: enviar sin adjunto devuelve "Un reporte profesional requiere al menos un adjunto de evidencia." ✓
- /org/…/maltrato/recibidos: semántica clara — "denuncias derivadas a la organización POR EL GOBIERNO para seguimiento en campo". Vacío honesto ("Todavía no se derivó ninguna"). Tabs Recibidos/Emitidos. El circuito de derivación gob→org queda sin ejecutar (requiere acción del lado gob).
- /org/…/mordedura/nuevo: wizard 4 pasos que arranca por TOKEN PÚBLICO de la mascota (cualquier mascota, no solo las del refugio), jurisdicción para enrutar a la autoridad sanitaria, tipo de víctima, contactos para denuncia obligatoria. "Inicia automáticamente el período de observación antirrábica de 10 días."

## Hallazgos
1. [MEDIO][claridad] Contradicción en la misma pantalla de maltrato/nuevo: el encabezado exige "Mínimo 1 archivo de evidencia" pero el campo dice "EVIDENCIA opcional". El servidor exige (bien); la etiqueta miente.
2. [MEDIO][sensibilidad] Una organización puede iniciar por token una observación antirrábica de 10 días sobre la mascota de cualquier ciudadano (mordedura/nuevo). Es la función correcta para clínicas/refugios, pero el poder es grande: no vi en el form ninguna mención de auditoría/notificación al dueño (habría que verificar qué le llega al dueño — no lo ejecuté para no intervenir la mascota de un tercero).
3. [NO CONCLUYENTE] En mi intento de envío de denuncia, al fallar la validación de evidencia el form quedó con tipo/gravedad/campos vacíos (solo sobrevivió una descripción). Puede ser artefacto de mi automatización (setters nativos sobre selects controlados), así que NO lo afirmo como bug — pero vale re-probar a mano: "¿fallar el adjunto te borra el resto del form?".
4. [INFO] No concreté el envío de la denuncia profesional (la subida de archivo controlada resistió mi harness). Queda para pasada manual: envío completo + verificación en Emitidos + qué ve gob/moderación + derivación a recibidos.

## Rutas apéndice
/org/[t]/maltrato/nuevo ✓ (form + validaciones, sin envío final) · /org/[t]/maltrato/recibidos ✓ (vacío honesto) · /org/[t]/mordedura/nuevo ✓ (form, sin envío)

---

# Bloque 7 — Cuenta, membresías y bajas (sin ejecutar bajas)

Cuenta: alejo@ (multi-org, el caso más rico para renuncias). ~01:55 ART.

## Funcionó / visto
- /cuenta/privacidad: derechos Ley 25.326 bien resueltos — "Descargar JSON" (art. 14), eliminación soft-delete con hash de PII (art. 16), explicación de QUÉ SE CONSERVA y por qué (Res. SENASA, Ord. CABA 41.831, Ley 14.072), todo con registro en audit log. De lo mejor escrito del producto.
- /cuenta/memberships: "Mis organizaciones · 4 membresías" con rol, verificación y fecha. PROTECCIÓN DE ÚLTIMO ADMIN: "Renunciar" deshabilitado con tooltip "Sos el único administrador. Asigná otro administrador antes de salir" en 3 de las 4 orgs ✻. En la única renunciable (Mascotas BA Centro, tiene otro admin) la confirmación es inline: "¿Confirmar que querés renunciar? [Renunciar][Cancelar]" — llegué, describí y CANCELÉ (regla de la casa).
- /cuenta/solicitudes: 1 solicitud (verificación de organización, APROBADA, enviada y decidida 10-ago) con filtros por estado.
- /cuenta/upgrade: "Tu rol en miMAR" — alta de matrícula veterinaria (verifica la autoridad de la localidad) y crear organización; muestra el prerequisito "DNI declarado" ✓.
- Desactivar cuenta (desde el hub /cuenta → Zona de riesgo): modal "irreversible desde el panel, para reactivar contactá al soporte", MOTIVO OBLIGATORIO (mín. 5 caracteres). Llegué a la confirmación, la describo y CANCELO sin ejecutar ✓.

## Hallazgos
1. [MEDIO][rutas] /cuenta/renunciar y /cuenta/desactivar (rutas del inventario) redirigen al hub /cuenta sin abrir el flujo correspondiente — igual que /cuenta/transitos. Tres rutas del inventario que existen como page.tsx pero en el build son redirects mudos; los flujos reales viven como sheet/modal del hub o en /cuenta/memberships. Como deep-links (p.ej. desde un mail de soporte "andá a /cuenta/desactivar") no llevan a nada específico.
2. [MENOR][consistencia] /cuenta/casos redirige a /mis-mascotas#inbox: la "bandeja de casos" personal vive en el home de mascotas. En alejo mezcla casos de sus orgs (custodia de TN0813-Rocco, propuesta de Toby) con lo personal; y un caso QA de hace 1 MES sigue "abierto" — sumado a los 584 casos abiertos que muestra el briefing admin, sugiere que nadie cierra casos (ciclo de vida sin higiene).
3. [MENOR][naming] URL en inglés /cuenta/memberships para la pantalla "Mis organizaciones" (todo lo demás está en castellano).
4. [INFO] El hub /cuenta con secciones numeradas 01-04 es claro y completo; "Notificaciones push" con toggle por dispositivo.

## Rutas apéndice
/cuenta/privacidad ✓ · /cuenta/memberships ✓ · /cuenta/solicitudes ✓ · /cuenta/upgrade ✓ · /cuenta/renunciar → redirect ✓(documentado) · /cuenta/desactivar → redirect ✓(flujo real alcanzado vía hub, frenado en confirmación) · /cuenta/casos → redirect a #inbox ✓

---

# Bloque 8 — Gobierno y admin (padrón, observaciones, operativos, RUPGA, directorio…)

Cuentas: lucas@ = GOBIERNO "5 localidades · CABA" (Palermo, Puerto Madero, Recoleta, Retiro, San Nicolás) — descubierto en esta pasada; lilian@ = veterinaria de planta (Clínica Recoleta); admin@ = superadmin. ~02:00 ART.

## Lo fuerte: mis datos QA movieron los tableros de gobierno
- /gob/padron: "PREÑECES ACTIVAS: 1" (el embarazo de TN0813-Luna), "COBERTURA ANTIPARASITARIA 0,1% — 1 de 1.253" (mi antiparasitario es el único en 12 meses). Los KPI de gobierno leen los eventos del dueño EN VIVO ✓. Preguntas-título ("¿Crece sano el padrón…?"), vistas duales Población/Censo, export CSV, filtros por localidad.
- /gob/observaciones: la observación de Luna listada "Inicio: hace minutos · Cierre estimado: 23 de ago" (13+10 ✓ cálculo correcto) con legislación citada y filtros de estado. /gob/observaciones/[token]: cierre profesional (Negativo/POSITIVO/Fallecido/Sin seguimiento) — CERRÉ la observación de Luna como Negativa con nota TN0813 ✓. Ciclo mordedura completo: dueño reporta → observación automática → vigilancia gob → cierre profesional.
- /gob/operativos ✓ ("indicador → lista objetivo para actuar"; Campañas = rendimiento). /gob/directorio ✓ (Organizaciones/Usuarios/Servicios/Credenciales, "misma gramática: buscar, verificar y revocar"; 7 orgs en jurisdicción). /gob/suscripciones ✓ (umbrales de métricas personales). /gob/mascotas/[token] ✓ (ficha completa de Luna con raza/chip/titular).
- Gemelas ✓: /admin/padron = misma pregunta con "vista nacional + ranking por provincia"; /admin/directorio, /admin/suscripciones, /admin/mascotas/[token] idénticas en gramática; reglas ya verificadas en Bloque 5. En lo comparado, gob y admin DICEN LO MISMO con alcance distinto (jurisdicción vs nacional).
- /admin/cuentas ("cuentas privilegiadas", roster gob+admin), /admin/inteligencia ("señales por territorio — sin puntuación de personas" ✻), /admin/admins/new (magic link), /admin/govts/new (localidades iniciales), /admin/outbox y detalle.

## Hallazgos
1. [MEDIO][gemela rota] /gob/servicios/[offeringToken] → 404 con el token que las demás vistas usan (DEMO-SVO-CABA-RABIES), mientras /admin/servicios/[mismo] renderiza la vista de aprobación completa. Si el flujo dice "la autoridad competente revisa y aprueba" los servicios, la autoridad jurisdiccional no tiene página de detalle (¿aprueba solo desde directorio?). · ~02:00.
2. [MEDIO][gemela rota] /admin/observaciones/[token] → 404 mientras su hija /admin/observaciones/[token]/microchip/reemplazar SÍ existe (con "todas las razones disponibles, incluidas fraude y duplicado" + audit log). Padre roto, hija viva — ruta huérfana de facto: a reemplazar-chip-admin no se llega navegando.
3. [MEDIO][números] /admin/outbox/[id]: panel autocontradictorio — "Entregado 20/06/2026 15:00" conviviendo con estado "transmisión pendiente de endpoint receptor", "Intentos: 0", "Último intento: —" y "Próximo reintento: 10/07/2026" (fecha pasada). No le creí a ninguno de los cuatro números juntos.
4. [MENOR][alias] /gob/rupga y /gob/analitica son redirects a tabs (directorio?registro=credenciales y programa?vista=analitica) — no huérfanas, pero el inventario las cuenta como páginas.
5. [MENOR][copy] En /gob/observaciones/[token] el encabezado dice "ADMIN · VIGILANCIA · CIERRE PROFESIONAL" dentro del portal GOBIERNO (label del portal equivocado). En /admin/admins/new: "tendra", "enviara" sin tilde.
6. [MENOR] /admin/cola/[publicToken] → 404 con token de mascota (el parámetro del inventario no coincide con lo que la cola espera, o la ruta quedó vieja).
7. [INFO] Roles seed descubiertos en esta corrida: lucas@=gobierno CABA 5 localidades; lilian@=vet de planta; noeli@=ciudadana voluntaria. El "briefing" admin comparte colas con gob explícitamente.
8. [INFO][números] Briefing admin: "CASOS ABIERTOS: 584" — consistente con casos QA de hace un mes aún abiertos (Bloque 7): el ciclo de vida de casos no tiene cierre operativo.

## Rutas apéndice cubiertas
gob: padron✓ observaciones✓ observaciones/[t]✓(ejecutado cierre) operativos✓ rupga→alias✓ directorio✓ analitica→alias✓ suscripciones✓ mascotas/[t]✓ servicios/[t]✗404 reglas✓(B5)
admin: padron✓ directorio✓ suscripciones✓ mascotas/[t]✓ servicios/[t]✓ observaciones/[t]✗404 observaciones/[t]/microchip/reemplazar✓ cuentas✓ inteligencia✓ outbox/[id]✓ admins/new✓ govts/new✓ cola/[t]✗404 reglas✓(B5)
No ejecutadas: /gob/disputas/[disputeToken] (sin token de disputa disponible) · /admin/admins/[userId] · /admin/govts/[userId] (roster detail, sin userId a mano).

---

# Bloque 9 — Público suelto (y restos org)

Anónimo (sin sesión) + alejo@ para las rutas org. ~02:05-02:15 ART.

## Sin sesión iniciada (como pide el brief)
- /leyes ✓: marco legal en lenguaje simple (identificación, bienestar, zoonosis, datos personales, fin de vida, mirada urbano-rural con hidatidosis). Disclaimer correcto.
- /p/DIM-ZNBD-C5GZ (credencial pública de Luna) ✓: **el banner "Animal Potencialmente Peligroso (PPP) — CABA Ley 4078 / PBA 14.107" aparece en la credencial pública** horas después de crear la regla (Bloque 5 → superficie pública ✓). NIVEL 0 · IDENTIDAD: vacunación "sin registros", MICROCHIP "Sí" / TATUAJE "Sí" (existencia sin números — tiers de privacidad bien hechos). CTA "¿Encontraste a esta mascota?".
- /p/[t]/sighting ✓ guard: "Esta mascota no está perdida. El reporte de avistaje sólo aplica mientras la mascota está marcada como perdida." (No pude probar el flujo positivo sin marcar perdida a una mascota — no quise sumar un episodio de pérdida al historial; queda mapeado.)
- /libreta/compartir/LBR-68RD-448Q (link con vencimiento del Bloque 4) ✓✓: vista de solo lectura ANÓNIMA de la libreta completa con "vence el 20 de agosto · Expira en 6 días", y acá SÍ se ven los números de chip y tatuaje (tier privado > público ✓ coherente). Aviso "para sumar eventos contactá al dueño/a".
- /recuperar/actualizar → redirige a /recuperar?expired=1 (sin token de mail, cae al form de pedido — razonable).
- /mis-mascotas/reclamar-dni anónimo → login; logueado (graciela) ✓: reclamo por DNI con estado inteligente ("tu perfil ya tiene un DNI registrado…").

## Restos org (alejo@, Refugio Patitas del Norte)
- /censo ✓: PERROS 2 · GATOS 1 · OTRAS 1 · TOTAL 4 — consistente con ocupación 3 + mi ingreso TN0813-Rocco ✓ (números que cierran). Pide declarar capacidad para % de ocupación.
- /checkins ✓: check-ins post-adopción autoreportados (Vencidos 0 / Próximos 6, p.ej. "Pampa — 1 mes — adoptante Noelí"). ACLARA el misterio del Bloque 3: el "checkin" es un autoreporte del ADOPTANTE, pero la ruta del dueño (eventos/nuevo/checkin) da 404 — el que tiene que reportar no tiene la página.
- /cobertura ✓ (zonas de alerta por jurisdicción), /configuracion ✓ (perfil público), /mensajes ✓ (vacío honesto; "responder por fuera de miMAR"), /miembros/invitar ✓ (roles Admin/Coordinador/Miembro/Voluntario/Veterinario, link 14 días), /pets/no-aptas ✓ (vacío honesto; URL mezcla inglés "pets"), /transferencias/nueva ✓ (elegir entre las 4 en custodia), /mascotas/[t]/transfer ✓ ("acción atómica… evento custody_transferred"), /mascotas/[t]/microchip/reemplazar → sheet ✓, /casos ✓ (filtros por tipo/estado/urgencia).
- /design/dashboards ✓ (interna, como avisa el apéndice): "Primitivas de dashboards (E1) — showcase de QA visual — reemplazar con datos reales en E2-E5". Declarada, no abandonada.

## Hallazgos
1. [MEDIO][acceso] Con sesión de otro usuario, la mascota ajena (/mis-mascotas/DIM-8PBD-KVAF como alejo) da la PÁGINA 404 genérica — bien que no filtre datos, pero "no existe" vs "no es tuya" puede confundir; y estando logueado /iniciar-sesion redirige al portal sin forma de cambiar de cuenta (fricción multi-cuenta: hay que encontrar "Cerrar sesión" en /cuenta).
2. [MENOR][consistencia] La vacuna cargada POR LA CLÍNICA en el turno (Bloque 2) aparece en la libreta de CW-0808b como "REGISTRADO POR CLÍNICA VETERINARIA RECOLETA · Pendiente de confirmación del profesional" y cuenta como "SIN CONFIRMAR". Si la registró la clínica en su agenda, ¿qué profesional falta confirmar? Los tiers de confianza (declarado/registrado/confirmado) necesitan una leyenda.
3. [INFO] Vence de la antirrábica auto-calculado 13-ago-2027 = la "próxima dosis" que cargó la clínica ✓ consistente.

## Rutas apéndice cubiertas
/leyes✓ /p/[t]/sighting✓(guard) /mis-mascotas/reclamar-dni✓ /recuperar/actualizar✓(redirect) /org: casos✓ censo✓ checkins✓ cobertura✓ configuracion✓ mensajes✓ miembros/invitar✓ pets/no-aptas✓ transferencias/nueva✓ mascotas/[t]/transfer✓ mascotas/[t]/microchip/reemplazar✓ /design/dashboards✓
No ejecutadas: /org/[t]/miembros (lista; solo vista invitar) · sighting positivo (requiere marcar perdida).

---

# Cinco lentes — síntesis

**Claridad.** Los textos largos son excelentes (privacidad Ley 25.326, asistencia RUPGA, canal profesional de maltrato, guards con explicación). Falla en los bordes: etiqueta "EVIDENCIA opcional" bajo un requisito "mínimo 1 archivo"; "Información clínica · pregnancy"; JSON crudo como detalle de regla; redirects mudos (atestar sin raza, /cuenta/*); "ADMIN·VIGILANCIA" dentro del portal GOB; formatos de fecha mm/dd vs dd/mm entre formularios.

**Unificación.** La "misma gramática" está bien lograda entre gob y admin (padrón/directorio/reglas/suscripciones: misma pregunta, distinto alcance) y en el patrón buscar-verificar-revocar. Se rompe en: localidad (autocomplete en voluntario/mudanza/regla vs texto libre en intake vs invisible en servicios), dos vías de asignar tránsito (pool con consentimiento vs directa a miembro) sin explicar la diferencia, y checkin org-side sin su mitad ciudadana.

**Seguimiento.** "Si cierro el navegador y vuelvo mañana, ¿desde dónde me entero?" — Del lado que ESPERA: mal en propuestas de tránsito (sin notificación, expiran solas) y regular en el feed (orden por tipo entierra lo nuevo; 19-67 sin leer heredadas vuelven ciega la campanita). Del lado que ACTÚA: bien (banners de estado, casos abiertos en el perfil, "Ver detalle" — aunque el del fin de tránsito apunta a /mis-mascotas genérico y el mensaje de cierre prometido nunca aparece in-app). El recordatorio de dosis siguió vivo tras el fin de medicación pese a la promesa de cancelarlo.

**Consistencia entre roles.** El mismo hecho se ve coherente: la vacuna del turno aparece en la agenda org (ASISTIDO), en la libreta de la dueña (con proveniencia "registrado por Clínica…") y el cupo 1/6 en ambas puntas; la mascota se ve igual en /gob/mascotas y /admin/mascotas; el foster ve la mascota con permisos de dueño como promete el copy. Grietas: el org no ve la nota de aceptación del voluntario ni sus preferencias/notas de slot; el aviso de exceso de duración lo ve solo el voluntario; vacuna org-registrada que igual queda "pendiente de confirmación del profesional" sin decir de quién.

**Confianza en los números.** Los números grandes cierran (censo 4 = 3+mi ingreso; cupos 6→5→4→5; cierre estimado 13+10=23; vence = próxima dosis; "afecta a ~1 mascota" = Luna; PREÑECES ACTIVAS 1 = mi embarazo). Los que no cierran: badge "Voluntarios" que cuenta propuestas pendientes; timeline 15 vs "16 asientos" vs filtros que suman 12; "PRÓXIMOS CONFIRMADOS 1" con "OCUPACIÓN 0%"; "turnos nuevos: 16" vs grilla visible; outbox "Entregado" con "0 intentos" y reintento en el pasado; "0 de 4" → "0 de 3" al completar raza sin explicar por qué desapareció la fila.

---

# Cuatro preguntas de cierre

**¿En qué momento no supiste si algo había pasado?** Dos veces. (1) La propuesta de tránsito: la emití como org y del lado voluntaria no llegó ninguna notificación — fui a /cuenta/transitos/propuestas "a ciegas" porque sabía que existía; un usuario real no va. (2) El mensaje del cierre de tránsito: el sheet promete "el tránsito recibe el mensaje" y ese mensaje no aparece en ningún lado visible.

**¿Hiciste algo dos veces por no saber si salió?** Sí, dos veces y con resultados opuestos. La mordedura: el primer submit mostró "(OBLIGATORIO)" como si hubiera fallado, reintenté y el sistema dijo "ya hay una observación en curso" — había entrado; el guard me salvó del duplicado pero la confirmación fue confusa. El turno: reservé el mismo slot dos veces A PROPÓSITO y salió dos veces sin aviso — ahí no hay guard y el doble click genera duplicados reales. Bonus: el wizard de voluntario re-arma el paso 1 con los mismos datos tras inscribirte, invitando al slot duplicado.

**¿Hubo algún número que no le creíste?** El badge "Voluntarios [2]" con una lista de 2 voluntarios y 2 propuestas pendientes (mide otra cosa que su etiqueta); el "16 asientos / 15 eventos / filtros=12" de la misma historia clínica; y el panel de outbox que dice a la vez "Entregado", "pendiente de endpoint", "0 intentos" y "próximo reintento" en fecha pasada.

**¿Qué pareció abandonado, inalcanzable o contradictorio?** (a) 404 reales: eventos/nuevo/checkin (con su mitad org viva), /mis-mascotas/[t]/buscar-hogar en mascota propia, /gob/servicios/[token], /admin/observaciones/[token] (con hija funcional — huérfana de facto), /admin/cola/[publicToken]. (b) Rutas del inventario que son redirects al hub sin abrir nada: /cuenta/transitos, /cuenta/renunciar, /cuenta/desactivar (+ alias sanos: /gob/rupga, /gob/analitica, /vacunas, /mostrar-libreta). (c) Casi-huérfanas por navegación: /mis-turnos no tiene entrada visible (nav/cuenta/footer) — el único camino ciudadano que encontré es vacunas/programar→"buscar turno en mi zona"; el offering de Recoleta solo existe si te pasan el link. (d) WIP declarado, no abandono: /viaje ("Próximamente"), /design/dashboards ("E1, reemplazar en E2-E5"). (e) Contradicción de datos: la jurisdicción del servicio ("CABA" en admin vs "Recoleta" en ciudadano) — probable raíz del hallazgo #1.

---

# No ejecutado — mapa de la próxima pasada

**Rutas del apéndice sin ejecutar (con motivo):**
- /mis-mascotas/nueva/match/[matchedPetToken] y /org/[t]/intake/match/[matchedPetToken] — requieren colisión real de chip (crear perdida-con-chip e ingresar el mismo chip por intake). Es una pasada corta y jugosa en sí misma.
- /p/[t]/sighting FLUJO POSITIVO — requiere marcar una mascota como perdida; no quise sumar episodios de pérdida. Combinable con la anterior (perdida→sighting→encontrada).
- /gob/disputas/[disputeToken] — sin token de disputa en el seed visible; no encontré desde dónde se genera una disputa.
- /admin/admins/[userId] y /admin/govts/[userId] — roster detail; el listado /admin/cuentas existe, no abrí fichas.
- /org/[t]/miembros (lista) — solo abrí /miembros/invitar.
- /gob/reglas/[c]/[p]/[l]/nueva y /editar/[ruleId] — mismo wizard verificado del lado admin; no repetido en gob.
- /org/[t]/mascotas/[t]/foster-fin como URL propia — el cierre se ejecutó vía sheet fin-transito (mismo flujo).
- eventos/nuevo/mordedura/exito — el flujo no me llevó (terminó en guard de observación en curso).
- Envío final de la denuncia de maltrato profesional + verificación en Emitidos/moderación/derivación gob→org — la subida de evidencia resistió mi harness; a mano son 2 minutos.
- Impresión a PDF de chapita/cartel — window.print() bloquea el navegador automatizado; los 3 formatos de chapita se verificaron en pantalla (mobile).
- Los 9 tipos de regla jurisdiccional restantes (probé lista de razas PPP; quedan umbral de peso, atestación, canales, chip obligatorio, ventanas, estadía, MPF).

**Deudas de verificación (cosas que vi a medias):**
- ¿La propuesta de tránsito notifica por email/push aunque no in-app?
- ¿Quién confirma la vacuna "pendiente de confirmación del profesional" si ya la registró la clínica?
- El form de maltrato tras fallar validación: ¿pierde estado también a mano, o fue artefacto de mi automatización?
- Semántica del contador de "Casos" (crece con intake y propuesta; 584 abiertos globales; casos QA de un mes siguen abiertos).
