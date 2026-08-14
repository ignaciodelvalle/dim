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
     exacto para continuar" — un domicilio tipeado no alcanza).
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
10. Estáticas: `/acerca`, `/ayuda`, `/accesibilidad`, `/privacidad`,
    `/terminos`, `/cookies`, `/sugerencias` (este último tiene formulario —
    podés enviarlo con prefijo `RD<fecha>`, es additivo y no tiene efecto
    sobre otros datos).
11. Pantallas de auth sin enviar: `/iniciar-sesion`, `/registro`,
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
5. `/turnos/buscar` → elegí un servicio (ej. "Castración perro macho") →
   localidad Palermo → Buscar → abrí la oferta → elegí un slot →
   `/reservar/[slotId]` → elegí la mascota → Confirmar reserva.
   **Checkpoint:** aparece en `/mis-turnos`.
6. `/denuncias/mias` — lista de denuncias propias (si hay alguna de una
   corrida anterior con tu cuenta) → abrí el detalle.
7. `/notificaciones` — campanita, pestañas por categoría.
8. `/cuenta` — perfil, y sub-pantallas SHOW-ONLY (no las envíes salvo que
   sean reversibles a simple vista): `/cuenta/privacidad`,
   `/cuenta/verificar-dni`, `/cuenta/upgrade`, `/cuenta/memberships`,
   `/cuenta/solicitudes`, `/cuenta/casos`.
9. **STOP-BEFORE-SUBMIT:** `/cuenta/crear-consultorio` — mostrá el wizard,
   NO lo envíes (crea una organización nueva y compite en capacidad con el
   escenario del Tour 6).
10. `/mis-mascotas/[token]/mostrar-libreta` — generá el enlace temporal de
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
   tours previos) → registrá un evento clínico (ej. una vacuna o una
   consulta), prefijá la nota con `RD<fecha>`. **Checkpoint central de este
   tour:** el evento queda firmado con su matrícula — en la libreta del
   animal debe distinguirse de un evento cargado por el dueño (verificado
   por veterinario matriculado vs. declarado).
4. `/org/[t]/agenda` — dashboard de turnos. Abrí un turno si hay alguno.
   **SHOW-ONLY: no marques asistencia** sobre un turno que no reservaste
   vos (es dato compartido de otra cuenta/tour).
5. `/org/[t]/mascotas` — pacientes en custodia/atención, abrí uno.
   SHOW-ONLY.
6. **STOP-BEFORE-SUBMIT:** `/cuenta/renunciar` — con esta cuenta el flujo
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
2. Si está vacío: `/cuenta/ofrecerme-como-transito` — completá la oferta,
   prefijá cualquier nota libre con `RD<fecha>`, enviá. **Checkpoint:**
   queda registrada la oferta.
3. `/cuenta/transitos` → `/activos` y `/historial` — SHOW-ONLY.
4. `/notificaciones` — campanita.

**Trampa conocida (candidata a segunda vuelta):** el brief hermano
(`prompt-cowork-clickthrough-verificacion-y-nuevo.md`, punto A6) documentó
que la notificación de una propuesta de tránsito nacía en el rango más bajo
y se hundía debajo de avisos viejos; el arreglo esperado es que compita con
lo urgente (vence a los 7 días). Si en algún momento otra org (Tour 6,
`alejo@`) le propone un tránsito a `noeli@` de verdad, este es el mejor
punto para volver a mirar la campanita y confirmar que el arreglo se
sostiene — pero es cross-tour: requiere coordinar el orden con el operador,
no es algo que este tour resuelva solo.

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
4. `/org/[t]/mascotas/[nuevoToken]/adoptar` — completá la ficha de adopción
   (historia, requisitos, edad/tamaño/energía, convivencia, costo) →
   Guardar y continuar → Publicar adopción. **Checkpoint:** el animal que
   VOS ingresaste queda publicado en `/adoptar` público.
5. **SHOW-ONLY, nunca enviar** sobre el animal recién ingresado ni sobre
   ningún otro: `/adoption` (finalizar), `/foster`, `/foster-fin`,
   `/transfer`, `/microchip/reemplazar`, `/devolver-al-dueno`,
   `/pets/no-aptas`, `/transferencias/nueva`.
