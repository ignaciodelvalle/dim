# miMAR · staging — Recorrido serial de 9 roles (RD0818)

**Entorno:** https://dim-staging.vercel.app · **Build verificado:** `<meta name="mimar-version">` = **`eb72f78`** (esperado `eb72f78` — coincide por prefijo exacto).
Leído al inicio (2026-08-18 17:27:20Z) y al cierre de cada tour: 17:44Z (T1) · 18:08Z (T2) · 18:16Z (T3) · 18:30Z (T4) · 18:37Z (T5) · 19:10Z (T6) · 19:31Z (T7) · 19:39Z (T8) · 19:55Z (T9) · 19:55:59Z tras el último logout. **No cambió en ningún momento de la corrida.**

**Corrida:** 2026-08-18, 17:24Z → 19:56Z (14:24 → 16:56 hora Buenos Aires). Prefijo de datos: **`RD0818`**.
**Operador/agente:** Claude (Cowork) manejando el Chrome del operador vía extensión ("Browser 1", Windows). El contenedor cloud no llega a staging (el proxy devuelve 403), así que todo el recorrido fue por el navegador del operador.

**Logística de sesión (desvío del modo primario, declarado):** no hubo JSON de cookies pre-acuñadas y `javascript_tool` bloquea `document.cookie` (no se puede setear ni leer cookies `sb-*` desde la extensión), por lo que se usó el modo de respaldo: **un login por cuenta desde `/iniciar-sesion` con `Test1234!`**, en serie, agotando cada tour antes de la siguiente cuenta. Excepción documentada: la coda del Tour 6 requirió un **segundo login de `noeli@dim.test`** (2 en total para ese email en ~40 min; muy por debajo de 5/min · 20/hora). Ningún login falló contra el servidor; un intento previo con `owner@` no llegó al servidor porque el autofill de Chrome había pre-cargado `alejo@dim.test` en el campo y la validación HTML5 lo frenó (nota de automatización, no de producto). Identidad verificada tras cada login (menú de cuenta / header): Dueño Demo CABA · Adriana Sosa · Dra. Lilian Marrone · Noelí Assandri · Alejo Caride · Lucas Etcheverry · Valeria Ocampo · Administración miMAR.

**Trampas de herramienta observadas (no de producto):** `get_page_text` sobre `/turnos/buscar/DEMO-SVO-CABA-RABIES` devuelve el calendario completo (miles de líneas); `javascript_tool` trunca salidas largas (~1 KB) y bloquea cookies/query strings; algunos clicks por `ref` sobre opciones de radio no seleccionan (por coordenada sí); los pasos ocultos de wizards aceptan `ref` pero no reciben tipeo hasta ser visibles. Ninguna captura de pantalla colgó (no reproduje la trampa CDP/backdrop-blur; usé DOM en los sheets).

---

## Resumen ejecutivo

**Estado general:** de ~120 checkpoints caminados, la enorme mayoría PASA. Ningún hallazgo bloqueante de plataforma; sí hay un flujo clínico que se traba (vacuna Séxtuple en Atender), una pantalla de gobierno que rechaza a su propio rol (`/gob/decomisos`), y varias inconsistencias de datos/copy visibles para un funcionario.

Hallazgos ordenados por peso (detalle en cada tour):

1. **[T4] Atender → Vacuna con "Séxtuple (DHPPi-L)" no se puede registrar**: la desambiguación del catálogo entra en loop ("Confirmá la vacuna en el listado de abajo antes de continuar" ↔ elegir opción ↔ mismo error). Con "Antirrábica" (match único) funciona al primer intento.
2. **[T7/T8] `/gob/decomisos` rechaza a las cuentas de gobierno** ("Tu usuario no está asociado a ninguna autoridad sanitaria. Contactá al administrador.") tanto para CABA como para PBA, mientras `/gob/decomisos/nuevo` sí abre.
3. **[T1/T6] Ficha pública de adopción de Negro (`/adoptar/DIM-S012-RECO`) muestra "REFUGIO RESPONSABLE Refugio Patitas del Norte · en custodia desde 7/7/2026"** pero el catálogo, el perfil de la Red de Rescate Puerto Madero y el hub de transferencias de Patitas dicen que Negro fue **transferido y aceptado por Puerto Madero el 8/7/2026** — el detalle público muestra la custodia original, no la vigente.
4. **[T3] Check-in post-adopción:** el envío crea el asiento "Seguimiento post-adopción" pero (a) no hay confirmación visible, (b) el texto de "¿Cómo está?" no aparece ni en la libreta ni en el detalle ("Sin campos adicionales"), y (c) al reabrir `/eventos/nuevo/checkin` vuelve a ofrecer el formulario en vez de "Sin check-ins pendientes" (el recordatorio no se consumió, o no hay guard).
5. **[T5] `/casos/CAS-SW47-MFMM` (disputa de Bruno) expone texto de desarrollo al usuario**: "Detalle en `external_proceeding_reference` del dispute. Cada caso tiene su propia carátula y juzgado".
6. **[T4] En la libreta compartida, la vacuna FIRMADA por la vet muestra PROFESIONAL "—"** mientras la declarada por el dueño muestra el nombre citado; la firma sí se refleja en la credencial pública ("ANTIRRÁBICA VIGENTE · FIRMADA") y en la info clínica ("Verificado por veterinario matriculado").
7. **[T2] Vacuna con foto (dueño):** el asiento de vacuna no tiene "Ver detalle" (los otros tipos sí) y el adjunto no se ve en ningún lado — no pude confirmar desde la UI que la foto se guardó.
8. **[T4] Asimetría lectura UI/servidor:** `vet_individual` no ve Miembros ni Servicios en el rail, pero `/org/[t]/miembros` y `/org/[t]/servicios` abren en modo lectura (la escritura sí está bloqueada). Agenda y Mordedura se rechazan correctamente.
9. **[T6] Reporte profesional de maltrato:** el 1er submit no hace nada visible cuando falta "DESCRIPCIÓN DEL ANIMAL *" (validación nativa sin scroll ni mensaje persistente) y, al enviarse, aterriza en la pestaña "Recibidos" vacía sin código ni toast (el reporte está en "Emitidos").
10. **[T9] `/admin/programa` (nacional) agotó el tiempo dos veces** ("La consulta superó el tiempo de espera · Código 2d59a8bc") antes de cargar al tercer intento; `/admin/inteligencia` cargó parcial. Fail-loud correcto, pero para un funcionario es una pantalla que "no anda".
11. **[T7] Programa CABA muestra dos denominadores lado a lado** ("faltan ~532 chips sobre el padrón" vs "~220.967 mascotas sin chip" de impacto extrapolado) — número que no le creí sin la nota del Briefing.
12. **[T7/T9] `/gob/outbox` vacío tras un reporte crítico y una mordedura de esta corrida**; `/admin/outbox` sólo tiene entradas de seed con "transmisión pendiente de endpoint receptor" (coherente con "Fuera de alcance", pero el canal profesional promete "notifica inmediatamente a las autoridades").

Cosméticos/copy (varios): "1 mascota publicadas"; botón "Iniciá sesión para postular" que lleva a `/registro`; aviso "Queda como dato declarado" dentro del flujo de vet que firma; "Volver al panel del refugio" en una clínica; "VACUNA PRÓXIMA A VENCER" en una vacuna vencida hace 117 días; "Buscá entre las orgs en tus 1 localidad" con alcance provincia; "Refugio verificado por miMAR" en una Red de rescate; not-found de `/casos/*` que habla de "credencial"; email crudo como nombre de dueño en `/gob/observaciones`; org llamada "Refugio Pendiente Verificación" listada como verificada en directorio público, /transfer y derivaciones.

Datos creados por esta corrida (todos con `RD0818`, append-only): denuncias anónimas **DEN-7BMJ-AQZC** (Palermo) y **DEN-DCED-ENK9** (La Plata); mascota **RD0818-Firulais = DIM-7WEY-B533** (owner@) con vacuna, peso, antiparasitario, ciclo perdida→encontrada, turnos **APT-ZN7T-NQ39** (cancelado) y **APT-PM4R-PEC4** (asistido), link de libreta **LBR-ZG8H-PUCE** (vence 25/8); check-in de Mora; postulación de Adriana Sosa a Bichita; dos eventos firmados por lilian@ sobre DIM-7WEY-B533; nota de oferta de tránsito de noeli@; ingreso **RD0818-Manchas = DIM-XS45-FSAM** (Patitas) publicado en /adoptar; reporte de maltrato org **DEN-8RT4-PH4Z**; propuesta de tránsito **FP-TAH9-UXVN** (pendiente, expira 25/8); mordedura → observación **CAS-CWSP-HD24** (cierre 28/8); servicio **OFR-APJ6-GXY5** (pendiente de aprobación); alerta de esterilización CABA pasó de DISPARADA a RECONOCIDA (+ nota de seguimiento; NO resuelta).

