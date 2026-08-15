# Prompt — recorridos de demo por rol (Cowork)

> **Cómo usar este archivo.** Copiá el bloque de abajo tal cual y reemplazá
> `{SHA}` por el commit vigente en staging. El SHA no está escrito acá a
> propósito, por la misma razón que en sus hermanos
> (`prompt-cowork-clickthrough-staging.md`,
> `prompt-cowork-clickthrough-verificacion-y-nuevo.md`): un documento con un
> commit hardcodeado miente al día siguiente.
>
> **Qué es esto y qué NO es.** Este brief no busca hallazgos nuevos — busca
> que NUEVE recorridos de demo (uno por rol) sobrevivan a repetirse "hasta el
> cansancio" sin degradar el dataset ni depender de que alguien los mire. Es
> el material que un funcionario, un veterinario o un refugio verían si les
> mostrás miMAR: por eso cada tour tiene una historia, no una lista de rutas.
> Las rutas salen del guion de demo validado
> (`docs/plans/2026-08-02-demo-speech-y-pasos.md` y
> `-guion-demo-ciclo-completo.md`), del shot list original
> (`docs/demo/walkthrough-script-2026-07-01.md`), de los 6 specs grabados
> (`e2e/demo/0{1..6}-*.spec.ts`) y de las 5 guías de onboarding
> (`docs/onboarding/`). Donde esas fuentes quedaron desactualizadas contra el
> nav actual (`components/layout/nav-presets.ts`), este brief sigue el nav
> actual — se aclara caso por caso.

---

## El bloque para pegar

Sos un agente de QA de navegador (Cowork) recorriendo miMAR en staging, **en
serie, un rol a la vez**. Tu trabajo no es encontrar bugs nuevos — es caminar
nueve historias completas, anotar qué se ve en cada paso, y marcar qué
sobrevive a repetirse.

**Entorno:** https://dim-staging.vercel.app
**Build a revisar:** `{SHA}`

### 1. Build check (antes de escribir una línea)

```
curl -s https://dim-staging.vercel.app/ | grep mimar-version
```

El meta tag `<meta name="mimar-version">` trae **7 caracteres**. Compará por
PREFIJO: si `{SHA}` es más largo, tiene que empezar igual. Si no coinciden,
PARÁ y avisá — staging redeploya solo con cada push, y un recorrido contra
otro build no sirve para nada. Volvé a leerlo al terminar cada tour (no sólo
al final de la corrida entera): si cambió a mitad de camino, decilo — parte
de lo que probaste era otro producto.

### 2. Run-prefix (para todo lo que crees)

Prefijá **todo dato que crees** con `RD<fecha>` — por ejemplo, corriendo hoy:
`RD0813`. Nombre de mascota, nota de evento, descripción de denuncia, texto
de propuesta de tránsito: todo lleva el prefijo al principio. Es append-only:
lo que crees queda, y el próximo agente (o vos mismo, mañana) tiene que poder
distinguir tus datos de los del dataset curado a simple vista.

### 3. Reglas de método (las mismas que el resto de la familia de briefs)

- **OBSERVACIÓN vs HIPÓTESIS.** No tenés el código: toda causa que propongas
  es conjetura y tiene que decirlo.
- **Cada guard, con el rol que la página espera.** Un 404 en una ruta de otro
  rol no es un hallazgo — es el sistema funcionando. "No encontré desde
  dónde se llega" sí lo es.
- **Stop-before-submit en toda acción destructiva o que mute la historia
  compartida**: renuncias, aprobaciones/rechazos, moderación, eliminaciones,
  transferencias o adopciones sobre mascotas que NO creaste vos. Mostrá el
  formulario, describí lo que haría, y NO lo confirmes. El detalle de qué
  tour se detiene dónde está en cada sección y se resume en "Repetibilidad"
  más abajo.
- **Pantalla vacía no es pantalla probada.** Si una lista sale sin datos,
  decilo y contá si intentaste generar el dato que faltaba.
- **Un número solo no es un hallazgo** hasta que decís contra qué lo
  comparaste.
- **Trampa de herramienta conocida (corrida CW0813, 2 fases):** algunos
  sheets/modales con backdrop-blur cuelgan la captura de pantalla por CDP
  mientras el modal está abierto — el DOM sí responde. Si una captura no
  vuelve, leé el DOM en vez de reintentar la foto, y anotalo como nota de
  automatización, no como bug de producto.

### 4. Login logistics — LEÉ ESTO ANTES DE TOCAR `/login`

**Modo primario — cookies de sesión pre-acuñadas (sin contraseñas, sin
operador).** El operador te entrega un JSON con una cookie de sesión por
cuenta, generada FUERA del producto con `scripts/qa-mint-sessions.ts` (login
normal contra Supabase con la misma librería que usa la app; no existe ningún
endpoint de bypass). Para cambiar de cuenta: (1) borrá las cookies `sb-*` del
dominio, (2) seteá la cookie de la cuenta nueva (nombre y valor exactos del
JSON; `path=/`, `secure`, `samesite=lax`), (3) recargá. La sesión trae
refresh token y la app la renueva sola durante toda la corrida. Si una cookie
deja de funcionar (el refresh rotó y el valor guardado quedó viejo), NO
insistas: pedile al operador re-acuñar — es un comando. Verificá la identidad
tras cada cambio (menú de cuenta) antes de operar, igual que siempre.

**Modo de respaldo — login manual del operador**, una cuenta a la vez, en
serie. Esto no es una preferencia de organización — es una restricción dura
del rate limiter:

- El límite es **5 logins por minuto Y 20 por hora, contado por EMAIL**
  (`src/modules/auth/application/login.ts`), verificado ANTES de tocar
  GoTrue — o sea que hasta un intento fallido cuenta.
- Hay un segundo límite por IP (10/min · 100/hora), pero **cambiar la IP
  aparente (`x-real-ip`) no esquiva el límite por email** — solo esquiva el
  de IP. El propio harness de e2e lo documenta así
  (`e2e/demo/_helpers.ts`, comentario sobre `uniqueIp()`): repartir una IP
  distinta por login "does exactly nothing" contra este límite, porque "the
  per-email budget is keyed on the EMAIL ADDRESS". Ninguna cabecera te salva
  de ese conteo.
- **Regla operativa: un solo login por cuenta por corrida.** Agotá el tour
  completo de esa cuenta antes de pedir la siguiente. Si perdés la sesión a
  mitad de tour (expiró, te desconectaste), NO reintentes el login vos
  mismo — avisale al operador y esperá. Un tour que se cae por sesión
  perdida se reporta como "no ejecutado", no como hallazgo.
- Nueve cuentas, todas con password `Test1234!`:

| # | Cuenta | Rol | Nota |
|---|---|---|---|
| 1 | (sin sesión) | Público | — |
| 2 | `owner@dim.test` | Dueño | bootstrap tier |
| 3 | `adoptante@dim.test` | Adoptante | ⚠️ **requiere seed batch 3** — puede no existir todavía |
| 4 | `lilian@dim.test` | Veterinaria de planta | Clínica Veterinaria Recoleta |
| 5 | `noeli@dim.test` | Voluntaria / transitante | cuenta ciudadana común |
| 6 | `alejo@dim.test` | Admin de organización (multi-org) | admin de 4 orgs, incl. Recoleta y Patitas del Norte |
| 7 | `lucas@dim.test` | Gobierno CABA | CABA entera (re-escopado 2026-08-14; antes 5 barrios) |
| 8 | `gov-pba@dim.test` | Gobierno PBA | ⚠️ **requiere seed batch 3** — La Plata, Quilmes, Morón |
| 9 | `admin@dim.test` | Admin | universal |