6. `/org/[t]/adopciones` — cola de postulaciones, abrí una si hay.
   **STOP-BEFORE-SUBMIT** en aprobar/rechazar.
7. `/org/[t]/casos`, `/maltrato/recibidos` — SHOW-ONLY sobre casos
   existentes. Si querés generar uno nuevo, `/maltrato/nuevo` es additivo
   (crea un caso nuevo, no toca los de otros) — podés enviarlo con
   descripción prefijada `RD<fecha>`.
8. Cambiá de organización: volvé a `/org`, elegí **Clínica Veterinaria
   Recoleta**. **Checkpoint:** el rail cambia de forma — Agenda/Atender
   suben al tope (foco clínico), Ingresos/Custodia/Postulaciones
   desaparecen (no son org de rehoming). Acá es donde, si el momento lo
   permite, se crea un **servicio nuevo** (`/servicios/nuevo`, wizard de 3
   pasos: Tipo → Capacidad → Elegibilidad) y una regla de agenda
   (`/servicios/[token]/agenda`, horario semanal) — additivo, seguro de
   repetir.
9. `/cuenta/memberships` — **Checkpoint:** en 3 de las 4 organizaciones el
   botón "Renunciar" debería estar deshabilitado con tooltip (único admin);
   en la cuarta, habilitado (hay otro admin). **STOP-BEFORE-SUBMIT en
   cualquiera** — no renuncies a nada, es irreversible sin intervención
   manual.

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
7. `/gob/cola` — Aprobaciones (matrículas, habilitación de organizaciones,
   credencial de perro de asistencia). Abrí un detalle. **STOP-BEFORE-SUBMIT**
   en aprobar/rechazar.
8. `/gob/casos` y `/gob/casos?expediente=disputas` — **Checkpoint:** si la
   disputa de Bruno (Palermo) está sembrada y activa, debería aparecer acá
   — es territorio de esta cuenta.
9. `/gob/decomisos`, `/gob/perdidas` — SHOW-ONLY.
10. `/gob/padron`, `/gob/padron?vista=censo`, `/gob/mortalidad`,
    `/gob/adopciones` — dashboards, ⤓ scroll completo.
11. `/gob/reglas` — SHOW-ONLY, no edites reglas jurisdiccionales.
12. `/gob/directorio` y `/gob/directorio?registro=credenciales` — SHOW-ONLY.
13. `/gob/historial`, `/gob/outbox`, `/gob/suscripciones`, `/gob/servicios`
    — SHOW-ONLY.

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

**Pasos:** mismos que el Tour 7, con este checkpoint como eje central en
cada pantalla con datos filtrados (Panorama, Padrón, Casos, Cola, Denuncias):

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
9. `/admin/auditoria` — ⤓.
10. `/admin/usuarios`, `/admin/govts`, `/admin/admins`,
    `/admin/organizaciones`, `/admin/cuentas`, `/admin/cuentas?registro=admins`
    — listas SHOW-ONLY, **no crees cuentas de gobierno ni de admin desde
    acá** (a diferencia de las mascotas/servicios, esto no es tuyo para
    crear en una corrida de QA).
11. `/admin/reglas` → drill a una jurisdicción real (`/admin/reglas/AR/...`)
    — SHOW-ONLY, no edites ni crees reglas.
12. `/admin/historial`.
13. `/admin/libro` — **Checkpoint fail-loud:** "Libro de eventos" renderiza,
    con el footer de frescura ("calculado al…"). Si hay una fila
    "Corregido por enmienda", expandila (lectura, no mutación) y mirá
    `/admin/libro?tipo=event_amended`.
14. `/admin/servicios`.
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
| 1 — Público | denuncia anónima (limitada a 1/min·3/hora por IP) |
| 2 — Dueño | mascota nueva, evento de vacuna, reserva de turno |
| 3 — Adoptante | check-in post-adopción (**una sola vez por seed** — ver abajo) |
| 5 — Voluntaria | oferta de tránsito |
| 6 — Org admin | ingreso de animal, publicación de adopción, servicio + regla de agenda, caso de maltrato |
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
- Moderar/triagear denuncias ajenas — Tours 7, 8, 9.
- "Resolver" una alerta — Tour 9.
- Cualquier finalización, transferencia, foster o devolución sobre una
  mascota que NO creaste en esta misma corrida — Tour 6.
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