---

## TOUR 1 — Público sin sesión (17:27Z–17:44Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| 1 | `/` hero con credencial de Pampa + QR; nombre/QR/credencial coinciden | **PASA** — QR SVG decodificado (path → cv2): `https://dim-staging.vercel.app/p/DIM-PAMP-0001`; hero "PAMPA · DIM-PAMP-0001", link a `/p/DIM-PAMP-0001` |
| 2 | `/p/DIM-PAMP-0001` Tier 0 sin datos del dueño | **PASA con nota** — foto, Pampa, Perro · Caniche · Hembra · 4 años, MICROCHIP Sí, ANTIRRÁBICA "VIGENTE · FIRMADA", "Verificado por veterinario matriculado", "Esta vista no expone contacto del dueño…". La página está en **NIVEL 2 · DATOS MÉDICOS** ("El dueño habilitó la libreta médica de forma permanente") con resumen (VACUNACIÓN 1 · 2 faltantes; ESTERILIZACIÓN Sí) — no es Tier 0 por decisión del seed/dueño |
| 3 | `/adoptar` filtro por especie + ficha real + CTA de login | **PASA** — 2 publicadas (Bichita, Negro); species=dog → 1 (Negro); ficha `/adoptar/DIM-S012-RECO` con historia, estado médico, refugio, "Iniciá sesión para postular" → `/registro?intent=apply&returnTo=…` (no deja postular sin cuenta) |
| 4 | `/perdidas` es listado con filtro por provincia | **PASA** — 66 activas, 24 mostradas + "Mostrar más", filtro CABA → 8 tarjetas; sin mapa |
| 5 | `/refugios` → perfil real | **PASA parcial** — 4 orgs; Patitas: avatar con letra (sin logo real), VERIFICADO, "1 en adopción" (Bichita), "Dónde estamos", "Cómo ayudar" (adoptar/tránsito/voluntario). No hay sección "servicios" en un refugio |
| 6 | `/denuncias/nueva` wizard 5 pasos → código | **PASA** — 9 tipos sin "mordedura"; gravedad; descripción + pin (la dirección tipeada geocodifica y coloca el pin: "Encontramos: Plazoleta Julio Cortázar, Palermo…"); paso 4 opcional; anónima + adjunto hachi.jpg (1/5) → **DEN-7BMJ-AQZC** (17:37:08Z) |
| 7 | `/denuncias/buscar` con el código | **PASA** — "Denuncia registrada · 18/8 14:37" → "Ver el seguimiento" (link con token, vence a la hora) → `/denuncias/seguimiento`: ESTADO Recibida, texto RD0818, contacto ninguno, 1 archivo, "ORGANISMO RESPONSABLE Autoridad competente de Palermo, CABA" |
| 8 | QR de perdida (Tier 1) + STOP en "encontré"/avistaje | **PASA** — `/p/DIM-WR9N-Y7BN` (CW-Tero) "SE BUSCA", NIVEL 0 · PERDIDO, botones "Lo tengo conmigo"/"Lo vi cerca de acá", última vez visto + mapa; `/encontre` y `/sighting` abiertos y descritos, **no enviados** |
| 9 | `/libreta/compartir/[shareToken]` | **PASA** — con el token del T2 (`LBR-ZG8H-PUCE`), sin sesión (entre logout de owner@ y login de adoptante@): libreta de solo lectura de RD0818-Firulais, "Compartido por Dueño · Expira en 6 días" |
| 10 | `/funcionalidades`, `/transparencia`, `/leyes` | **PASA** — nada contradice lo visto (QR, modo perdido, denuncia con código, catálogo, vacuna firmada); transparencia: 5 datasets CSV/JSON, `cobertura-antirrabica?format=json` responde 200 con meta |
| 11 | `/t/ZZZZ9999` degrada con gracia | **PASA** — HTTP 404 + "No encontramos esa credencial" (sin serial real) |
| 12 | `/casos/[publicCode]` | **PASA parcial** — `/casos/CAS-DWUZ-ARX6` (caso de perdida de CIU-Rocco, obtenido en T2) es público y explica por qué; `/casos/DEN-7BMJ-AQZC` y `/casos/CAS-PAVM-V72A` (bienestar) → "No encontramos esa credencial" (no públicos por diseño; copy de "credencial" en un caso) |
| 13 | Estáticas + `/sugerencias` | **PASA** (acerca, ayuda, accesibilidad, privacidad, terminos, cookies); **`/sugerencias` NO tiene formulario** ("Canal de sugerencias en preparación") ni sin sesión ni logueado |
| 14 | `/iniciar-sesion`, `/registro`, `/recuperar` sin enviar | **PASA** — Mi Argentina "(próximamente)" deshabilitado |
| — | Adaptación T8: segunda denuncia anónima con pin en La Plata | **PASA** — **DEN-DCED-ENK9** (17:40:02Z), organismo "Autoridad competente de La Plata, Buenos Aires"; >1 min entre ambas (rate limit respetado) |

**Qué probé y funcionó (método):** lectura de DOM/innerText y `read_page`, decodificación del QR desde el SVG, fetch same-origin de datasets, `fetch(...,{credentials:'omit'})` como sustituto de incógnito, screenshots en landing/credencial/perdidas/refugio/wizard.

Hallazgos:
- **OBSERVACIÓN:** `/adoptar/DIM-S012-RECO` (17:31Z, sin sesión) dice "REFUGIO RESPONSABLE Refugio Patitas del Norte · Palermo · En custodia desde 7 de julio de 2026" (link a `/refugios/DIM-389S-JFKJ`), mientras la tarjeta de `/adoptar` dice "Publica: Red de Rescate Puerto Madero", el perfil `/refugios/DIM-GUTF-WW4W` (Puerto Madero) lista a Negro y el de Patitas no; en T6 el hub `/org/DIM-389S-JFKJ/transferencias` muestra "Negro · CAS-FABE-AB8S · ACEPTADA · 8/7/2026". **HIPÓTESIS:** el detalle público toma la primera custodia (o el intake original) y no la vigente después de un `custody_transferred`.
- **OBSERVACIÓN:** la landing dice "AL DÍA" en la tarjeta de Pampa; su credencial pública dice "VACUNACIÓN 1 · 2 faltantes". **HIPÓTESIS:** el hero es copy fijo de marketing, o "AL DÍA" refiere sólo a la antirrábica.
- **OBSERVACIÓN:** el directorio público "Organizaciones verificadas" incluye "Refugio Pendiente Verificación (Recoleta)"; la misma org aparece como destino verificado en `/transfer` (T6) y en "Derivar a org" (T7). **HIPÓTESIS:** el seed la marca verificada con un nombre engañoso; no es un fallo del filtro.
- **OBSERVACIÓN:** `/sugerencias` no ofrece formulario (el brief lo esperaba). **HIPÓTESIS:** feature aún no habilitada en este build.
- Cosméticos: "1 mascota publicadas"; CTA "Iniciá sesión para postular" aterriza en `/registro`; gravedad "Moderado" se persiste como "Media — requiere intervención pronto"; "Hoy o ayer" se guarda como "Ocurrió el 17/8"; not-found de `/casos/*` y `/libreta/compartir/*` devuelven HTTP 200 (soft-404); nombres residuales de QA (E2EDeg-…, CursorPet-…, CW-Tero) visibles en `/perdidas`.
- Trampa conocida de `/ayuda` (link viejo `/login`): **no reproducida** — los links dicen "Iniciar sesión" y apuntan a `/iniciar-sesion`.