**Qué es esto.** Credencial sanitaria digital para animales de Argentina. La
mascota ES la credencial: cada animal tiene un token público
(`DIM-XXXX-XXXX`) que resuelve a una página verificable por QR que puede
abrir cualquier desconocido en la calle. Los eventos son append-only. UI en
español rioplatense.

---

## TOUR 1 — Público sin sesión

**Historia:** un desconocido en la calle escanea un QR, o un vecino explora
antes de tener cuenta — sin loguearse, sin instalar nada.

**Datos seed:** Pampa (`DIM-PAMP-0001`), la mascota insignia de la portada
(dueña `owner@dim.test`, foto real, vacuna antirrábica firmada por vet). El
catálogo de `/adoptar` y el directorio de `/refugios` traen tarjetas reales
del dataset — no hace falta un token fijo, click en la primera tarjeta real.

**Pasos:**

1. `/` — landing. **Checkpoint:** el hero muestra la credencial de Pampa con
   QR escaneable; el nombre de la portada, el QR y la credencial pública
   coinciden en el mismo animal.
2. `/p/DIM-PAMP-0001` — **Checkpoint (Tier 0):** foto, nombre, especie, raza,
   edad aproximada, sexo, un tilde de "vacunas al día" (sin detalle médico),
   si tiene microchip. **Ningún dato personal del dueño** aparece.
3. `/adoptar` — filtrá por especie, abrí una ficha real (link que empieza
   con `/adoptar/DIM`). **Checkpoint:** historia, estado de salud, refugio
   de origen, y un CTA que pide iniciar sesión para postular — no te deja
   postular sin cuenta.
4. `/perdidas` — **Checkpoint:** es un LISTADO con tarjetas y filtro por
   provincia, **no un mapa**. Si ves o esperás un mapa general, no es un
   hallazgo — está documentado como no-existente (ver "Fuera de alcance").
5. `/refugios` → abrí un refugio real. **Checkpoint:** perfil público con
   logo, catálogo de adopción de esa organización, servicios que ofrece.
6. `/denuncias` → `/denuncias/nueva` — wizard de 5 pasos completo:
   - Paso 1: tipo de situación (9 opciones reales, sin "mordedura" — es
     circuito clínico/organizacional, no denuncia pública).
   - Paso 2: gravedad.
   - Paso 3: descripción (mínimo 20 caracteres, empezá el texto con
     `RD<fecha>`) + **el pin en el mapa es obligatorio** ("Marcá el lugar
     exacto para continuar" — un domicilio tipeado no alcanza). **Clavá el
     pin en Palermo (CABA)**: esta denuncia es la que el Tour 7, paso
     "derivaciones", va a abrir desde el lado gobierno — si la pinchás en
     otra provincia, Lucas no la ve y esa cadena se corta.
   - Paso 4: quién es el animal (opcional).
   - Paso 5: enviar como anónima + adjuntar evidencia (hasta 5 archivos de
     25 MB) → enviar.
   **Checkpoint:** te da un código `DEN-XXXX-XXXX` — anotalo.
7. `/denuncias/buscar` con el código del paso 6. **Checkpoint:** el estado
   de la denuncia es consultable con el código, sin cuenta.
8. QR de mascota perdida: si `/perdidas` tiene alguna, abrí su `/p/[token]`
   y mirá el modo búsqueda (Tier 1). **STOP-BEFORE-SUBMIT** en "¿Encontraste
   a esta mascota?" y en reportar avistaje — completá el formulario, no lo
   envíes (ver Repetibilidad: cada envío real notifica a un dueño de
   verdad).
9. `/libreta/compartir/[shareToken]` — necesita un token real generado por
   un dueño (Tour 2 lo genera). Si no tenés uno a mano en esta corrida,
   marcalo como no ejecutado, no como hallazgo.
10. **Las tres públicas que un funcionario mira primero:**
    `/funcionalidades` (qué hace el producto), `/transparencia` (datos
    abiertos, Ley 27.275) y `/leyes` (marco normativo). **Checkpoint:**
    las tres cargan y su contenido no contradice lo que acabás de ver en
    los pasos anteriores (si `/funcionalidades` promete algo que el tour
    demostró que no existe, anotalo).
11. `/t/[serial]` — el resolver de la **chapa física grabada** (el QR de la
    chapa apunta acá, no a `/p/`). Sin un serial real a mano, entrá con uno
    inventado (`/t/ZZZZ9999`): **Checkpoint:** la pantalla degrada con
    gracia (mensaje claro, sin stack trace, sin 500). Si el operador te
    pasó un serial real de un lote emitido, seguilo y anotá a dónde lleva.
12. `/casos/[publicCode]` — la vista pública de un expediente. Necesita un
    código real (`CASE-`/`DEN-` según lo que hayas anotado en la corrida);
    con el código de tu denuncia del paso 6, `/denuncias/buscar` ya es el
    camino — si además conseguiste un código de caso de una corrida
    anterior, abrilo acá. Si no tenés ninguno, marcalo no ejecutado.
13. Estáticas: `/acerca`, `/ayuda`, `/accesibilidad`, `/privacidad`,
    `/terminos`, `/cookies`, `/sugerencias` (este último tiene formulario —
    podés enviarlo con prefijo `RD<fecha>`, es additivo y no tiene efecto
    sobre otros datos).
14. Pantallas de auth sin enviar: `/iniciar-sesion`, `/registro`,
    `/recuperar`.

**Trampas conocidas:**
- La denuncia anónima pública está limitada a **1 por minuto y 3 por hora
  por IP** (`welfare_anon`, `src/modules/welfare/actions.ts`). Si corrés
  este tour varias veces seguidas, el paso 6 te va a rechazar — no es un
  bug, es el límite documentado.
- `/ayuda` todavía puede mostrar el enlace viejo a `/login` en el texto
  visible aunque apunte a `/iniciar-sesion` — cosmético, ya reportado.

---

## TOUR 2 — Dueño `owner@dim.test`

**Historia:** el vecino con cuenta gestiona la salud de su mascota, reserva
un turno, hace seguimiento de una denuncia propia.

**Datos seed:** además de Pampa (que le pertenece), `owner@` trae mascotas
enriquecidas por `seed-owner-demo.ts` (una perdida, con vacunas, con turno,
con notificaciones, con una transferencia) — no asumas cuál es cuál, listá lo
que aparece en `/mis-mascotas` y elegí sobre eso.

**Pasos:**

1. `/inicio` — home. **Checkpoint:** saludo, "Asentar un hecho", carrusel de
   mascotas, vencimientos.
2. **Alta de mascota** (dato nuevo — prefijá el nombre `RD<fecha>-<nombre>`,
   ej. `RD0813-Firulais`): `/mis-mascotas` → `/mis-mascotas/nueva` → Paso 1
   (nombre, especie, sexo, provincia → localidad) → Continuar → Paso 2 (foto
   opcional) → Registrar mascota. **Checkpoint:** termina en la credencial
   con QR recién emitida.
3. `/mis-mascotas/[token]` — perfil de la mascota nueva. Probá
   `?tab=libreta&lente=todo` y el botón "Girar a libreta" (flip 3D) /
   "Girar a credencial".
4. **Vacuna con foto** (evento nuevo): desde el perfil, `?sheet=anotar` →
   "Registrar vacuna" → completá todos los campos, adjuntá una foto real
   (`docs/archive/Fotos/`), enviá. **Checkpoint:** vuelve al perfil, y la
   Libreta / `/historial` ya muestran la vacuna.
5. `/turnos/buscar` → elegí un servicio y buscá. **Preferí una oferta de
   "Clínica Veterinaria Recoleta"** si aparece (probá localidad Recoleta, o
   CABA): es la clínica de Lilian, y esta reserva es la que el Tour 4 va a
   ver en su agenda — si reservás en otra org, esa cadena no corta el tour
   pero el paso de asistencia del Tour 4 queda sin dato propio. Abrí la
   oferta → elegí un slot → `/reservar/[slotId]` → elegí la mascota RD de
   esta corrida → Confirmar reserva. **Checkpoint:** aparece en
   `/mis-turnos`.
6. **Ramas del turno (sobre TU reserva del paso 5, no sobre otra):**
   - Intentá reservar OTRO slot de la **misma oferta** con la **misma
     mascota** mientras la reserva sigue confirmada. **Checkpoint:** el
     sistema la rechaza con un mensaje en castellano (guard por
     mascota+oferta — es el fix A4/A3 de CW0813 funcionando, no un bug).
   - Abrí `/mis-turnos/[token]` → **Cancelar**. **Checkpoint:** el estado
     pasa a cancelado y el turno deja de contar contra el guard.
   - Volvé a reservar la misma oferta (cancelar→re-reservar tiene que
     estar permitido). **Checkpoint:** la segunda reserva entra — dejala
     confirmada: es el turno que el Tour 4 va a mirar (y marcar) desde el
     lado de la clínica.
7. **Dos eventos médicos más, sobre la mascota RD** (el registro sanitario
   es el core del producto y "vacuna" sola no lo demuestra): registrá un
   **peso** y un **antiparasitario** desde `?sheet=anotar` (notas prefijadas
   `RD<fecha>`). **Checkpoint:** los tres tipos de evento conviven en la
   Libreta con su forma propia — el peso como dato numérico, el
   antiparasitario con su fecha de próxima dosis si la cargaste. Los ~13
   formularios restantes del selector NO hace falta enviarlos: abrí el
   selector completo una vez y anotá qué opciones ves (eso ya detecta un
   formulario roto de entrada).
8. **Marcar perdida / desmarcar (sobre la mascota RD, no sobre la
   pre-sembrada):** `/mis-mascotas/[token]/perdida` → marcala perdida.
   **Checkpoint:** su `/p/[token]` público pasa a modo búsqueda (Tier 1 —
   podés verificarlo en una pestaña de incógnito) y aparece en `/perdidas`.
   Después **desmarcala** y verificá que el público vuelve a Tier 0. Las dos
   ramas son tuyas y reversibles — repetibles sin degradar nada.
9. `/transferencias` — el hub de transferencias entre dueños (Enviadas /
   Recibidas, estados pendiente/aceptada/rechazada/expirada/cancelada).
   SHOW-ONLY sobre la transferencia pre-sembrada del seed: abrí el detalle
   si hay una, describí las acciones que ofrece, no ejecutes ninguna.
10. `/mis-mascotas/postulaciones` — tus postulaciones de adopción (puede
    estar vacío para esta cuenta; el flujo de postular de punta a punta lo
    ejecuta el Tour 3, que es el rol natural).
11. `/denuncias/mias` — lista de denuncias propias (si hay alguna de una
    corrida anterior con tu cuenta) → abrí el detalle.
12. `/notificaciones` — campanita, pestañas por categoría.
13. `/cuenta` — perfil, y sub-pantallas SHOW-ONLY (no las envíes salvo que
    sean reversibles a simple vista): `/cuenta/privacidad`,
    `/cuenta/verificar-dni`, `/cuenta/upgrade`, `/cuenta/memberships`,
    `/cuenta/solicitudes`, `/cuenta/casos`.
14. **STOP-BEFORE-SUBMIT:** `/cuenta/crear-consultorio` — mostrá el wizard,
    NO lo envíes (crea una organización nueva y compite en capacidad con el
    escenario del Tour 6).
15. `/mis-mascotas/[token]/mostrar-libreta` — generá el enlace temporal de
    libreta compartida. **Este es el token que el Tour 1, paso 9,
    necesita** — anotalo si vas a encadenar los tours.

**Trampas conocidas:**
- El primer submit de una reserva puede quedar "colgado" un instante — es
  una carrera de hidratación conocida (`e2e/demo/_helpers.ts`,
  `submitAndWait`, el "task #39 dropped-click"): el click se dispara antes
  de que React conecte el handler. Si el botón queda deshabilitado o dice
  "Reservando…", esperá — no lo reintentes, ya está en curso.
- El buscador de duplicados en el alta de mascota puede aparecer si ya
  existe una mascota con mismo nombre/especie/sexo bajo esta cuenta (guard
  real, no bug) — elegí "No, es otra → crear igual" para no bloquear el
  tour.

---

## TOUR 3 — Adoptante `adoptante@dim.test` ⚠️ requiere seed batch 3

> **Este tour puede no ser ejecutable todavía.** La cuenta `adoptante@dim.test`
> con una mascota `adoption_finalized` + un recordatorio `post_adoption_checkin`
> abierto está planificada en `docs/plans/2026-08-14-consolidated-qa-fixes-demo-load-plan.md`
> ("Batch 3", después de Batch 1 y 2) y **no hay evidencia en el repo de que
> ya se haya corrido contra staging.** Si el login falla o `/mis-mascotas`
> aparece vacío, marcá el tour como "no ejecutable — falta seed batch 3" y
> no sigas insistiendo.

**Historia:** alguien que adoptó a través de miMAR ve su mascota adoptada y
responde al check-in de seguimiento que el refugio le pide.

**Datos seed (cuando exista):** una mascota con evento `adoption_finalized`
cuyo `adopter_user_id` es el UUID real de `adoptante@dim.test`, y un
recordatorio (`reminders`) de tipo `post_adoption_checkin` sin
`completedAt`.

**Pasos:**

1. `/mis-mascotas` — **Checkpoint:** aparece la mascota adoptada.
2. Abrí su ficha → `?sheet=anotar` (el selector de eventos) → categoría
   **Adopción** → "Check-in post-adopción".
3. **Primera corrida de esta cuenta:** completá el formulario, prefijá la
   nota con `RD<fecha>`, y enviá. **Checkpoint:** confirma el envío.
4. **Corridas siguientes de la misma cuenta:** volvé a abrir la misma
   pantalla. **Checkpoint esperado (no es un bug):** "Sin check-ins
   pendientes" — el envío del paso 3 consumió el recordatorio abierto, y no
   hay otro hasta que se resiembre. **STOP-BEFORE-SUBMIT** no aplica acá
   porque no hay nada que enviar dos veces; lo que hay que anotar es que la
   pantalla vacía es la CORRECTA, no una regresión.
5. **Postular a una adopción de punta a punta** (el rol natural para esto es
   justo esta cuenta): `/adoptar` → abrí una ficha real publicada →
   `/adoptar/[petToken]/postular` → completá el formulario con el mensaje
   prefijado `RD<fecha>` → enviá. **Checkpoint:** la postulación queda
   registrada — es additiva (se acumula en la cola del refugio; el Tour 6,
   paso de adopciones, la va a ver llegar con tu prefijo). Ningún otro tour
   completa este flujo: si este paso falla, la postulación de un ciudadano
   común está rota y nadie más lo va a detectar.
6. `/mis-mascotas/postulaciones` — **Checkpoint:** la postulación del paso 5
   aparece en tu historial con su estado.

**Trampa conocida (real, ya en el código — no la reportes como hallazgo):**
el selector de eventos (`?sheet=anotar`) muestra "Check-in post-adopción"
para **cualquier mascota**, no solo las adoptadas — el filtro por contexto
de adopción es un fix pendiente (Batch 2, item A9,
`app/(app)/mis-mascotas/[publicToken]/anotar/handoff.ts:93`). Si abrís el
selector desde una mascota que NO fue adoptada por esta cuenta, vas a ver la
opción igual; al hacer click, la propia página del check-in
(`eventos/nuevo/checkin/page.tsx:35,47`) exige `accessPath === "owner"` +
`adoption_finalized` con `adopter_user_id` propio + recordatorio abierto, y
te va a mandar a "Sin check-ins pendientes" o a un 404. Es la regla A9 del
brief hermano aplicada acá: **no visites una ruta de estado después de que
el propio flujo cambió ese estado**, y **cada guard, con el rol que la
página espera** — la opción visible no es la garantía de acceso.

---

## TOUR 4 — Veterinaria `lilian@dim.test`

**Historia:** veterinaria de planta (no admin) en **Clínica Veterinaria
Recoleta**, atiende pacientes y firma eventos sanitarios con su matrícula.

**Datos seed:** `lilian@` es miembro `vet_individual` de "Clínica Veterinaria
Recoleta" con `canWritePetEvents: true` (`scripts/seed-demo.ts:764-767`).
Es **un solo consultorio** — a diferencia de `alejo@` (Tour 6), acá `/org`
te redirige directo, sin picker.

**Pasos:**

1. `/org` — **Checkpoint:** redirige directo a `/org/[token]` de Clínica
   Recoleta (sin picker — un solo membership).
2. **Checkpoint de permisos (anotalo, no lo asumas):** el menú lateral
   debería mostrar como mínimo **Atender** y **Agenda** (capacidad
   `event.write` / `appointment.manage`, gateadas en
   `components/layout/nav-presets.ts`). Si ves **Miembros**,
   **Configuración** o **Servicios** — módulos admin-only/coordinator-only
   por rol o por `service_offering.create` — anotalo como hallazgo de
   permisos (con qué rol exacto tiene la membership, visible en
   `/org/[t]/miembros` si lo podés ver) y NO lo des por bug hasta confirmar
   contra el código; puede que su membership tenga capacidades extra.
3. **Atender** (`/org/[t]/atender`): buscá una mascota real por su token
   `DIM-XXXX-XXXX` (podés usar `DIM-PAMP-0001` u otro que hayas visto en
   tours previos) → registrá **dos eventos de tipo distinto** — una vacuna
   Y una consulta clínica — con las notas prefijadas `RD<fecha>`.
   **Checkpoint central de este tour:** ambos quedan firmados con su
   matrícula — en la libreta del animal deben distinguirse de un evento
   cargado por el dueño (verificado por veterinario matriculado vs.
   declarado), y cada tipo con su formulario propio.
4. `/org/[t]/agenda` — dashboard de turnos. **Si el Tour 2 de esta corrida
   reservó en esta clínica**, su turno RD tiene que estar acá: abrilo y
   **marcá la asistencia** (`attended`) — es dato de esta misma corrida,
   marcarlo es parte del ciclo que estamos probando. **Checkpoint:** el
   estado cambia y el dueño lo ve reflejado en `/mis-turnos`. Sobre
   cualquier OTRO turno (de otra cuenta o corrida): **SHOW-ONLY, no marques
   asistencia** — abrí el detalle, describí las acciones (asistió / no
   asistió / cancelar por la org) y no ejecutes ninguna.
5. `/org/[t]/mascotas` — pacientes en custodia/atención, abrí uno.
   SHOW-ONLY.
6. `/org/[t]/mordedura/nuevo` — el reporte clínico de mordedura (el circuito
   que el Tour 1 aclara que NO es denuncia pública). Es additivo: podés
   enviarlo con la descripción prefijada `RD<fecha>`. **Checkpoint:** el
   reporte queda creado; si dispara una observación antirrábica de 10 días,
   anotá dónde se ve (es la vigilancia que el Tour 9 mira en
   `/admin/observaciones` y el gobierno debería ver en
   `/gob/observaciones`).
7. **STOP-BEFORE-SUBMIT:** `/cuenta/renunciar` — con esta cuenta el flujo
   ABRE (exige rol veterinario, y lo tiene). Llegá hasta la confirmación,
   describila, y **cancelá** — no ejecutes la baja.

**Trampas conocidas:**
- Si comparás este tour contra `alejo@` (Tour 6) esperando el mismo menú:
  **no lo es a propósito.** Alejo es admin de Recoleta y de otras 3
  organizaciones; Lilian es vet de planta de una sola. La diferencia de
  rail nav ES el punto — no un bug de consistencia entre roles.

---

## TOUR 5 — Voluntaria / transitante `noeli@dim.test`

**Historia:** ciudadana común (cuenta tipo "owner", no una org) que se
ofrece como hogar de tránsito para refugios de su zona.

**Datos seed:** `noeli@` NO tiene una oferta de tránsito pre-sembrada
dirigida específicamente a ella en `seed-coverage.ts` (esa cobertura usa
`owner@` como voluntaria de prueba) — este tour puede necesitar generar su
propio dato. Dato lateral real: `noeli@` es la **dueña actual** de Bruno
(`DIM-BRUNO-DEMO`) en la disputa de custodia sembrada contra `graciela@dim.test`
(`scripts/seed-demo-spine.ts:893-894`) — si algo en su ficha de mascotas se
ve "en disputa" o referenciado por otra cuenta, no es un bug: es el
protagonista de ese escenario.

**Pasos:**

1. `/cuenta/transitos/propuestas` — **Checkpoint:** revisá si hay
   propuestas activas (pestaña "Activas" vs "pasadas"). Puede estar vacío.
2. **Si hay una propuesta pendiente, abrí el detalle**
   (`/cuenta/transitos/propuestas/[proposalToken]`). **STOP-BEFORE-SUBMIT:**
   el detalle ofrece **Aceptar** y **Rechazar** — describí las dos ramas
   (qué promete cada botón, qué información te da la propuesta para
   decidir) y NO ejecutes ninguna. Si no hay ninguna pendiente ahora, no es
   fallo: la **coda del Tour 6** genera una de verdad y vuelve acá — esa
   coda es donde este paso se completa.
3. Si está vacío: `/cuenta/ofrecerme-como-transito` — completá la oferta,
   prefijá cualquier nota libre con `RD<fecha>`, enviá. **Checkpoint:**
   queda registrada la oferta.
4. `/cuenta/transitos` → `/activos` y `/historial` — SHOW-ONLY.
5. **La ficha de Bruno** (`DIM-BRUNO-DEMO`, en `/mis-mascotas`): esta cuenta
   es la dueña actual en una disputa de custodia real. **Checkpoint:** abrí
   la ficha y anotá cómo (y si) la disputa se manifiesta desde el lado del
   dueño — referencia cruzada con el Tour 7, que la ve desde
   `/gob/casos?expediente=disputas`.
6. `/notificaciones` — campanita.

**Trampa conocida (ahora resuelta como coda del Tour 6):** el brief hermano
(`prompt-cowork-clickthrough-verificacion-y-nuevo.md`, punto A6) documentó
que la notificación de una propuesta de tránsito nacía en el rango más bajo
y se hundía debajo de avisos viejos; el arreglo esperado es que compita con
lo urgente (vence a los 7 días). La verificación quedó como paso numerado:
el Tour 6 le propone un tránsito real a `noeli@` y su coda vuelve a esta
cuenta (cambio de cookie, sin re-login) a mirar la campanita y el detalle.
No hace falta coordinar nada por fuera del orden natural de los tours.

---

## TOUR 6 — Org admin (multi-org) `alejo@dim.test`

**Historia:** administra varias organizaciones reales y cambia de contexto
entre ellas — el caso que prueba que "una cuenta, varias organizaciones"
funciona de punta a punta.

**Datos seed:** admin de **4 organizaciones**, incluida "Clínica Veterinaria
Recoleta" (clinic) y "Patitas del Norte" (shelter — donde vive Argo,
`DIM-ARGO-DEMO`, `scripts/seed-demo-spine.ts:185-297`).