## TOUR 2 — Dueño `owner@dim.test` (17:46Z–18:09Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| 1 | `/inicio`: saludo, "Asentar un hecho", carrusel, vencimientos | **PARCIAL** — `/inicio` (y `/` logueado) **redirigen** a `/mis-mascotas/DIM-WS5E-XTUE` (CIU-Rocco, perdido): carrusel de avatares ✓, CUMPLIMIENTO/AVISOS (vencimientos) ✓, sin saludo; el concepto "Asentar" existe como ítem del nav inferior ("Mis mascotas · Asentar · Denuncias") pero no hay una home con saludo. `/mis-mascotas`: 13 activas · 6 en memoria, KPIs 1 por vencer · 1/13 al día · 12 casos abiertos |
| 2 | Alta de mascota → credencial con QR | **PASA** — `RD0818-Firulais` (Perro · Mixto/Cruza · Macho · CABA · Recoleta, foto toto.jpg) → `/mis-mascotas/nueva/DIM-7WEY-B533/credencial` "ya tiene su credencial" + QR + `/p/DIM-7WEY-B533` (17:48:41Z). No apareció el buscador de duplicados |
| 3 | Perfil, `?tab=libreta&lente=todo`, flip 3D | **PASA** — "Dar vuelta" → `?tab=libreta` (LIBRETA · DORSO) / "Ver credencial"; el selector de lente aparece con ≥2 tipos ("Filtrar asientos por tipo: Todos 4 · Vacunas 1 · Antiparasitarios 1 · Peso 1"); `/historial` → `?tab=historial` |
| 4 | Vacuna con foto desde `?sheet=anotar` | **PASA con hallazgo** — selector con 22 opciones en 6 categorías (sin "Adopción" para esta mascota); Antirrábica + próxima dosis autocompletada +1 año + lab/lote/aplicada por + notas + bolt.jpg → perfil "Vacuna antirrábica DECLARADA · Próxima 18/08/2027"; Libreta: asiento VACUNA · OBLIGATORIA con "DECLARADO POR VOS — CITÁS A RD0818 VET DECLARADO · Pendiente de confirmación · PEDIR VERIFICACIÓN →". **La foto no se ve y el asiento de vacuna no tiene "Ver detalle"** |
| 5 | `/turnos/buscar` → oferta de Recoleta → slot → reserva → `/mis-turnos` | **PASA** — "Campaña antirrábica CABA (demo focal) · Clínica Veterinaria Recoleta · Gratuito · 15 min · 80 turnos en 7 días" → slot mié 19/8 08:00 → `/turnos/buscar/DEMO-SVO-CABA-RABIES/reservar/[slotId]` (ruta anidada) → **APT-ZN7T-NQ39** (17:57:50Z) con QR de check-in; en `/mis-turnos` "Confirmado". Sin carrera de hidratación (1 click = 1 reserva) |
| 6a | Segunda reserva misma oferta + misma mascota → rechazo en castellano | **PASA** — "Esta mascota ya tiene un turno reservado en esta campaña." |
| 6b | Cancelar desde `/mis-turnos/[token]` | **PASA** — dialog "¿Seguro…? Esta acción no se puede deshacer" → "Turno cancelado… el horario quedó liberado" (18:00:00Z) |
| 6c | Re-reservar la misma oferta | **PASA** — **APT-PM4R-PEC4** mié 19/8 08:00 (18:00:33Z), queda confirmado para T6 |
| 7 | Peso + antiparasitario; tres tipos conviven con forma propia | **PASA** — peso 12,5 kg (`?sheet=peso`; CUMPLIMIENTO pasa de "0 de 3" a "0 de 2": la fila PPP se resuelve con el peso); antiparasitario "RD0818 Milbemax" Ambos, próxima 18/11/2026; libreta: PESO 12.50 kg + "TENDENCIA: cargá otro peso…", ANTIPARASITARIO · INTERNO + EXTERNO con PRÓXIMA DOSIS, VACUNA. Selector completo anotado (22 opciones) |
| 8 | Marcar perdida → `/p` en Tier 1 y en `/perdidas`; desmarcar → Tier 0 | **PASA** — flujo de 3 pasos (dónde/señas/qué se muestra) → "Activamos la búsqueda" (18:02:24Z); fetch anónimo: título "SE BUSCA: RD0818-Firulais", NIVEL 0 · PERDIDO, presente en `/perdidas` CABA; `?sheet=marcar-encontrada` → vuelve a "RD0818-Firulais | Credencial miMAR", fuera de `/perdidas` (18:03:19Z) |
| 9 | `/transferencias` SHOW-ONLY | **PASA** — Recibidas (0 pendientes, 4 aceptadas) / Enviadas (9 aceptadas); detalle PTR-Q23V-RSC9 (CW-Luna → graciela@dim.test, Regalo, ACEPTADA) sin acciones; no había pendiente para describir |
| 10 | `/mis-mascotas/postulaciones` | **PASA** (vacío esperado: "Todavía no te postulaste") |
| 11 | `/denuncias/mias` → detalle | **PASA** — 2 denuncias propias previas (REVISADA); detalle con código, "Ver caso CAS-PAVM-V72A", mapa, contacto, comentarios |
| 12 | `/notificaciones` | **PASA** — Todas 73 · Pérdidas 14 · Custodia 22 · Salud 8; acciones por ítem |
| 13 | `/cuenta` + sub-pantallas SHOW-ONLY | **PASA con notas** — "Dueño Demo CABA · owner@dim.test"; `/cuenta/privacidad` (Ley 25.326: descargar JSON / eliminar cuenta, no enviados); `/cuenta/upgrade` (matrícula + crear organización); `/cuenta/memberships` ("no participás…"); `/cuenta/solicitudes` (vacío); **`/cuenta/verificar-dni` redirige a `/cuenta`**; **`/cuenta/casos` redirige a `/mis-mascotas#inbox`** |
| 14 | `/cuenta/crear-consultorio` STOP | **PASA como guard** — para un dueño sin matrícula muestra "primero tenés que registrar tu matrícula… → Registrar mi matrícula"; el wizard no abre (nada que enviar) |
| 15 | `/mis-mascotas/[token]/mostrar-libreta` → link temporal | **PASA** — redirige a `?sheet=compartir`; "RD0818 QA link vet" 7 días → **`/libreta/compartir/LBR-ZG8H-PUCE`** (vence 25/8, sin vistas, Copiar/Revocar) + toggle "Mostrar libreta médica (Tier 2)" 24h/7d/30d/siempre |

**Qué probé y funcionó (método):** flip por click + URL, sheets leídos por DOM (sin capturas), fetch anónimo para verificar Tier público, `read_page` en formularios, verificación cruzada del guard de turnos.

Hallazgos:
- **OBSERVACIÓN:** `/inicio` no es una home: redirige a la ficha de la mascota perdida (17:46Z, owner@). **HIPÓTESIS:** el home pet-centric elige la mascota más urgente; el saludo/"Asentar un hecho" del brief quedó absorbido por el nav.
- **OBSERVACIÓN:** tras registrar vacuna con foto (17:52Z), la libreta no muestra el adjunto y el asiento de vacuna es el único sin "Ver detalle →" (registro, peso y antiparasitario sí lo tienen). **HIPÓTESIS:** la card de vacuna no renderiza adjuntos/detalle; también podría haber fallado el upload silenciosamente (no verificable desde la UI).
- **OBSERVACIÓN:** el selector `?sheet=anotar` ofrece "Marcar como encontrada" en una mascota que no está perdida. **HIPÓTESIS:** las opciones de ESTADO no se filtran por estado actual.
- **OBSERVACIÓN:** en `/mis-turnos` → Pasados, "Tango · Lun 22 jun 12:00" sigue "Confirmado" (nunca pasó a asistió/no asistió). **HIPÓTESIS:** no hay auto-cierre de turnos vencidos.
- Cosméticos: antiparasitario "Ambos" muestra "VÍA Oral"; recordatorios diarios de la misma vacuna se acumulan como notificaciones separadas; localidad por defecto "Barracas · CABA" en el buscador de turnos (¿del perfil?).