**Pasos:**

1. `/org` — **Checkpoint:** picker con 4 organizaciones (no auto-redirige,
   a diferencia de Tour 4). Elegí **Patitas del Norte**.
2. **Ingresos** (`/org/[t]/intake` → `?tab=registrar`): wizard de 4 pasos —
   sin chip → identidad (nombre prefijado `RD<fecha>-<nombre>`, especie,
   sexo, raza del catálogo — NO texto libre, ver A4 del brief hermano) →
   estado del ingreso → confirmar. **Checkpoint:** "Mascota ingresada" +
   token nuevo.
3. `/org/[t]/censo`, `/transitos`, `/voluntarios`,
   `/voluntarios/propuestas` — SHOW-ONLY.
4. **Equipo — la parte del rol que ningún tour miraba:**
   `/org/[t]/miembros` (**Checkpoint:** lista de miembros con sus roles) →
   `/org/[t]/miembros/invitar` — **STOP-BEFORE-SUBMIT**: completá el
   formulario de invitación, describí qué promete (mail, rol propuesto), NO
   la envíes (crea una invitación pendiente real). Después
   `/org/[t]/admin/permisos` — SHOW-ONLY: **Checkpoint:** acá viven las
   capacidades por miembro — esta pantalla es la EXPLICACIÓN de por qué
   Lilian (Tour 4) ve un menú distinto del tuyo; anotá qué capacidades
   tiene ella si aparece en la lista.
5. `/org/[t]/mensajes`, `/org/[t]/cobertura`, `/org/[t]/configuracion` —
   SHOW-ONLY: bandeja institucional, zonas de cobertura para difusión de
   perdidas, y configuración de la org.
6. `/org/[t]/mascotas/[nuevoToken]/adoptar` — completá la ficha de adopción
   (historia, requisitos, edad/tamaño/energía, convivencia, costo) →
   Guardar y continuar → Publicar adopción. **Checkpoint:** el animal que
   VOS ingresaste queda publicado en `/adoptar` público.
7. **SHOW-ONLY, nunca enviar** sobre el animal recién ingresado ni sobre
   ningún otro: `/adoption` (finalizar — y si la pantalla ofrece revertir
   una adopción ya finalizada, describí también esa rama: existe
   `adoption_reversed` como acción real), `/foster`, `/foster-fin`,
   `/transfer`, `/microchip/reemplazar`, `/devolver-al-dueno`,
   `/pets/no-aptas`, `/transferencias/nueva`. Además
   `/org/[t]/intake?tab=importar` (o `/intake/importar`) — el alta masiva
   por CSV: mirá la pantalla de carga y describí el flujo, NO subas un
   archivo.
8. `/org/[t]/transferencias` y `/transferencias/recibidas` — el HUB de
   transferencias entre organizaciones (distinto del `/transfer` por
   mascota del paso 7). SHOW-ONLY: si hay una transferencia pendiente
   enviada, abrila y describí la rama **Cancelar** sin ejecutarla.
9. `/org/[t]/adopciones` — cola de postulaciones. **Checkpoint:** si el
   Tour 3 de esta corrida postuló, su postulación `RD<fecha>` tiene que
   estar acá. Abrí una. **STOP-BEFORE-SUBMIT** en aprobar/rechazar.
10. `/org/[t]/casos`, `/maltrato/recibidos` — SHOW-ONLY sobre casos
    existentes. Si querés generar uno nuevo, `/maltrato/nuevo` es additivo
    (crea un caso nuevo, no toca los de otros) — podés enviarlo con
    descripción prefijada `RD<fecha>`.
11. **Proponerle un tránsito real a `noeli@`** (desde Patitas del Norte,
    sección Tránsitos): elegí a Noelia entre las voluntarias (su oferta del
    Tour 5 debería estar visible) y mandale una propuesta con la nota
    prefijada `RD<fecha>`. Es additiva y es EL dato que la coda de abajo y
    el punto A6 necesitan. **Checkpoint:** la propuesta queda como
    pendiente del lado org.
12. Cambiá de organización: volvé a `/org`, elegí **Clínica Veterinaria
    Recoleta**. **Checkpoint:** el rail cambia de forma — Agenda/Atender
    suben al tope (foco clínico), Ingresos/Custodia/Postulaciones
    desaparecen (no son org de rehoming). Acá es donde, si el momento lo
    permite, se crea un **servicio nuevo** (`/servicios/nuevo`, wizard de 3
    pasos: Tipo → Capacidad → Elegibilidad) y una regla de agenda
    (`/servicios/[token]/agenda`, horario semanal) — additivo, seguro de
    repetir. **Checkpoint de coherencia:** los slots que esa regla genere
    tienen que respetar el horario que definiste (regla martes 9-12 → sin
    slots de jueves).
13. `/cuenta/memberships` — **Checkpoint:** en 3 de las 4 organizaciones el
    botón "Renunciar" debería estar deshabilitado con tooltip (único admin);
    en la cuarta, habilitado (hay otro admin). **STOP-BEFORE-SUBMIT en
    cualquiera** — no renuncies a nada, es irreversible sin intervención
    manual.

**Coda cruzada (cierra el ciclo del Tour 5):** cambiá la cookie de sesión a
`noeli@dim.test` (sin re-login — es el modo primario de la sección de
logística) y:

- `/notificaciones` — **Checkpoint A6:** el aviso de la propuesta del paso
  11 tiene que estar ARRIBA, compitiendo con lo urgente — no hundido al
  fondo (esa fue la falla A6 original; si nace abajo, es regresión).
- `/cuenta/transitos/propuestas` → abrí el detalle de la propuesta RD.
  **STOP-BEFORE-SUBMIT** en Aceptar/Rechazar: describí las dos ramas y no
  ejecutes ninguna — la propuesta queda pendiente y expira sola a los 7
  días, sin degradar el dataset.

**Trampa conocida:** el picker de `/org` resuelve por MEMBERSHIP real, no
por nombre hardcodeado — si el orden de las 4 organizaciones cambia entre
corridas no es un bug, el token no está fijo.

---

## TOUR 7 — Gobierno CABA `lucas@dim.test`

**Historia:** autoridad de CABA — vigila el territorio, aprueba matrículas
y habilitaciones, media denuncias, coordina campañas.