## TOUR 3 — Adoptante `adoptante@dim.test` (18:11Z–18:17Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| 1 | `/mis-mascotas` muestra la adoptada | **PASA** — Mora (DIM-MORA-DEMO), 0/1 al día, sin casos |
| 2 | `?sheet=anotar` → categoría Adopción → Check-in | **PASA** — categoría **ADOPCIÓN** con "Check-in post-adopción →" (`/eventos/nuevo/checkin`); contraste: en la mascota de owner@ esa categoría no aparece (el filtro por contexto de adopción parece activo, distinto de la trampa A9 del brief) |
| 3 | Primera corrida: completar y enviar; "confirma el envío" | **PARCIAL** — envío 18:11:59Z redirige al perfil **sin toast ni confirmación**; la libreta sí muestra "SEGUIMIENTO POST-ADOPCIÓN · hoy · CARGADO POR VOS" (5 asientos: seguimiento, adopción finalizada 25/7, elegibilidad 25/6, registrada 31/5 por titular anterior, ingreso 31/5) |
| 4 | Corridas siguientes: "Sin check-ins pendientes" | **FALLA (a confirmar)** — al reabrir `/eventos/nuevo/checkin` tras el envío vuelve a mostrar el formulario completo, no "Sin check-ins pendientes". No reenvié |
| 5 | Postular de punta a punta | **PASA** — `/adoptar/DIM-S013-PLRM/postular` (Bichita · Patitas): 5 pasos + resumen + consentimiento → "Ya postulaste para Bichita — El refugio recibió tu postulación" (18:15:44Z) |
| 6 | `/mis-mascotas/postulaciones` | **PASA** — "Bichita · EN REVISIÓN · Refugio Patitas del Norte · Enviada el 18 de ago · Retirar postulación" |

Hallazgos:
- **OBSERVACIÓN:** el texto de "¿Cómo está?" del check-in ("RD0818 check-in post-adopcion…") no aparece ni en la card de la libreta ni en `/mis-mascotas/DIM-MORA-DEMO/eventos/9b38def2-…` ("Detalle · Sin campos adicionales"). **HIPÓTESIS:** el detalle no renderiza el campo de nota del check-in, o la nota no se persistió.
- **OBSERVACIÓN:** el recordatorio abierto no parece consumirse (formulario disponible de nuevo). **HIPÓTESIS:** el envío no marca `completedAt`, o la página no exige recordatorio abierto, o el seed dejó más de uno.
- **OBSERVACIÓN:** el botón "Postularme a Bichita" en la ficha no navegó al click (por ref); la ruta `/postular` directa funcionó. **HIPÓTESIS:** click perdido por hidratación (trampa conocida) — no lo cuento como bug.
- **OBSERVACIÓN:** el postulante consiente compartir "historial de adopciones, fosters y mascotas"; en T6 el detalle de la postulación (org) no muestra ese historial. **HIPÓTESIS:** consentimiento registrado pero vista no implementada.
- Notificaciones de adoptante@: vacías (sin aviso del recordatorio de check-in).

## TOUR 4 — Veterinaria de planta `lilian@dim.test` (18:17Z–18:30Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| 1 | `/org` redirige directo (sin picker) | **PASA** — `/org/DIM-9XKC-ZDQK` "Clínica Veterinaria Recoleta · Actuando como Veterinario/a — Vet de planta · MATRÍCULA VERIFICADA · V-99001-CABA" |
| 2 | Permisos: menú con Atender/Ingresos y SIN Agenda/Mordeduras/Miembros/Configuración/Servicios | **PASA con notas** — rail: Panel · Atender · Mascotas · Casos · Maltrato. No hay Agenda/Mordeduras/Miembros/Configuración/Servicios ✓; "Ingresos" no es ítem del rail (la card "Registrar ingreso" es la tarea principal del panel); Casos/Maltrato sí aparecen. Panel "Tus permisos": pet.read_held / intake.create / event.write **CONCEDIDO**; member.invite / capability.grant / service_offering.create / appointment.manage / bite.report **PENDIENTE** (en T6 se confirmó que son 5 solicitudes pendientes de Lilian del 09/08/2026 en `/admin/permisos` de Recoleta — el rol base es exactamente el de fábrica) |
| 3 | Atender: vacuna Y consulta clínica firmadas con matrícula, distinguibles del dueño | **PASA con hallazgos** — `/atender/DIM-7WEY-B533` "Firmás como matrícula V-99001-CABA · verificado por profesional". Tipos: Vacuna, Desparasitación, Cirugía/estudio (= Información clínica), Medicación, Microchip, Nota clínica (no existe "Consulta clínica" nominal). Vacuna **Antirrábica** → `?firmado=1` "Evento clínico firmado" (18:25:18Z); Información clínica "RD0818 Consulta clinica general" → firmado (18:26:56Z). Verificación cruzada: `/p/DIM-7WEY-B533` pasa de "DECLARADA" a **"ANTIRRÁBICA VIGENTE · FIRMADA" + "VACUNACIÓN: Verificado por veterinario matriculado"**; en la libreta compartida la info clínica dice "Verificado por veterinario matriculado" vs peso/antiparasitario "Reportado por el dueño" |
| 4 | Guards a mano: `/agenda` 404 y `/mordedura/nuevo` "Sin acceso" | **PASA** — `/agenda`: "Cargando…" → "No encontramos esta página"; `/mordedura/nuevo`: "No tenés permiso para esta acción… Podés pedir el permiso «Reportar mordeduras»… Ver mis permisos". Extra: `/configuracion` → redirige al panel; `/servicios/nuevo` → "necesitás el permiso service_offering.create"; `/miembros/invitar` → redirige a `/miembros` |
| 5 | `/org/[t]/mascotas` SHOW-ONLY | **VACÍO** — "Todavía no hay animales registrados a nombre de la organización" (la clínica no tiene custodia). No generé ingreso acá (SHOW-ONLY) → sin dato propio |
| 6 | `/cuenta/renunciar` STOP | **PASA** — abre "Renunciar a rol veterinario/a · Hola, Dra. Lilian Marrone…" con consecuencias, motivo opcional, checkbox "Entiendo y confirmo…", botón Renunciar (deshabilitado hasta tildar) / Cancelar. **No ejecutado** |

Hallazgos:
- **OBSERVACIÓN (bloqueante para ese ítem):** `/org/DIM-9XKC-ZDQK/atender/DIM-7WEY-B533?evento=vacuna`, 18:21–18:24Z: al elegir "Séxtuple (DHPPi-L)" (del autocompletado por ref, por teclado, o desde el panel "'Séxtuple (DHPPi-L)' no se reconoce con certeza. Elegí una opción: Séxtuple (DHPPi-L) / Quíntuple (DHPPi) / No está en el catálogo — continuar igual"), "Registrar vacuna" devuelve siempre "Confirmá la vacuna en el listado de abajo antes de continuar."; elegir la opción cierra el panel y el siguiente submit lo reabre (3 intentos). Con "Antirrábica" funcionó al primer intento. **HIPÓTESIS:** el matcher fuzzy no fija el id canónico cuando el label tiene acento/paréntesis y la confirmación del panel no persiste en el estado del formulario.
- **OBSERVACIÓN:** el formulario de vacuna dentro de Atender muestra el aviso del dueño ("Queda como dato declarado… un veterinario matriculado tiene que firmarla") debajo del encabezado "Firmás como matrícula… verificado por profesional". **HIPÓTESIS:** componente de formulario reutilizado sin contexto de rol.
- **OBSERVACIÓN:** en `/libreta/compartir/LBR-ZG8H-PUCE`, tabla "Registro de vacunación": la Antirrábica firmada por la vet muestra PROFESIONAL "—" y la declarada por el dueño "RD0818 Vet declarado". **HIPÓTESIS:** la columna lee el texto libre "aplicada por" y no la identidad/matrícula del firmante; el estado "firmado" sí llega a la credencial pública.
- **OBSERVACIÓN:** `/org/[t]/miembros` y `/org/[t]/servicios` abren para `vet_individual` (lectura: lista de miembros con "Salir de la organización"; lista de servicios "APROBADO") aunque el rail los oculta; la escritura está bloqueada. **HIPÓTESIS:** lectura permitida por diseño para cualquier miembro; anotar como asimetría UI/servidor de lectura, no como bypass.
- **OBSERVACIÓN:** la etiqueta "PENDIENTE" en "Tus permisos" no dice si es "solicitud en curso" o "no concedido"; se entiende recién en la pantalla admin. **HIPÓTESIS:** copy ambiguo.