**Datos seed:** cobertura de **CABA entera** (el seed 2026-08-14 revocó las
5 asignaciones por barrio que Lucas tenía antes — Palermo, Puerto Madero,
Recoleta, Retiro, San Nicolás — y las reemplazó por una asignación de
provincia completa). OJO: la corrida QA CW0813 verificó "subsunción a nivel
localidad" con el scope viejo (Belgrano daba 404 para Lucas); ese borde ya
NO aplica a esta cuenta — el contraste inter-provincia sigue (una mascota de
Salta le da 404) y el borde por-localidad ahora se demuestra con `gov-pba@`
(Tour 8), que sí tiene partidos acotados. Argo vive en Palermo (bajo
custodia de Patitas del Norte) y la disputa de Bruno (Palermo, `noeli@` vs
`graciela@`) cae en su jurisdicción.

> **Nota de rutas:** este tour usa el nav ACTUAL
> (`components/layout/nav-presets.ts`, `GOB_NAV_SECTIONS`), que fusionó
> varias rutas viejas del shot list 2026-07-01 en vistas con pestaña
> (`?vista=`, `?etapa=`, `?expediente=`, `?registro=`). Las rutas viejas
> (`/gob/campanas`, `/gob/outreach`, `/gob/moderacion`, `/gob/maltrato`,
> `/gob/organizaciones`, `/gob/usuarios`, `/gob/disputas`, `/gob/rupga`)
> siguen resolviendo como redirect permanente — no están rotas — pero ya no
   son la ruta canónica. Usá las de abajo.

**Pasos:**

1. `/gob` — Briefing. **Checkpoint:** chip de alcance (CABA), cola
   operativa resumida.
2. `/gob/panorama?preset=sintomas&period=30d` — mapa. **Checkpoint:** carga
   el "Centro de Situación Nacional"; si en el primer intento ves "No
   pudimos cargar los indicadores", recargá — es un problema de caché fría
   conocido en el free-tier de staging (`docs/plans/2026-08-02-demo-speech-y-pasos.md`,
   Acto 0), no un hallazgo nuevo.
3. `/gob/vigilancia` → `/vigilancia/brotes` → `/vigilancia/zoonosis` →
   `/vigilancia/investigaciones` — SHOW-ONLY, salvo que quieras abrir una
   investigación nueva (`/investigaciones/nuevo`, additivo, un motivo por
   enfermedad ENO — puede rebotar "ya existe una investigación abierta" si
   ya se agotó el catálogo, no es un bug).
4. `/gob/operativos?vista=campanas` — **Checkpoint:** revisá si hay o no
   una campaña de esterilización activa en Palermo (el guion de demo usa
   este hueco como punto de partida del arco completo). `?vista=alcance`
   para el mecanismo de convocatoria.
5. `/gob/acciones` — bandeja de vencimientos, entrada de la sección
   operativa.
6. `/gob/denuncias?etapa=moderacion` y `?etapa=triage` — SHOW-ONLY, no
   moderes ni triagees denuncias ajenas.
7. **Las tres derivaciones de una denuncia (el corazón del circuito Ley
   14.346):** buscá en la lista la denuncia `RD<fecha>` que el Tour 1 creó
   con el pin en Palermo (si esta corrida no corrió el Tour 1, usá el
   código `DEN-` que haya anotado la corrida anterior; NO uses una denuncia
   del dataset curado) y abrí su **detalle** (`/gob/maltrato/[id]`).
   **Checkpoint:** el detalle ofrece TRES salidas, y las tres tienen que
   estar visibles y descritas en tu reporte:
   - **Derivar a organización** (refugio/rescate de la zona) —
     **STOP-BEFORE-SUBMIT**: abrí el panel, describí qué orgs ofrece y qué
     promete, no derives.
   - **Derivar a decomiso** — el link arma un decomiso pre-cargado con la
     denuncia (`/gob/decomisos/nuevo?welfareReportId=…`).
     **STOP-BEFORE-SUBMIT**: entrá, describí el formulario pre-poblado, no
     lo crees.
   - **Generar PDF para el MPF** (fiscalía) — **STOP-BEFORE-SUBMIT**:
     describí el botón y su promesa, no generes el export (deja rastro en
     el sistema).
   Un funcionario evalúa el producto por ESTE paso: si alguna de las tres
   salidas no aparece en el detalle de una denuncia abierta, es hallazgo
   mayor.
8. `/gob/cola` — Aprobaciones (matrículas, habilitación de organizaciones,
   credencial de perro de asistencia). Abrí un detalle. **STOP-BEFORE-SUBMIT**
   en aprobar/rechazar.
9. `/gob/casos` y `/gob/casos?expediente=disputas` — **Checkpoint:** si la
   disputa de Bruno (Palermo) está sembrada y activa, debería aparecer acá
   — es territorio de esta cuenta. Abrí el detalle de la disputa:
   **STOP-BEFORE-SUBMIT** si ofrece escalarla — describí la rama, no la
   ejecutes.
10. `/gob/observaciones` — la vigilancia antirrábica de 10 días (mordedura →
    observación con auto-cierre y escalamiento). SHOW-ONLY sobre
    observaciones ajenas. **Checkpoint:** si el Tour 4 de esta corrida
    reportó una mordedura RD, su observación debería estar acá; y la
    pantalla tiene que existir en este portal — su gemela
    `/admin/observaciones` está en el Tour 9, y una asimetría entre
    portales es hallazgo.
11. `/gob/decomisos`, `/gob/perdidas` — SHOW-ONLY.
12. `/gob/programa` (y `?vista=analitica`) — **el resumen ejecutivo, la
    pantalla que un funcionario pediría primero.** ⤓ scroll completo.
    **Checkpoint:** los números del resumen tienen que ser consistentes con
    los dashboards de detalle del paso 13 (mismo territorio, mismos
    órdenes de magnitud — un resumen que contradice su propio detalle es
    hallazgo).
13. `/gob/padron`, `/gob/padron?vista=censo`, `/gob/mortalidad`,
    `/gob/adopciones` — dashboards, ⤓ scroll completo. **Checkpoint de
    subsunción (espejo del Tour 8):** nada de La Plata / Quilmes / Morón —
    ni de ninguna otra provincia — puede aparecer en estos números: esta
    cuenta es CABA. El aislamiento se prueba en los DOS sentidos.
14. **Omnibox (⌘K / búsqueda global):** buscá `DIM-BRUNO-DEMO` y saltá a la
    ficha de mascota del portal (`/gob/mascotas/[token]`). **Checkpoint:**
    del agregado al registro puntual por búsqueda directa — es el mecanismo
    canónico del portal operativo y ningún tour lo usaba.
15. `/gob/reglas` — SHOW-ONLY, no edites reglas jurisdiccionales.
16. `/gob/directorio` y `/gob/directorio?registro=credenciales` — SHOW-ONLY.
17. `/gob/historial`, `/gob/outbox`, `/gob/suscripciones`,
    `/gob/directorio?registro=servicios` — SHOW-ONLY. (`/gob/servicios` ya no
    es destino de nav: quedó absorbida por el Directorio en la fusión F3+F7 —
    el redirect viejo resuelve, pero la canónica es la del Directorio.)

**Trampas conocidas:**
- Panorama corre sobre un cubo nocturno pero el scrub por fecha (`asOf`)
  recomputa en vivo — un número que no cambia al mover la fecha SÍ es un
  hallazgo; uno que no carga en el primer intento, no.
- El bivariado del Panorama sólo es legible a grano PROVINCIA — a
  departamento, la supresión de privacidad (k<5) vacía casi todo el mapa.
  No es un bug, es el refus honesto documentado.

---

## TOUR 8 — Gobierno PBA `gov-pba@dim.test` ⚠️ requiere seed batch 3

> **Este tour puede no ser ejecutable todavía.** `gov-pba@dim.test` está
> planificada en el mismo Batch 3 que `adoptante@dim.test`
> (`docs/plans/2026-08-14-consolidated-qa-fixes-demo-load-plan.md`), como
> respuesta directa a que **hoy todas las cuentas de gobierno existentes
> están ancladas a CABA o a Tierra del Fuego/Santa Cruz** — no hay ninguna
> con jurisdicción de Buenos Aires para demostrar el filtro. Si el login
   falla, marcá "no ejecutable — falta seed batch 3".

**Historia:** el mismo portal que el Tour 7, pero desde una jurisdicción
distinta — la prueba real de que el alcance por localidad FILTRA de verdad
y no es un chip decorativo.

**Datos seed (cuando exista):** cobertura de **La Plata, Quilmes y Morón**
(provincia de Buenos Aires).

**Pasos:** mismos que el Tour 7, con dos adaptaciones y un checkpoint eje.

**Adaptación 1 (derivaciones):** la denuncia RD del Tour 1 está pinchada en
Palermo — esta cuenta NO debe verla (si la ve, es el hallazgo de aislamiento
de abajo). Para caminar el paso de las tres derivaciones desde PBA, creá
antes una segunda denuncia anónima (pestaña sin sesión, wizard del Tour 1,
descripción `RD<fecha>`) **con el pin en La Plata**, y abrí ESA. El límite
anónimo es 1/min · 3/hora por IP — una más entra sin problema.

**Adaptación 2 (Bruno):** la disputa de Bruno es de Palermo — acá el
checkpoint es el inverso del Tour 7: **no tiene que aparecer** en
`/gob/casos?expediente=disputas`.

Checkpoint eje, en cada pantalla con datos filtrados (Panorama, Padrón,
Casos, Cola, Denuncias, Programa):

- **Checkpoint de subsunción jurisdiccional:** todo lo que ve esta cuenta
  tiene que ser de La Plata / Quilmes / Morón. Si aparece algo de CABA
  (Argo, Bruno, Pampa, cualquier dato de Palermo/Recoleta), **es un
  hallazgo de aislamiento entre jurisdicciones** — anotalo con la ruta
  exacta y qué mascota/caso se filtró. Es el mismo borde que el brief
  hermano marca como C2 ("un error ahí no se nota nunca desde adentro").

**Trampa conocida:** si esta cuenta tiene poca densidad de datos (PBA es
territorio nuevo, sin la densificación de `PANO_PROVINCE_BOOST` planeada en
el mismo batch), varias pantallas pueden salir con números chicos u
honestamente vacías — es correcto, no lo confundas con el bug de
aislamiento de arriba. La distinción: vacío-pero-consistente (bien) vs.
datos de OTRA jurisdicción apareciendo (mal).

---

## TOUR 9 — Admin `admin@dim.test`

**Historia:** control total del sistema — detecta alertas, gobierna reglas
nacionales, audita el libro de eventos append-only.

**Pasos:**

1. `/admin` — Briefing.
2. `/admin/panorama?preset=bienestar&period=90d` — mapa nacional. Misma
   trampa de caché fría que el Tour 7.
3. `/admin/programa`, `/admin/padron`, `/admin/padron?vista=censo`,
   `/admin/adopciones`, `/admin/poblacion` — dashboards ⤓.
4. `/admin/alertas` — **Checkpoint:** bandeja de alertas, buscá la de
   cobertura de esterilización (observado 38 / meta 70, SLA vencido, si el
   prep de demo la dejó `disparada`). **Reconocer** y **Registrar
   seguimiento** son seguros de ejecutar (transiciones de estado
   reversibles por el prep script). **STOP-BEFORE-SUBMIT en "Resolver"** —
   cerrar el ciclo requiere que el operador vuelva a disparar la alerta vía
   SQL antes de la próxima demo en vivo; si la resolvés vos, se lo comés al
   guion de demo real.
5. `/admin/casos`, `/admin/moderacion` (detalle SHOW-ONLY, sin moderar),
   `/admin/observaciones` — SHOW-ONLY.
6. `/admin/sistema` — **Checkpoint fail-loud:** "Salud del sistema" debe
   renderizar (crasheó antes, ya arreglado — si vuelve a crashear es
   regresión).
7. `/admin/sistema/crons` — **Checkpoint:** lista de 21 crons con su
   estado.
8. `/admin/outbox` — bandeja de salida, abrí un detalle.
9. `/admin/auditoria` y `/admin/auditoria?vista=actividad` — ⤓. (La vista
   `actividad` es lo que antes era `/admin/historial`, absorbido en la
   fusión de audit-trail 2026-08-02 — el redirect viejo resuelve, pero el
   destino canónico es este.)
10. `/admin/directorio`, `/admin/directorio?registro=organizaciones`,
    `/admin/directorio?registro=servicios`, `/admin/cuentas`,
    `/admin/cuentas?registro=govts`, `/admin/cuentas?registro=admins` —
    listas SHOW-ONLY, **no crees cuentas de gobierno ni de admin desde acá**
    (a diferencia de las mascotas/servicios, esto no es tuyo para crear en
    una corrida de QA). **Nota de rutas (misma fusión F3+F7 que el Tour 7):**
    `/admin/usuarios`, `/admin/govts`, `/admin/admins` y
    `/admin/organizaciones` ya NO tienen entrada de nav — sobreviven solo
    como redirects permanentes hacia el Directorio y Cuentas. Si llegás por
    la ruta vieja y redirige, es lo esperado; la canónica es la de arriba.
11. `/admin/reglas` → drill a una jurisdicción real (`/admin/reglas/AR/...`)
    — SHOW-ONLY, no edites ni crees reglas.