## TOUR 5 — Voluntaria / transitante `noeli@dim.test` (18:32Z–18:38Z, + coda 19:11Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| 1 | `/cuenta/transitos/propuestas` (Activas / pasadas) | **PASA** — "Activas · 1 pendiente: Refugio Patitas del Norte → Coco · Gato · Expira 20/8/2026"; Historial: Toby EXPIRADA |
| 2 | Detalle de la pendiente, STOP en Aceptar/Rechazar | **PASA** — `FP-9JPE-8PZD`: "REFUGIO PATITAS DEL NORTE TE PROPONE CUIDAR A Coco · Gato · Común europeo · Macho · PROPUESTO POR Alejo Caride · DURACIÓN Sin definir · EXPIRA 20/8 · NOTAS 'CW0813 A6 - propuesta de transito de prueba'". Ramas: **Aceptar propuesta** (asumir el cuidado; según `/activos` "tenés los mismos permisos sobre la libreta… que un dueño mientras dure el tránsito") y **Rechazar** (queda en historial como no concretada). Info para decidir: especie/raza/sexo, quién propone, duración, vencimiento, notas — sin foto ni estado sanitario. **No ejecutadas** |
| 3 | Si vacío: `/cuenta/ofrecerme-como-transito` | **PASA (ya inscripta)** — "Estás inscripto · 1 slot(s) disponible(s)" (Palermo, CABA; wizard 3 pasos: disponibilidad / especies / hogar+notas). Actualicé la nota a "RD0818 …" → persiste tras Guardar (18:35:27Z) **sin mensaje de confirmación** |
| 4 | `/cuenta/transitos/activos` y `/historial` | **PASA** — "No tenés tránsitos activos"; historial: Negro (8/7→8/7) finalizado; Toby EXPIRADA |
| 5 | Ficha de Bruno: cómo se manifiesta la disputa | **PASA** — `/mis-mascotas/DIM-BRUNO-DEMO` → "AVISOS · Casos abiertos: **CAS-SW47-MFMM** · Disputa de custodia · Abierto" → `/casos/CAS-SW47-MFMM` (Abierto 14/8 18:23, partes: Abrió Graciela Saavedra, jurisdicción Palermo, normativa CCyC, línea de tiempo "iniciada 11/8 09:00"). Referencia cruzada T7: `/gob/casos?expediente=disputas` la lista como **DIS-PHZ9-SYC6** |
| 6 | `/notificaciones` | **PASA** — Todas 31 · Pérdidas 9 · Custodia 1 · Salud 4 · Adopciones 2; la propuesta de Coco (5 días) está 2ª, justo debajo del grupo URGENTE de vacunas vencidas |

Hallazgos:
- **OBSERVACIÓN:** `/casos/CAS-SW47-MFMM` (18:37Z, noeli@) muestra "Proceeding judicial específico · Detalle en `external_proceeding_reference` del dispute. Cada caso tiene su propia carátula y juzgado". **HIPÓTESIS:** descripción interna del catálogo de normativa renderizada tal cual al usuario.
- **OBSERVACIÓN:** el caso dice "Abierto el 14/8 18:23" y su línea de tiempo "Disputa de custodia iniciada 11/8 09:00". **HIPÓTESIS:** seed con `occurred_at` retroactivo.
- Cosmético: etiqueta "VACUNA PRÓXIMA A VENCER" en "CIU-Matusalén… vencida hace 117 días".
- Nota: `noeli@` ve un ítem "Portales" en el header (tiene membership de tránsito en Patitas).

## TOUR 6 — Org admin multi-org `alejo@dim.test` (18:39Z–19:10Z) + coda `noeli@` (19:11Z–19:13Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| 1 | `/org` picker con 4 orgs (sin auto-redirect) | **PASA** — "Pertenecés a 4 organizaciones": Clínica Veterinaria Recoleta, Refugio Patitas del Norte, Red de Rescate Puerto Madero, Mascotas BA Centro (autoridad sanitaria) — todas "admin". Nota: el chip "ÚLTIMA USADA" y el orden cambiaron entre dos cargas sin elegir org |
| 2 | Ingreso (wizard 4 pasos, raza del catálogo) → "Mascota ingresada" + token | **PASA** — RD0818-Manchas (Perro · Hembra · Beagle del select · Rescate · Custodia temporal · Palermo) → "Mascota ingresada: RD0818-Manchas · **DIM-XS45-FSAM** · COMPROBANTE OFICIAL E INMUTABLE" (18:41:33Z) + Asignar tránsito / Guardar y cargar otro / Publicar adopción / Ver ficha |
| 3 | `/censo`, `/transitos`, `/voluntarios`, `/voluntarios/propuestas` SHOW-ONLY | **PASA** — censo Perros 5 · Gatos 1 · Otras 1 · TOTAL 7 (sin capacidad declarada); tránsitos "Ninguna mascota tiene tránsito activo"; pool: "Noelí Assandri · 1 slot · 0 aceptadas · Palermo · match 100/100"; propuestas: Noelí→Coco Pendiente [Cancelar], Graciela→TN0813-Rocco Aceptada 12 sem, Noelí→Toby Expirada |
| 4 | Equipo: `/miembros`, `/miembros/invitar` STOP, `/admin/permisos` | **PASA** — miembros (3): Graciela y Noelí "Voluntaria de tránsito · TRÁNSITO · Gestionado vía tránsito", Alejo Coordinador general ADMINISTRADOR; invitaciones pendientes 0. Invitar: email + rol (Administrador/Coordinador/Miembro/Voluntario/Veterinario) + checkbox "Puede registrar eventos clínicos" + "Crear invitación" (link vence en 14 días) — completado, **no enviado**. Permisos: matriz de 16 capacidades, Alejo "por rol", tránsitos "+"; **en Recoleta**: "Pendientes (5)" = las 5 solicitudes de la Dra. Lilian Marrone (09/08/2026) con Aprobar/Denegar → explica el rail de T4 |
| 5 | `/mensajes`, `/cobertura`, `/configuracion` SHOW-ONLY | **PASA** — mensajes vacío ("responder es por fuera de miMAR"); cobertura: CABA/Palermo (principal) + CABA/Recoleta; configuración: perfil público + toggle "refugio de origen en credencial" + capacidad |
| 6 | Publicar adopción del ingreso propio → visible en `/adoptar` | **PASA con nota** — bloqueo inicial "no está marcada como apta… Marcala apta primero en la pestaña de Elegibilidad" → `?sheet=elegibilidad` (Apta) → historia/atributos → "Guardar y continuar" → "Publicar adopción" → "Publicada y visible en /adoptar" (18:48:47Z; Pausar/Despublicar). fetch anónimo `/adoptar` incluye DIM-XS45-FSAM. Nota: un 1er click a "Publicar adopción" (estado Paso 1 tras recarga) no hizo nada; funcionó tras "Guardar y continuar" |
| 7 | SHOW-ONLY: adoption/foster/foster-fin/transfer/microchip/devolver/no-aptas/transferencias-nueva/importar | **PASA** — todos renderizan con guards coherentes (ver notas); "Finalizar adopción" exige verificar cuenta miMAR del adoptante por DNI; `/transfer` lista 7 orgs verificadas (incluida "Refugio Pendiente Verificación"); `/foster-fin` "no tiene un tránsito activo"; `/devolver-al-dueno` "debe estar perdida"; `/intake/importar` (plantilla CSV, máx 200 filas, vista previa) — **sin subir archivo**. Sin rama "revertir adopción" (la mascota no está adoptada) |
| 8 | Hub `/transferencias` y `/recibidas` | **PASA** — Salientes: "Negro · CAS-FABE-AB8S · ACEPTADA · 8/7"; Entrantes: "Toby · De Refugio Test · EXPIRADA". Sin pendientes → sin Cancelar que describir |
| 9 | `/adopciones` con la postulación RD del T3; STOP en aprobar/rechazar | **PASA** — "Adriana Sosa → Bichita · HOY"; detalle con "Por qué: RD0818 Prueba QA…", botones Aprobar postulación / Solicitar más información / No avanzar — **no ejecutados** |
| 10 | `/casos`, `/maltrato/recibidos`; `/maltrato/nuevo` additivo | **PASA** — casos 13 (con filtros); recibidos vacío; reporte profesional creado **DEN-8RT4-PH4Z** (Acumulación · CRÍTICA auto-elevada · evidencia hachi.jpg) 18:57Z — ver hallazgo UX |
| 11 | Propuesta de tránsito real a Noelí (desde Voluntarios) | **PASA** — "Propuesta enviada (**FP-TAH9-UXVN**)"; en Propuestas "Noelí Assandri → RD0818-Manchas · Pendiente · 4 sem." (18:59:15Z) |
| 12 | Cambio a Recoleta: rail clínico; agenda → attended del turno RD; mordedura; servicio + regla | **PASA / PARCIAL** — rail: Panel · Agenda · Atender · Mascotas · Casos · Maltrato · Mordeduras · Miembros · Mensajes · Permisos (5); sin Ingresos/Custodia/Postulaciones ✓. Agenda 19/8: turnos RD (cancelado + confirmado) → `/agenda/turnos/APT-PM4R-PEC4` "Registrar asistencia" (vacuna*, marca, lote, administrado por, próxima dosis) + "No vino" / "Cancelar turno" (descritas) → **ASISTIDO** (19:02:36Z); la vacuna de la asistencia aparece en la libreta compartida ("Antirrábica · 18 ago · SIN DATO · Dra. Lilian Marrone (RD0818)"). Mordedura: wizard 4 pasos → "Incidente registrado · observación 10 días · Próxima revisión 28/8 · **CAS-CWSP-HD24**" (19:06:15Z), visible luego en `/gob/observaciones` y `/admin/observaciones` ✓. Servicio: "RD0818 Consulta general QA" 20 min · 2 lugares · gratuito → **OFR-APJ6-GXY5 · PENDIENTE** (19:08:39Z); **la regla de agenda no es ejecutable** hasta que gobierno apruebe ("PENDIENTE DE APROBACIÓN") → checkpoint de coherencia de slots NO EJECUTADO (bloqueado por diseño) |
| 13 | `/cuenta/memberships`: 3 Renunciar deshabilitados con tooltip, 1 habilitado; STOP | **PASA** — deshabilitado en Patitas/Recoleta/Puerto Madero con "Sos el único administrador. Asigná otro administrador antes de salir."; habilitado en Mascotas BA Centro. **No renuncié** |
| Coda | noeli@: `/notificaciones` A6 arriba; detalle de la propuesta RD, STOP | **PASA** — Todas 32; el aviso "Refugio Patitas del Norte te propuso un tránsito · hace 12 min · Mascota: RD0818-Manchas" está **2º**, sólo debajo del grupo URGENTE de vacunas vencidas y encima de la propuesta vieja de Coco (5 días) y de la observación antirrábica; `/cuenta/transitos/propuestas` "Activas · 2 pendientes"; detalle **FP-TAH9-UXVN** con Aceptar propuesta / Rechazar — **no ejecutados**; expira 25/8 |