12. `/admin/chapas` — SHOW-ONLY: la emisión por lote de chapas físicas
    (CSV `serial,activation_code,url` para el proveedor de grabado). NO
    emitas un lote. **Checkpoint:** la pantalla renderiza y explica el
    flujo; si aparece vacía o deshabilitada, anotá si la regla
    jurisdiccional de chapa oficial está apagada (arranca OFF — ver "Fuera
    de alcance") antes de llamarlo hallazgo.
13. `/admin/libro` — **Checkpoint fail-loud:** "Libro de eventos" renderiza,
    con el footer de frescura ("calculado al…"). Si hay una fila
    "Corregido por enmienda", expandila (lectura, no mutación) y mirá
    `/admin/libro?tipo=event_amended`.
14. **Omnibox (⌘K / botón de búsqueda):** buscá `DIM-PAMP-0001` y saltá a
    la ficha. **Checkpoint:** la búsqueda global va del agregado al
    registro puntual; anotá si el salto te avisa de algún modo que la
    consulta de PII queda auditada (queda un rastro `pii_queried` — no es
    visible necesariamente, pero el mecanismo de búsqueda tiene que
    funcionar desde cualquier pantalla del portal).
15. `/admin/acerca/integracion-miarg` — **Checkpoint:** disclaimer NO
    ocultable de que Mi Argentina es ilustrativo (OIDC sigue siendo un
    stub).
16. Opcional, si sobra margen: `/admin/inteligencia` (índice compuesto
    territorial, analista profundo).

**Trampa conocida:** `/admin/moderacion` siempre te lleva a chrome de
Gobierno (redirect permanente a `/gob/denuncias?etapa=moderacion`) — es una
excepción cross-portal documentada (`nav-presets.ts` línea ~684), no un bug
de navegación.

---

## Repetibilidad

**Regla dura:** un tour tiene que poder correrse de nuevo mañana, con el
mismo dataset, sin degradarlo. Esto separa lo que un tour puede repetir
libremente de lo que necesita cuidado.

### Crea dato nuevo cada corrida (prefijado `RD<fecha>`, seguro de repetir)

| Tour | Qué crea |
|---|---|
| 1 — Público | denuncia anónima (limitada a 1/min·3/hora por IP; el Tour 8 crea una segunda en La Plata) |
| 2 — Dueño | mascota nueva, eventos (vacuna, peso, antiparasitario), ciclo perdida/desmarcada sobre su propia mascota, reserva + cancelación + re-reserva de turno |
| 3 — Adoptante | check-in post-adopción (**una sola vez por seed** — ver abajo), postulación de adopción |
| 4 — Veterinaria | dos eventos clínicos firmados, reporte de mordedura, marca de asistencia (solo sobre el turno RD del Tour 2) |
| 5 — Voluntaria | oferta de tránsito |
| 6 — Org admin | ingreso de animal, publicación de adopción, servicio + regla de agenda, caso de maltrato, propuesta de tránsito a `noeli@` (queda pendiente, expira sola a los 7 días) |
| 7 / 8 — Gobierno | investigación de brote (limitada por catálogo ENO — se agota) |

### Consume un dato finito — NO repetible sin resiembra

- **Tour 3 (adoptante):** el check-in post-adopción consume el ÚNICO
  recordatorio abierto sembrado. La segunda corrida en adelante debe
  esperar "Sin check-ins pendientes" como resultado CORRECTO, no reintentar
  el envío.
- **Tour 7/8:** las investigaciones ENO tienen un catálogo fijo de
  enfermedades por jurisdicción — una vez que todas tienen investigación
  abierta, el paso pasa a mostrar "ya existe" en vez de crear. Correcto,
  no un fallo.

### STOP-BEFORE-SUBMIT en toda corrida (nunca se ejecutan)

- `/cuenta/renunciar` (confirmación final) — Tour 4.
- `/cuenta/memberships` → Renunciar — Tour 6.
- `/cuenta/crear-consultorio` (envío) — Tour 2.
- Aprobar/rechazar en `/gob/cola`, `/admin/cola`, `/org/[t]/adopciones` —
  Tours 6, 7, 8.
- Aceptar/Rechazar una propuesta de tránsito — Tour 5 y coda del Tour 6
  (queda pendiente; expira sola).
- Las tres derivaciones de una denuncia (derivar a org, crear el decomiso,
  generar el PDF MPF) — Tours 7, 8: se describen, no se ejecutan.
- Escalar una disputa de custodia — Tour 7.
- Enviar una invitación de miembro (`/org/[t]/miembros/invitar`) y subir un
  CSV en el alta masiva — Tour 6.
- Emitir un lote de chapas (`/admin/chapas`) — Tour 9.
- Moderar/triagear denuncias ajenas — Tours 7, 8, 9.
- "Resolver" una alerta — Tour 9.
- Cualquier finalización, reversión, transferencia, foster o devolución
  sobre una mascota que NO creaste en esta misma corrida — Tour 6.
- Marcar asistencia sobre un turno que no reservó esta corrida — Tour 4.
- "¿Encontraste a esta mascota?" / reportar avistaje sobre una mascota
  perdida ajena — Tour 1 (notifica a un dueño real).
- Crear cuentas de gobierno/admin — Tour 9.

---

## Reporte esperado

Por cada tour: un veredicto **PASA / FALLA** por checkpoint (no por tour
entero — un tour con 12 checkpoints y 1 falla NO es "el tour falló"), más
los hallazgos en formato:

```
OBSERVACIÓN: [qué viste, con URL, hora, cuenta, cómo reproducirlo]
HIPÓTESIS: [tu conjetura de causa — marcada como conjetura, no como hecho]
```

Listá también lo que probaste y **funcionó**, con el método — sin eso, "no
encontré nada" y "no miré" se escriben igual.

**Cuatro preguntas de cierre, obligatorias** (las mismas que
`prompt-cowork-clickthrough-verificacion-y-nuevo.md`):

1. ¿En qué momento no supiste si algo había pasado?
2. ¿Hiciste algo dos veces por no saber si salió?
3. ¿Hubo algún número que no le creíste?
4. ¿Qué pareció abandonado, inalcanzable o contradictorio?

**Entregable:** un solo markdown, con el SHA verificado en el encabezado,
las nueve secciones de tour en el mismo orden que este brief, y al final la
lista de lo NO ejecutado (incluidos los Tours 3 y 8 si `adoptante@` /
`gov-pba@` todavía no existen).

---

## Fuera de alcance

Estas capacidades **no existen todavía**. Ningún tour las prueba ni las
promete — si un paso pareciera necesitar alguna de ellas, es la señal de
que estás en el flujo equivocado, no de que falta implementar algo en el
momento. Fuente: `docs/onboarding/README.md` (inventario de honestidad).

- **Login federado con Mi Argentina.** Solo hay scaffold OIDC apagado; el
  ingreso real es correo + contraseña en todas las cuentas.
- **Envío automático de notificaciones ENO / denuncias a organismos
  externos.** El sistema encola y mide su propia bandeja de salida; el
  disparo automático hacia afuera está en desarrollo.
- **Export provincial del registro PPP.** La declaración jurada existe; el
  archivo de intercambio con la provincia, no.
- **Reglas de cumplimiento legal jurisdiccional v2** (obligation types con
  nivel de exigencia). Hoy sólo existen las reglas operativas de
  `/gob/reglas` / `/admin/reglas`.
- **Verificación de identidad contra RENAPER.** El DNI es declarado, nunca
  validado contra un registro estatal.
- **Importación de padrones municipales preexistentes.** No hay
  importador; el territorio de cada localidad arranca de cero.
- **Acceso de lectura del veterinario "por portal" (Tier 4).** Un
  veterinario no ve el historial completo por escanear el QR — el dueño
  tiene que compartirlo (enlace temporal o nivel médico público).
- **Receta electrónica veterinaria** (detalle de principio activo y
  posología).
- **Validación automática de matrícula** contra el colegio profesional —
  es revisión humana de la autoridad local.
- **Facturación, cobros, aranceles, donaciones.** No hay pagos en el
  sistema en ningún rol.
- **Chequeo automático de postulantes a adopción contra registros de
  infractores** (Ley Huellas CABA 6839) — la evaluación es del refugio.
- **Push al celular por defecto.** Existe el flag, apagado por defecto; los
  avisos viven en la campanita in-app.
- **Aplicación nativa** (App Store / Google Play) — todo es navegador.
- **Aviso automático de vacuna por vencer.** Sólo existe el recordatorio
  programado a mano.
- **Semáforo de estado sanitario / requisitos de viaje.** `/viaje` muestra
  "Próximamente" — no lo confundas con `/mudanza`, que sí existe.
- **Chapa grabada oficial** (canal físico distinto de la chapita QR
  autoimpresa) — arranca OFF, se habilita por regla jurisdiccional.
- **Mapa general de mascotas perdidas.** `/perdidas` es un listado con
  filtros — ya cubierto en el Tour 1.
- **"Mordedura" como tipo de denuncia pública.** No está entre los 9 tipos
  del formulario — vive en el circuito clínico/organizacional
  (`/org/[t]/mordedura/nuevo`).