Hallazgos:
- **OBSERVACIÓN:** `/org/DIM-389S-JFKJ/maltrato/nuevo` (18:55Z): con "DESCRIPCIÓN DEL ANIMAL *" vacío, "Enviar denuncia" no produce ningún feedback visible (sólo `:invalid` en el DOM; la burbuja nativa no persiste ni scrollea al campo). Tras completarlo, el envío redirige a la pestaña "Recibidos" (vacía) sin toast ni código; el reporte está en "Emitidos" como DEN-8RT4-PH4Z. **HIPÓTESIS:** validación nativa sin manejo propio + redirect a la pestaña equivocada.
- **OBSERVACIÓN:** el botón "Publicar adopción" aparece habilitado en Paso 1 pero no actúa hasta pasar por "Guardar y continuar" en la sesión. **HIPÓTESIS:** handler ligado al estado del wizard, o click perdido por hidratación.
- **OBSERVACIÓN:** el dialog de Elegibilidad no se cierra solo tras "Confirmar" (queda mostrando "Estado actual: Apta"). Cosmético.
- **OBSERVACIÓN:** `/org/DIM-389S-JFKJ/casos` lista "CAS-N8SW-4SAR · Publicación en adopción · ABIERTO · Pampa · 1/8 · VENCIÓ HACE 3 DÍAS", mientras la ficha admin de Pampa (DIM-PAMP-0001) dice "Casos abiertos (0)". **HIPÓTESIS:** es otra mascota llamada Pampa en custodia de Patitas (la lista no muestra token) o el conteo admin filtra por tipo.
- **OBSERVACIÓN:** la asistencia se pudo marcar el 18/8 para un turno del 19/8 08:00 sin advertencia y el evento se fecha hoy. **HIPÓTESIS:** no hay guard temporal en "Marcar asistencia".
- Cosméticos: "Volver al panel del refugio" en la clínica; el chip "ÚLTIMA USADA" del picker cambia sin elegir; el postulante consintió compartir historial y el detalle org no lo muestra.

## TOUR 7 — Gobierno CABA `lucas@dim.test` (19:15Z–19:32Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| 1 | `/gob` chip de alcance + cola operativa | **PASA** — "GOB · CABA · Lucas Etcheverry"; alertas priorizadas; cola: aprobaciones 2 · habilitación orgs 0 · denuncias 88 (79 vencidas) · casos 73 (29 vencidos) · perdidas 8 (= `/perdidas` CABA) |
| 2 | Panorama `preset=sintomas&period=30d` | **PASA** — "CENTRO DE SITUACIÓN · CABA" al 1er intento (Señales 0, Mordeduras/10k 0,1, Denuncias 26 / 88 activas). Scrub `asOf` no probado |
| 3 | Vigilancia / brotes / zoonosis / investigaciones | **PASA** (SHOW-ONLY; `/zoonosis` redirige a `/vigilancia`; investigaciones con aviso honesto "Notificación externa no integrada"). Investigación nueva no creada |
| 4 | Operativos `?vista=campanas` (¿esterilización activa en Palermo?) y `?vista=alcance` | **PASA** — 15 servicios; en Palermo sólo "Vacunación antirrábica — Cursor Staging" → no hay campaña de esterilización activa en Palermo (el hueco del guion existe). Alcance comunitario con pipelines auditados |
| 5 | `/gob/acciones` | **PASA** — "100 obligaciones más urgentes de 162 · 1 observación · 88 denuncias · 73 casos" |
| 6 | Denuncias `?etapa=moderacion` / `?etapa=triage` SHOW-ONLY | **PASA** — Moderación 22 (heurísticas), Triage 88 (Todas 197, 50 por página + "Ver más"); DEN-8RT4-PH4Z (org) en triage sin pasar por moderación ✓; DEN-DCED-ENK9 (La Plata) no aparece ✓ |
| 7 | Tres derivaciones de la denuncia RD | **PASA** — `/gob/maltrato/DEN-7BMJ-AQZC`: (a) "Derivar a org" → select Patitas / Puerto Madero / Refugio Pendiente Verificación (no derivé); (b) "Iniciar decomiso →" `/gob/decomisos/nuevo?welfareReportId=…` pre-cargado con "Denuncia vinculada DEN-7BMJ-AQZC" (no creado); (c) "Generar PDF MPF — Unidad Fiscal de Maltrato Animal competente en CABA" (no generado). Además evidencia (1) hachi.jpg, ubicación "USO OFICIAL", acciones Marcar revisada/Iniciar seguimiento/Cerrar/Sin sustento/Duplicada |
| 8 | `/gob/cola` detalle, STOP | **PASA** — 2 pendientes (matrículas: Dra. Carla Pérez APR-MRRM-K6ES; Noelí Assandri APR-HY5Y-RGNZ); detalle con "consulta manual… autodeclarado", Aprobar/Rechazar/Pedir más información — no ejecutados. Nota: la aprobación de servicios vive en `/gob/directorio?registro=servicios` |
| 9 | `/gob/casos` y `?expediente=disputas` (Bruno), STOP en escalar | **PASA** — "1 caso · DIS-PHZ9-SYC6 · Bruno · Palermo"; detalle con partes, "Resolver disputa" (4 resoluciones + resumen ≥100) y "Escalar a vía judicial" — no ejecutados |
| 10 | `/gob/observaciones` existe y tiene la mordedura RD | **PASA** — "RD0818-Firulais · Recoleta · EN CURSO · cierre 28/8 · Cerrar profesionalmente →" |
| 11 | `/gob/decomisos`, `/gob/perdidas` | **FALLA / PASA** — `/gob/decomisos`: "Tu usuario no está asociado a ninguna autoridad sanitaria. Contactá al administrador."; `/gob/perdidas` OK (8 activas, reunificación 60%) |
| 12 | `/gob/programa` (+ analítica) consistente con detalle | **PASA** — 1.188 · esterilización 37,3% · microchip 35,2% · antirrábica 58,4% · 74 muertes · 2 aprobaciones · 1 disputa: mismos valores en Briefing/Padrón/Mortalidad/Casos. Supervisión de PII lista mis propias consultas |
| 13 | Padrón/censo/mortalidad/adopciones sin otras provincias | **PASA** — regex sobre el texto de cada pantalla: ninguna mención a La Plata/Quilmes/Morón/Tigre ni otras provincias; distribución por provincia = sólo CABA |
| 14 | Omnibox `DIM-BRUNO-DEMO` → `/gob/mascotas/[token]` | **PASA** — "Bruno · Perro · DIM-BRUNO-DEMO" → ficha con titular Noelí Assandri y caso CAS-SW47-MFMM |
| 15 | `/gob/reglas` | **PASA** (solo lectura, CABA: PPP 16 razas, observación 10 días, canal "QR imprimible") |
| 16 | `/gob/directorio` (+credenciales, +servicios) | **PASA** — 8 orgs; RUPGA vacío explicado; servicios: "1 pendiente: RD0818 Consulta general QA · OFR-APJ6-GXY5" (no aprobado) |
| 17 | `/gob/historial`, `/gob/outbox`, `/gob/suscripciones` | **PASA** — outbox "Sin envíos registrados"; suscripciones "las administra un admin" |

Hallazgos:
- **OBSERVACIÓN:** `/gob/decomisos` (19:27Z, lucas@; ídem gov-pba@ 19:38Z) responde "Tu usuario no está asociado a ninguna autoridad sanitaria. Contactá al administrador.", mientras `/gob/decomisos/nuevo` abre y "Decomisos" está en el rail. **HIPÓTESIS:** el listado exige membership en una org de tipo "autoridad sanitaria" en lugar del alcance govt.
- **OBSERVACIÓN:** `/gob/operativos?vista=campanas` incluye mi servicio PENDIENTE (OFR-APJ6-GXY5) en "Performance por servicio". **HIPÓTESIS:** la lista no filtra por estado de aprobación.
- **OBSERVACIÓN:** DEN-7BMJ-AQZC no figura en las 22 de moderación ni en las primeras 50 de triage aunque está ABIERTA/Sin asignar (accesible por URL). **HIPÓTESIS:** paginación por urgencia (media/hoy queda al final de 197).
- **OBSERVACIÓN:** `/gob/outbox` vacío tras DEN-8RT4-PH4Z (crítica) y CAS-CWSP-HD24 de esta corrida. **HIPÓTESIS:** los avisos son in-app; la outbox sólo registra destinos externos no configurados en staging.
- Números que no creí: "faltan ~532 chips" vs "~220.967 mascotas sin chip" en la misma pantalla de Programa (denominadores distintos, explicado en el Briefing).
- Cosméticos: "Buscá entre las orgs en tus 1 localidad" (alcance provincia); email crudo como "Dueño/a" en observaciones.

## TOUR 8 — Gobierno PBA `gov-pba@dim.test` (19:33Z–19:39Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| — | Cuenta existe y loguea; alcance 4 partidos | **PASA** — "GOB · 4 LOCALIDADES · BUENOS AIRES" · Valeria Ocampo · localidades La Plata / Morón / Quilmes / Tigre |
| Ad.1 | Denuncia RD de La Plata visible; derivaciones desde PBA; la de Palermo NO | **PASA** — triage "Todas" (20 códigos, todos PBA) incluye DEN-DCED-ENK9; detalle con las 3 salidas ("Derivar a org" ofrece sólo Refugio Test; decomiso pre-vinculado con destino sólo Refugio Test; PDF MPF "competente en Buenos Aires") — no ejecutadas. `/gob/maltrato/DEN-7BMJ-AQZC` → "No encontramos esta página" |
| Ad.2 | Bruno NO aparece en disputas | **PASA** — "2 casos: DIS-PANO-0002 Toto · Quilmes; DIS-PANO-0004 Zeus · Tigre". `/gob/mascotas/DIM-BRUNO-DEMO` y `/DIM-PAMP-0001` → 404 |
| Eje | Subsunción en Panorama / Padrón / Casos / Cola / Denuncias / Programa / Observaciones / Directorio | **PASA** — Panorama "BUENOS AIRES · 4 LOCALIDADES"; padrón 4.064; programa 40,3% / 44,1%; cola 0; observaciones vacías (RD0818-Firulais no aparece); directorio 2 orgs de La Plata; servicios pendientes 0 (OFR-APJ6-GXY5 no se filtra). Ninguna fuga de CABA detectada. Vacío-pero-consistente donde corresponde |
| — | `/gob/decomisos` | **FALLA (mismo hallazgo que T7)** — "no está asociado a ninguna autoridad sanitaria" |

Hallazgo menor: Briefing "HABILITACIÓN DE ORGANIZACIONES 0" mientras el Directorio muestra "Refugio Panorama La Plata (Seed) · PENDIENTE · Proponer verificación". **HIPÓTESIS:** la cola cuenta solicitudes formales, no orgs sin verificar.

## TOUR 9 — Admin `admin@dim.test` (19:41Z–19:56Z)

| # | Paso / checkpoint | Veredicto |
|---|---|---|
| 1 | `/admin` briefing | **PASA** — colas compartidas con Gobierno; banner "2 procesos automáticos no están corriendo"; aprobaciones 2, moderación 34, alertas 4 |
| 2 | Panorama `bienestar&90d` nacional | **PASA** — "CENTRO DE SITUACIÓN NACIONAL" al 1er intento (denuncias 1.340 / 1.893 activas; mordeduras 12m 2.507; decomisos 197) |
| 3 | Programa, padrón, censo, adopciones, población | **PASA con nota** — `/admin/programa` agotó el tiempo 2 veces (Código 2d59a8bc) y cargó al 3º (35.277 · 41,9% · 38,6% · 24 provincias bajo meta); padrón/censo/adopciones OK; `/admin/poblacion` redirige a `/admin/padron?vista=poblacion` |
| 4 | Alertas: cobertura de esterilización 38/70 vencida disparada; Reconocer/seguimiento OK; STOP en Resolver | **PASA** — encontrada tal cual (CABA · 38 · meta 70 · 42 días · VENCIDO · DISPARADA); "Reconocer" → RECONOCIDA; "Registrar seguimiento" → nota RD0818 guardada (sin confirmación visible); **NO resuelta** |
| 5 | Casos / moderación / observaciones | **PASA** — casos "50 de 842"; `/admin/moderacion` → `/gob/denuncias?etapa=moderacion` (chrome Gobierno, 34 / 1896 país); `/admin/observaciones` incluye RD0818-Firulais (simetría con /gob) |
| 6 | `/admin/sistema` renderiza | **PASA** (sin crash) |
| 7 | `/admin/sistema/crons` lista con estado | **PASA con nota** — **23 crons** (no 21): 22 saludables · 1 con problemas (`cron_health` FALLÓ, 18 ago 01:09) |
| 8 | `/admin/outbox` + detalle | **PASA** — "REGISTRADA Y AUDITADA — TRANSMISIÓN A LA AUTORIDAD PENDIENTE DE ENDPOINT RECEPTOR" (Autoridad ENO · Salta · payload seed) |
| 9 | `/admin/auditoria` (+actividad) | **PASA** |
| 10 | Directorio / cuentas SHOW-ONLY | **PASA** — 14 orgs; servicios pendientes = OFR-APJ6-GXY5; cuentas gobierno (Lucas 1 localidad, govt-local 2, Responsable CABA 1, Valeria 4) y admins (system:backfill-0039, Administración miMAR). Nada creado |
| 11 | `/admin/reglas` → drill CABA | **PASA** — 5 jurisdicciones (BA provincia observación 14 d; La Plata 21 d; CABA PPP 16 razas…) — nada editado |
| 12 | `/admin/chapas` | **PASA** — renderiza y explica ("CSV… se genera una única vez"); formulario habilitado (cantidad 1–500, identificador). **No emitido** |
| 13 | `/admin/libro` fail-loud + `?tipo=event_amended` | **PASA** — footer "Calculado al 18/08/2026 16:52"; filas de esta corrida (Observación antirrábica iniciada 16:06 Recoleta, Vacuna administrada 16:02, Propuesta de tránsito 15:59…); enmiendas: 4 "Corrección registrada" |
| 14 | Omnibox `DIM-PAMP-0001` | **PASA** — el panel de resultados avisa "**Las búsquedas quedan registradas.**" → `/admin/mascotas/DIM-PAMP-0001` |
| 15 | `/admin/acerca/integracion-miarg` disclaimer no ocultable | **PASA** — banner "Integración en desarrollo — vista ilustrativa" sin botón de cierre + "maqueta ilustrativa… OIDC en desarrollo" |
| Opc. | `/admin/inteligencia` | **PARCIAL** — tiles "Sin datos por demora — reintentá · Código c3072b88"; "Cambios de reglas 11 · Registros fantasma 0" sí cargaron |

Hallazgos:
- **OBSERVACIÓN:** `/admin/programa` 19:42Z y 19:43Z: "Los datos están tardando más de lo normal — La consulta superó el tiempo de espera · Código 2d59a8bc"; 19:54Z cargó. `/admin/inteligencia` parcial (c3072b88). **HIPÓTESIS:** caché fría / free-tier (trampa conocida), pero dos fallos seguidos en la pantalla que un funcionario pediría primero.
- **OBSERVACIÓN:** el banner de sistema dice "2 procesos automáticos no están corriendo" y la tabla de crons marca 1 con problemas. **HIPÓTESIS:** el banner cuenta con otro criterio (p.ej. `refresh_cube` con último run 00:56 vs 01:09) o quedó desfasado.
- **OBSERVACIÓN:** el footer del libro dijo "último evento sin dato" en la 1ª carga y "18/08/2026 16:06" en la 2ª. Cosmético.
- Cosméticos: actor "Refugio" en el libro para un evento cargado por la clínica; "1 servicio pendiente en tu cobertura" en vista universal.

---

## Cuatro preguntas de cierre

**1. ¿En qué momento no supiste si algo había pasado?**
- Check-in post-adopción (T3): el submit redirige al perfil sin ningún mensaje; sólo la libreta confirma que se creó el asiento — y el texto que escribí no aparece en ningún lado.
- Reporte profesional de maltrato (T6): el primer "Enviar denuncia" no hizo nada visible (campo obligatorio vacío sin mensaje persistente); el segundo aterrizó en una pestaña vacía sin código.
- Vacuna con foto del dueño (T2): no hay forma de ver el adjunto ni el detalle del asiento de vacuna.
- "Guardar preferencias" de la oferta de tránsito (T5), "Guardar nota" de seguimiento de alerta (T9) y "Marcar asistencia" (T6): guardan, pero sin confirmación explícita.
- "Publicar adopción" (T6): un click habilitado que no hizo nada hasta pasar por "Guardar y continuar".

**2. ¿Hiciste algo dos veces por no saber si salió?**
- Sí: la vacuna Séxtuple en Atender (T4) — 3 intentos, ninguno registró nada (comprobado en la libreta compartida: no hay Séxtuple); el flujo con Antirrábica salió a la primera. También dos clicks a "Publicar adopción" (T6) — sólo el segundo publicó (verificado en /adoptar anónimo, una sola publicación). Y dos submits del reporte de maltrato (T6) — un solo DEN-8RT4-PH4Z creado. Nada quedó duplicado.

**3. ¿Hubo algún número que no le creíste?**
- Programa CABA (T7): "faltan ~532 chips sobre el padrón registrado" y, en la tabla de al lado, "~220.967 mascotas sin chip" (impacto extrapolado a población estimada). Está explicado en el Briefing ("el padrón cubre ~0.1%…"), pero lado a lado desconcierta.
- Landing "AL DÍA" vs credencial pública "2 faltantes" (T1).
- Sistema: "2 procesos automáticos no están corriendo" vs 1 cron fallido en la tabla (T9).
- Briefing PBA "HABILITACIÓN DE ORGANIZACIONES 0" con una org PENDIENTE en el Directorio (T8).
- Los demás cruces (1.188 / 35,2% / 37,3% / 58,4% / 74 / 8 / 2 / 1 en CABA; 35.277 / 41,9% nacional; 4.064 en PBA) coincidieron entre pantallas.

**4. ¿Qué pareció abandonado, inalcanzable o contradictorio?**
- `/gob/decomisos` inalcanzable para gobierno ("no está asociado a ninguna autoridad sanitaria") con "Decomisos" en el rail y `/decomisos/nuevo` abierto.
- `/sugerencias` "en preparación" sin formulario (el brief lo daba por existente).
- Texto de desarrollo visible en `/casos/CAS-SW47-MFMM` ("Detalle en `external_proceeding_reference`…").
- Ficha pública de Negro con refugio responsable desactualizado tras una transferencia aceptada.
- `/cuenta/verificar-dni` y `/cuenta/casos` no existen como pantallas (redirigen).
- Regla de agenda de un servicio nuevo: inalcanzable hasta aprobación gubernamental (correcto, pero deja el checkpoint de coherencia de slots sin cubrir en una corrida).
- "Refugio Pendiente Verificación" tratado como verificado en 3 lugares.

---

## NO ejecutado (y por qué)

- **T1-P11** `/t/[serial]` con serial real: no hubo serial de lote a mano (sólo el inventado → 404 correcto).
- **T1-P12** `/casos/[publicCode]` con código de caso de bienestar: `CAS-PAVM-V72A` no es público (correcto); sí se ejecutó con el caso de perdida `CAS-DWUZ-ARX6`.
- **T1-P13** envío de `/sugerencias`: no existe formulario en este build.
- **T2-P9** describir acciones sobre una transferencia pendiente pre-sembrada: no había ninguna pendiente (sólo aceptadas).
- **T3-P4** "Sin check-ins pendientes": no se pudo observar (la pantalla vuelve a ofrecer el formulario); no reenvié.
- **T4-P3** "consulta clínica" con ese nombre: no existe el tipo; se usó "Información clínica" (Cirugía/estudio). Vacuna **Séxtuple**: no se pudo registrar (loop de confirmación).
- **T4-P5** abrir un paciente en `/org/[t]/mascotas` de la clínica: lista vacía; no generé ingreso ahí.
- **T5-P3** oferta nueva: la cuenta ya estaba inscripta (actualicé la nota).
- **T6-P7** rama "revertir adopción finalizada": no aplica a la mascota RD (no adoptada); no la busqué en otras.
- **T6-P8** rama "Cancelar" de una transferencia saliente pendiente: no había pendientes.
- **T6-P12** regla de agenda `/servicios/[token]/agenda` y coherencia de slots: bloqueado hasta aprobación gubernamental del servicio OFR-APJ6-GXY5 (queda pendiente en `/gob/directorio?registro=servicios`).
- **T7-P2** scrub por fecha `asOf` del Panorama: no probado.
- **T7-P3** investigación de brote nueva (`/investigaciones/nuevo`): opcional, no creada.
- **T7-P6/P8/P9** y **T8**: moderar/triagear, aprobar/rechazar, derivar, decomisar, PDF MPF, escalar disputa: STOP-BEFORE-SUBMIT respetado (descritos, no ejecutados).
- **T9-P4** "Resolver" alerta: STOP (queda RECONOCIDA con nota de seguimiento; el prep script deberá re-dispararla si la demo la necesita en DISPARADA).
- **T9-P12** emitir lote de chapas: STOP.
- **T9-P10** crear cuentas de gobierno/admin: STOP.
- **T9-P13** expandir una fila "Corregido por enmienda": no apareció ninguna en la primera página del libro.
- Modo cookie (sesiones pre-acuñadas): no disponible (sin JSON y `document.cookie` bloqueado); reemplazado por login único por cuenta + 2º login de `noeli@` para la coda.

## Anexo — línea de tiempo (UTC) y datos RD0818

17:27 build eb72f78 · 17:37 DEN-7BMJ-AQZC (Palermo) · 17:40 DEN-DCED-ENK9 (La Plata) · 17:46 login owner@ · 17:48 DIM-7WEY-B533 RD0818-Firulais · 17:52 vacuna declarada · 17:55 peso + antiparasitario · 17:57 APT-ZN7T-NQ39 · 18:00 cancelado / 18:00 APT-PM4R-PEC4 · 18:02–18:03 perdida→encontrada · 18:06 LBR-ZG8H-PUCE · 18:11 login adoptante@ · 18:12 check-in Mora · 18:15 postulación Bichita · 18:17 login lilian@ · 18:25 vacuna firmada (Antirrábica) · 18:26 info clínica firmada · 18:32 login noeli@ · 18:35 nota de oferta · 18:39 login alejo@ · 18:41 DIM-XS45-FSAM RD0818-Manchas · 18:46 elegibilidad Apta · 18:48 publicada · 18:57 DEN-8RT4-PH4Z · 18:59 FP-TAH9-UXVN · 19:02 APT-PM4R-PEC4 ASISTIDO · 19:06 CAS-CWSP-HD24 (mordedura → observación hasta 28/8) · 19:08 OFR-APJ6-GXY5 · 19:11 login noeli@ (coda) · 19:15 login lucas@ · 19:33 login gov-pba@ · 19:41 login admin@ · 19:45 alerta esterilización RECONOCIDA · 19:56 logout final, build eb72f78.
