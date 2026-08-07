# Crítica de interacción: Fluidez transversal (X1)

> **Plan**: `docs/reviews/2026-07-26-plan-criticas-diseno.md` §4b, ficha X1 · **Fecha**: 2026-07-27
> **Persona**: usuario impaciente en tres superficies — ciudadano mobile (390), dueño mobile (390), funcionario desktop (1440).
> **Norma bajo juicio**: post-mutación, la verdad viene de NAVEGACIÓN DE DOCUMENTO COMPLETO o estado local optimista; `router.refresh()` prohibido (`lint:nav`; doctrina en `docs/design/handoffs/2026-07-04-router-refresh-tiers.md`, `lib/ui/sheet-nav.ts`, `lib/ui/full-page-action-nav.ts`).
> **Evidencia**: console.json + index.json de los 8 bundles en `docs/reviews/results/2026-07-27-critique-screenshots/`, PNGs citados por hallazgo, y el código como evidencia principal.
>
> **Declaraciones de evidencia**:
> - `[ENTORNO]` Latencias absolutas del cloud no son criticables: `panorama/perf.json` mide TTFB 49–66 ms y DCL 130 ms warm — en este entorno TODA navegación full-document parece instantánea. Los juicios de costo son **arquitecturales** (qué paga el patrón, dónde, cuántas veces), no cronométricos.
> - `[ENTORNO]` `credencial/*-console.json`: los `ERR_TUNNEL_CONNECTION_FAILED`/AJAXError de tiles OSM son el proxy del sandbox bloqueando `tile.openstreetmap.org` — no producto. Los 404 de fotos en `libreta/*-index.json` son el seed.
> - Los 14/25 errores CSP del bundle finder están **explicados de raíz por C3** (§Errores de consola: CSP enforcing con nonce por-request vs páginas prerenderizadas) — acá no se duplican, se **extiende** el hallazgo con una segunda instancia viva (F2).
> - La ficha X1 pide usar "los webm de demo del repo" como referencia: **no existe ningún `.webm`/`.mp4`/`.gif` en el working tree** (find exhaustivo, excluido node_modules). Puntero del plan stale; se declara y se sigue sin ese material.
> - P2 (`2026-07-27-critique-panorama-fluidez.md`) **no existe todavía** al momento de escribir: la fluidez interna del panorama (drill, cámara, presets) se le deja íntegra; acá el panorama solo entra por su FAIL-click y por su loading.tsx de ruta.

---

## Impresión general

La norma anti-`router.refresh()` está **ejecutada de verdad, no aspiracionalmente**: cero llamadas runtime en app/components/src (57 archivos conservan solo el comentario doctrinal), `lint:nav` corre en `pnpm verify`, y 89 archivos cliente usan los cuatro helpers sancionados (`navigateAfterActionSuccess` / `useActionRedirect` / `closeSheetNavWithFullReload` / `window.location.assign`). El costo percibido de esa arquitectura está además bien amortiguado donde más se paga: 164 `loading.tsx` para 246 `page.tsx`, con skeletons que espejan el layout real y un contrato de accesibilidad uniforme testeado. Para un usuario impaciente, la app **entre páginas** se siente honesta: siempre hay una sombra de lo que viene.

Donde la arquitectura filtra es en sus **costuras**, y las tres superficies pagan una distinta. El ciudadano paga las dos rutas que quedaron fuera de la doctrina: `/recuperar` prerenderizada muere bajo el CSP (la segunda instancia del mecanismo que C3 predijo sistémico) y el login entero viaja por `redirect()` de server action — el mecanismo que el propio repo documenta como "silently drops, 3/3 en producción". El dueño mobile paga el **gap del botón que revive**: en todo el patrón post-mutación, `isPending` muere cuando la action resuelve, `window.location.assign()` no bloquea, y el botón vuelve a "Crear mascota" habilitado mientras el documento nuevo todavía viaja — la ventana exacta donde el impaciente hace doble-tap. Y el funcionario paga scroll-reset tras cada acción bulk y un skeleton de ruta que le promete un dashboard de cards cuando lo que llega es una consola-mapa.

Los tres FAIL-click del harness, lejos de ser casualidad, son el mismo síntoma con tres causas distintas: la palabra visible de una acción primaria desapareció (ausente en cuenta, renombrada en libreta, iconificada en panorama). Un script que busca texto es un proxy razonable del usuario que escanea la pantalla buscando la palabra de lo que quiere hacer — y en tres superficies de tres personas distintas, no la encontró.

---

## Mapa de loading states

Dato estructural previo: el build actual solo prerenderiza **2 documentos** (`.next/server/app`: `_not-found.html` y `recuperar.html`); todo lo demás es dinámico por request → `loading.tsx`, donde existe, cubre **las dos** transiciones (soft-nav de `<Link>` y primer flush del stream en navegación full-document). La inversión en skeletons paga doble.

| Ruta / grupo | ¿loading.tsx? | ¿Qué ve el usuario en la transición? | Veredicto |
|---|---|---|---|
| `/p/<token>` credencial pública | Sí (propio, "must be fast") | Hero + 2 cards fantasma que espejan la credencial | 🟢 |
| `/perdidas`, `/adoptar`, `/casos/<code>`, `/refugios` | Sí | Skeleton espejo ("footprint mirrors page.tsx" documentado) | 🟢 |
| `/denuncias/nueva` (wizard público) | No — pero el page es un client component sin fetch server (`page.tsx` = `<DenunciaWizard/>`) | Transición ~instantánea; no necesita skeleton | 🟢 |
| **`/denuncias/codigo/[code]`** (seguimiento por código) | **No** — y es dinámica DB-bound (rate-limit + lookup) | Página anterior congelada / área en blanco hasta que el server resuelve | 🟡 F5 |
| **`/r/invite/[token]`** (aterrizaje de invitación org) | **No** — dinámica DB-bound (`page.tsx:32-44`) | Ídem: el invitado que clickea el link del email espera sin feedback | 🟡 F5 |
| `/login`, `/signup` | No — dinámicas livianas | Riesgo bajo; el feedback vive en el submit | 🟢 |
| **`/recuperar`** | No — **prerenderizada** (`recuperar.html`) | Página visible pero con el 100 % del JS bloqueado por CSP en prod | 🔴 F2 |
| `/inicio` (owner) | No — es un redirect puro con queries (ranking de urgencia, `page.tsx:48`) | Sin UI propia; la espera del ranking se percibe en el botón de login; el destino (perfil) sí tiene skeleton | 🟢 nota |
| `(app)` owner: `/cuenta/**` (14), `/mis-mascotas/**` (9), `/mis-turnos`, `/turnos`, `/transferencias`, `/denuncias/mias`, `/notificaciones` | Sí — `LnPageSkeleton` o hand-rolled espejo | Shell inmediato + filas registro fantasma (72 px = `LnRegRow` real) | 🟢 |
| `/gob/**` (44) y `/admin/**` (39) | Sí — `OpDashboardSkeleton` / `OpCardSkeleton` / `OpKpiSkeleton` | Sombra fiel del briefing/bandeja (el de `/gob` espeja hasta los 10 tiles del batch B) | 🟢 |
| **`/gob/panorama` + `/admin/panorama`** | Sí, pero **con la forma equivocada**: `OpDashboardSkeleton filterBar kpis=4 cards=[6,4]` (`app/gob/panorama/loading.tsx:8`) | Fantasma de dashboard de cards → lo reemplaza una consola-mapa full-viewport (`pan-entry.png`): bait-and-switch de layout en la ruta vidriera | 🟡 F6 |
| `/org/**` (36) | Sí | Consistente con gob | 🟢 |
| Público estático (legales, `/acerca`, `/ayuda`…) | No | Livianas; riesgo bajo | 🟢 |

**F5 🟡 — Dos rutas dinámicas públicas sin boundary.** `/denuncias/codigo/[code]` es la superficie "¿cómo va mi denuncia?" del ciudadano anónimo y `/r/invite/[token]` es un token-landing (la clase de superficie que `shell-nav.ts:91-104` trata como sagrada). Ambas hacen DB antes del primer byte útil y son las únicas dinámicas orientadas a usuario final sin `loading.tsx` en todo el árbol. *Evidencia*: `app/(public)/denuncias/codigo/[code]/page.tsx:126-133`, `app/r/invite/[token]/page.tsx:32-44`, ausencia verificada por barrido de ancestros.

**F6 🟡 — El skeleton del panorama miente la forma.** La norma del sistema es "footprint mirrors page.tsx" (comentarios en `cuenta/loading.tsx`, `perdidas/loading.tsx`, `gob/loading.tsx`) y se cumple en todos lados menos en la ruta insignia: `app/gob/panorama/loading.tsx` y `app/admin/panorama/loading.tsx` renderizan un dashboard de KPIs+cards; lo que aterriza es la consola-mapa (`pan-entry.png`). Para el funcionario que entra 10 veces por día, el "casi cargó… no, era otra página" es un micro-engaño diario. *(La secuencia de skeletons INTERNA de la consola es territorio de P2.)*

---

## El costo de la navegación full-document, por superficie

La doctrina (`2026-07-04-router-refresh-tiers.md` + `full-page-action-nav.ts`) intercambia frescura garantizada del SSR por: descarte del runtime hidratado, re-descarga/re-parse de JS, scroll-reset y una ventana sin dueño entre "la action resolvió" y "el documento nuevo pintó". `[ENTORNO]` — acá esa ventana dura decenas de ms; en el teléfono del vecino es donde vive el costo real. Dónde duele, por persona:

**Dueño mobile (paga por frecuencia).** Las acciones más repetidas del owner terminan en documento completo: guardar contacto de emergencia (`closeSheetNavWithFullReload`, `sheet-nav.ts:92-95`), aceptar transferencia (`AcceptTransferActions.tsx:51`), crear mascota (`useActionRedirect` → credencial), amend de evento. El perfil-documento — la página más pesada del mundo owner — se recompra entero tras cada anotación. Amortiguado por skeleton espejo + `[ENTORNO]`, es un trade razonable… **salvo por F1**:

**F1 🔴 — El botón revive mientras el documento viaja (sistémico, todos los call sites).** El patrón es `startTransition(async () => { …; navigateAfterActionSuccess(url) })` o `useActionState` + `useActionRedirect(state.redirectTo)`. En ambos, el pending muere cuando la action resuelve; `window.location.assign()` retorna sin bloquear; el botón se re-habilita con su label idle mientras el browser recién empieza a traer el documento. Secuencia percibida en conexión real: "Guardando…" → **"Crear mascota" habilitado de nuevo, página vieja intacta** → (segundos) → página nueva. El impaciente re-tapea: el alta lo aguanta server-side (`clientIdempotencyKey`, `MinimalNewPetForm.tsx:260`), pero aceptar una transferencia dos veces devuelve un error post-hoc confuso, y la mayoría de los 89 call sites no tiene guard de idempotencia de UI. La regla "the reload itself IS the confirmation" (`action-feedback.ts:20-23`) es correcta — pero entre el click y el reload hay una ventana donde la confirmación no existe y el control invita a repetir. *Evidencia*: `app/(app)/transferencias/[transferToken]/AcceptTransferActions.tsx:39-53` (`pending` de `useTransition` + assign), `app/(app)/mis-mascotas/nueva/MinimalNewPetForm.tsx:520-523` (`disabled={isPending}` solamente; `state.redirectTo` no deshabilita), `lib/ui/use-action-redirect.ts:35-37` (el effect navega pero no comunica).

**F3 🔴 — Los success-paths que la doctrina no alcanzó: `redirect()` sigue vivo en server actions — incluido el login.** La propia doc del repo establece que el `redirect()` de una action "resolves correctly… but the client router silently drops it: no pushState, no re-render, no error" (reproducido 3/3, `full-page-action-nav.ts:5-18`), y el contrato N3 (return `redirectTo` + `useActionRedirect`) existe para eso. Pero: el **login** hace `redirect()` tres veces (`src/modules/auth/application/login.ts:100,103,124`), **reservar turno** también (`app/actions/booking.ts:69`), **editar mascota** (`src/modules/pets/actions.ts:434,514,578`), el **match por chip del alta** (`pets/actions.ts:188` — con un comentario "request-edge: redirect stays here" que no explica por qué sería inmune), y la transferencia org (`transfers/actions.ts:696`); 12 archivos de actions contienen `redirect(` a auditar. Síntoma en la superficie de mayor tráfico de la app: "Ingresando…" → botón vuelve a "Iniciar sesión" → **nada** — credenciales correctas, sesión creada, cero navegación y cero error. Intermitente, imposible de reproducir para soporte. `lint:nav` caza `router.refresh()` pero nada linta `redirect()` post-mutación en actions: el agujero es invisible para `verify`. *Evidencia*: archivos citados + `app/(auth)/login/LoginForm.tsx` (sin `useActionRedirect`; la mitigación de progressive-enhancement del task #39 solo cubre pre-hidratación).

**F2 🔴 — `/recuperar`: la segunda instancia viva del mecanismo CSP-vs-prerender de C3.** C3-P1 verificó la causa raíz en la 404 y predijo: "cualquier ruta pública que hoy o mañana se prerenderice muere igual". Ya hay una hoy: `recuperar.html` sale del build con nonce estampado en build-time, el middleware acuña nonce por-request → 100 % de los scripts bloqueados en prod. La página se ve, y el form (`ResetRequestForm.tsx`, `useActionState`) degrada al POST progressive-enhancement — funciona, pero sin `isPending`, sin "Enviando…", con full-page POST por cada error y la consola en rojo. Es el flujo de **recuperación de contraseña**: la persona que llega ya está frustrada. *Evidencia*: `.next/server/app/recuperar.html` (uno de solo 2 prerenders del build), `app/(auth)/recuperar/ResetRequestForm.tsx:1-44`; mecanismo por referencia a C3 §Errores de consola.

**Funcionario desktop (paga por repetición).** Cambio de período y de jurisdicción = documento completo por diseño (`PeriodPicker.tsx:25-26`, `JurisdictionSwitcher.tsx:18-19`) — defendible y bien documentado. Lo que no está resuelto es la **posición**:

**F7 🟡 — Scroll-reset tras acciones de fila/bulk en bandejas largas.** `BulkApprovalQueueList` recarga con `navigateAfterActionSuccess(window.location.href)` tras un bulk limpio (`components/BulkApprovalQueueList.tsx:99,108`); `assign(href)` aterriza arriba de todo. El operador que aprobó 3 ítems en la mitad de una cola de 40 vuelve al tope y re-scrollea para seguir — en cada pasada. Mismo patrón en `WithdrawButton`, `LeaveMembershipButton`, etc. (Tier A del handoff). La recarga es la norma; perder el lugar no tiene por qué serlo (`assign(href + "#row-N")` o `sessionStorage` scroll hint son compatibles con la doctrina). *Evidencia*: archivos citados; `govt-denuncias.png`/`govt-casos.png` muestran las bandejas densas donde esto muerde.

**Ciudadano mobile.** Sus flujos one-shot ya usan `<a>` duros documentados (C3 lo elogia — no se repite). Su costo real está en F2/F3 (auth) y F5 (seguimiento de denuncia).

---

## Sheets y back

C6 ya estableció el mapa (C1: tres gramáticas de confirmación; C2: dos mecanismos de apertura, /cuenta en el defectuoso; su fortaleza 1: el ciclo abrir/cerrar/back de `sheet-nav.ts` es el patrón mejor razonado del scope). Profundizando el camino defectuoso con el código del módulo:

**F8 🟡 — El opener de /cuenta rompe el contrato de `closeSheetNav` y deja un back muerto.** `closeSheetNav` decide entre `history.back()` y `replaceState` leyendo el flag módulo-scoped `openedViaPush`, que **solo** setea `pushSheetUrl` (`sheet-nav.ts:36,61-68`). Las cuatro aperturas de /cuenta son `<Link href="?sheet=…">` de router (`cuenta/page.tsx:255,323,341,390`): pushean una entrada real de historia **sin** tocar el flag. Cierre → rama `replaceState` (la diseñada para deep-links) → la entrada pusheada queda, ahora idéntica a la anterior. Resultado: tras abrir y cerrar "Editar mi información", el primer back **no hace nada visible**; tras tocar tres sheets, tres backs muertos antes de salir de /cuenta. En Android, back-que-no-responde se lee como app rota. C6-C2 pedía migrar los openers por el riesgo de drop; esto agrega la segunda razón: el contrato de historia del propio módulo lo exige. *Evidencia*: `lib/ui/sheet-nav.ts:28-68`, `app/(app)/cuenta/CuentaSheetMounter.tsx:55-58`, `app/(app)/cuenta/page.tsx:323-390`.

**F9 🟡 — Abrir un sheet en /cuenta cuesta un round-trip RSC de la página más lenta del mundo owner.** El `<Link href="?sheet=…">` same-route dispara la re-render server de /cuenta — la página del `Promise.all` pesado con timeout de 8 s (C6 fortaleza 6) — para montar un form 100 % cliente. `SheetTriggerLink` hace exactamente lo mismo en 0 ms y sin red (`pushSheetUrl` + `useSearchParams` reactivo), preservando middle-click/copy-link (`SheetTriggerLink.tsx:32-45`). El sheet que en el perfil de mascota abre instantáneo, en /cuenta abre "cuando el server quiere". `[ENTORNO]`: acá ~60 ms; en producción es variable y evitable. *Evidencia*: archivos citados.

**F4 🔴 — "Asentar" del tab bar viaja por el hot path que el propio módulo declaró vedado.** `sheet-nav.ts` existe porque "the Anotar icon fail 3/3 in production… the router must never sit on their hot path" (`sheet-nav.ts:4-10`). Hoy el mismo sheet tiene dos aperturas desiguales: `PetActionRow` "Anotar" → `SheetTriggerLink` (inmune); el slot central del tab bar mobile "Asentar", **estando en el perfil**, → `<Link href="/mis-mascotas/<token>?sheet=anotar">` plano (`CitizenTabBar.tsx:127-134`) — una soft-nav same-route de router: exactamente la forma que falló 3/3 y motivó el módulo. La acción de captura número uno del dueño mobile queda protegida o expuesta según qué pixel tape el pulgar. (Desde otras rutas, el Link cross-route a `/inicio?sheet=anotar` es correcto — el fix es solo el caso same-route.) *Evidencia*: `components/layout/CitizenTabBar.tsx:116-134`, `components/pet-profile/SheetTriggerLink.tsx`, historial en `lib/ui/sheet-nav.ts:4-10`.

Sumado a C6-U4 (React #418 en el run desktop de cuenta, aún sin triangular): una superficie que apila sheets sobre URL state con un hydration mismatch activo tiene su fluidez hipotecada — el mismatch fuerza re-render cliente (flash) y puede desincronizar exactamente el `useSearchParams` del que viven los mounters. Se refuerza el pedido de triage de C6 antes de construir más encima.

---

## Feedback de formularios

Lo estructural está bien: los tres formularios clave tienen pending real — login `disabled` + `aria-busy` + "Ingresando…" (`LoginForm.tsx:124-131`), alta spinner + "Guardando…" (`MinimalNewPetForm.tsx:520-534`), denuncia "Enviando…" (`WelfareReportForm.tsx:423-426`) — y el submit del login está blindado como POST progressive-enhancement con comentario doctrinal (task #39). Los agujeros:

- **F1** (arriba): el pending no sobrevive al éxito — el hueco entre action resuelta y documento nuevo no tiene estado en ningún form.
- **F3** (arriba): el login además navega por el mecanismo documentado como droppable — su excelente pending state alimenta expectativa para un final que a veces no llega.
- **F10 🟡 — La validación del alta entrega los errores de a uno, lejos del campo y sin foco.** `goToStep2` retorna en el primer faltante (`MinimalNewPetForm.tsx:214-227`): nombre → click → especie → click → localidad: hasta tres rondas de "Continuar" para descubrir tres huecos. El error es una línea mono de 11.5 px arriba del footer (`:470-477`), a seis campos de distancia del NOMBRE que menciona — `desk-wizard-validacion.png` lo muestra: "Escribí el nombre de tu mascota." pegado al botón, campo Nombre impecable y sin marca de inválido, foco quieto. El propio repo tiene el patrón correcto en producción: `useFormErrorFocus` se usa en los 15+ forms de eventos de la libreta (`eventos/nuevo/*/…Form.tsx`) — pero no en la puerta de entrada del producto. En mobile 390 la distancia error↔campo es una pantalla. *Evidencia*: `alta/desk-wizard-validacion.png`; `app/(app)/mis-mascotas/nueva/MinimalNewPetForm.tsx:214-227,470-477`; `lib/ui/use-form-error-focus.ts` (existente, sin usar acá).

---

## Los tres FAIL-click (estudio de affordance)

Tres superficies, tres personas, tres clicks de harness sin objetivo. ¿Patrón o casualidad? **Patrón** — el mismo síntoma con tres causas distintas: *la palabra visible de una acción primaria desapareció de la pantalla*. Un script que localiza por texto es un proxy honesto del usuario impaciente, que no explora: escanea buscando la palabra de lo que vino a hacer.

| Bundle | Evidencia | Qué buscó el harness | Por qué falló | Clase |
|---|---|---|---|---|
| cuenta | `desk-FAIL-click.png` ≡ `desk-transferencias.png` (md5 `82080a85…`) | "Transferir" en el hub /transferencias | **No existe** ningún control para iniciar: el hub promete transferencias y no ofrece transferir (C6-U1 🔴 — el análisis es suyo; no se re-abre) | Affordance **ausente** |
| libreta | `desk-FAIL-click.png` (cara Credencial; md5 distinto de `desk-detalle.png`: es una captura del intento) | Tab "Libreta" | La tablist se eliminó el 07-19; el único switch es "Dar vuelta", que **no nombra el destino** (C5-U4/#4 🟡 — citado) | Affordance **renombrada/opaca** |
| panorama | `pan-FAIL-click.png` ≡ `pan-entry.png` (md5 `c6947629…`) | Sin analizar por nadie (P2 no corrió) — ver abajo | El click no encontró objetivo y **no cambió nada**: estado idéntico al entry | Affordance **iconificada** |

**El caso panorama (análisis nuevo).** El md5 idéntico al entry prueba dos cosas: el click se intentó sobre el estado inicial de la consola, y su fallo fue perfectamente silencioso. ¿Qué hay clickeable con texto visible en `pan-entry.png`? Las tabs del dock (Estadísticas · Registros · Referencias · Línea de tiempo — las tres primeras tienen shot exitoso), los pills de mapa y el dropdown de alcance. **Todo lo demás es icono sin label**: el rail derecho concentra siete acciones — vistas, capas, período, tendencia, **exportar**, actualizar, acerca — como IconButtons con `aria-label` y `title` correctos (`components/panorama/PanoramaRail.tsx:114-152`) pero cero texto en pantalla. De los focos del guion de captura (fichas C7/P4), los que no tienen shot son justamente export y línea de tiempo; no puedo probar el selector exacto que falló **[declarado]**, pero el hecho de affordance es verificable sin el harness: el funcionario que escanea la consola buscando la palabra "Exportar" — la acción que la ficha C7 considera entregable clave — no la encuentra; tiene que hacer hover-arqueología sobre siete glifos. A11y ≠ affordance: el label existe para el lector de pantalla y no para el ojo apurado.

**La segunda lección, transversal**: en los tres casos el fallo fue silencioso también para el harness — pantalla idéntica, cero reacción. Ninguna de las tres superficies tiene un estado "eso que buscás está en otro lado" (el hub sin CTA no señala el camino real; el frente de la credencial no menciona qué hay atrás; la consola no ofrece leyenda de su rail). Cuando la palabra desaparece, no hay red.

---

## Lo que funciona bien

1. **El sistema de skeletons como sistema**: 164 `loading.tsx` / 246 páginas, contrato único (`<output aria-busy aria-label>` + sr-only "Cargando…") **enforced por test** (`__tests__/skeleton.test.tsx`), primitivos por portal (`LnPageSkeleton` / `OpDashboardSkeleton` / `LnCardSkeleton`) y footprints que espejan el layout real hasta en el alto de fila (72 px = `LnRegRow`). Consistencia de loading states: lograda — F6 es la excepción, no la regla.
2. **La doctrina de navegación está ejecutada, no declamada**: 0 `router.refresh()` runtime, el porqué documentado en cada módulo con historia reproducible (engram #621/#622, verify #650), `lint:nav` en `verify`, y una sola regla escrita de feedback (`action-feedback.ts`: reload-es-la-confirmación XOR toast) que mata la elección ad hoc que el audit-3 había encontrado.
3. **`sheet-nav.ts` como pieza**: push→back / deep-link→replace correctamente asimétricos, `SheetTriggerLink` que intercepta solo el left-click plano y preserva middle-click/copy-link, y comentarios que explican cada rama. (C6 fortaleza 1 — se confirma leyendo el módulo entero.)
4. **Pending states presentes y honestos en los tres forms clave** — disabled + label swap + (en alta) spinner, con `aria-busy`; y el submit del login sobrevive sin JS por diseño documentado.
5. **`useActionRedirect` re-dispara sobre el MISMO destino** (`fireKey` con identidad del estado, `use-action-redirect.ts:23-27`) — el bug clásico del vet re-entrando el mismo código tras un bfcache-back está resuelto y explicado.
6. **CLS 0.0102 y LCP warm 292 ms en la ruta más pesada** (`panorama/perf.json`): la consola no salta al cargar — la base para que P2/P5 discutan lo fino.

---

## 3 Prioridades

**P1 🔴 — Cerrar los agujeros de la doctrina en los success-paths que quedaron en `redirect()` — empezando por el login (F3 + F2).**
(a) Migrar al contrato N3 (return `redirectTo` + `useActionRedirect`): `src/modules/auth/application/login.ts:100,103,124` (el form ya tiene `useActionState`; agregar el hook es una línea), `app/actions/booking.ts:69`, `src/modules/pets/actions.ts:188,434,514,578`, `src/modules/transfers/actions.ts:696`, y auditar los 12 archivos de actions con `redirect(`. (b) Lintearlo: extender `scripts/check-router-refresh.ts` (o un `lint:action-redirect` hermano) prohibiendo `redirect()` tras mutación en `"use server"` — hoy `verify` no ve el agujero. (c) `/recuperar`: sacarla del prerender (`export const dynamic = "force-dynamic"` en `app/(auth)/recuperar/page.tsx`) — misma receta que C3-P1 para la 404; con eso las DOS únicas páginas estáticas del build quedan curadas o cubiertas.
*Archivos*: los citados + `app/(auth)/login/LoginForm.tsx`.

**P2 🔴 — Que el pending sobreviva hasta el documento nuevo (F1).**
Convención transversal de una línea de mecanismo: dentro de `startTransition`, después de `navigateAfterActionSuccess(url)` hacer `await new Promise<never>(() => {})` (la transition queda pending hasta el unload → el botón queda disabled con su label de progreso durante todo el viaje del documento); para los forms `useActionState` + `useActionRedirect`, derivar `const navigating = Boolean(state.redirectTo)` y renderizar `disabled={isPending || navigating}` con label "Abriendo…". Documentarla en `full-page-action-nav.ts` (es el lugar donde ya vive la doctrina) y aplicarla a los call sites patrón: `AcceptTransferActions.tsx`, `MinimalNewPetForm.tsx`, `BulkApprovalQueueList.tsx`, `LoginForm.tsx` post-P1. Bonus del mismo pase: en bandejas, `assign(href)` → `assign(href + '#' + rowAnchor)` o scroll-hint en `sessionStorage` para matar el scroll-reset (F7).
*Archivos*: `lib/ui/full-page-action-nav.ts`, `lib/ui/use-action-redirect.ts`, call sites citados.

**P3 🟡 — Un solo opener de sheets y la palabra visible de vuelta (F4 + F8 + F9 + lección FAIL-click).**
(a) /cuenta: los cuatro `<Link href="?sheet=…">` → `SheetTriggerLink` (`app/(app)/cuenta/page.tsx:255,323,341,390`) — C6-P2 ya lo pedía por el drop; F8/F9 agregan el back muerto y el round-trip evitable. (b) `CitizenTabBar` "Asentar": cuando `petTokenFromPathname(pathname)` resuelve al perfil actual, abrir con `pushSheetUrl` en vez del `<Link>` same-route (`components/layout/CitizenTabBar.tsx:127-134`) — el caso cross-route queda como está. (c) Regla de affordance para el consolidado: *toda acción primaria conserva su palabra visible en la superficie donde se ejecuta* — instancias ya documentadas por otros: CTA del hub (C6-P1), "Dar vuelta"→nombrar destino (C5), y mía: "Exportar" del panorama gana label visible en desktop (el rail tiene ancho: `PanoramaRail.tsx` ya modela `label` por ítem — mostrarlo, o al menos en los ítems de acción vs los de navegación).
*Archivos*: los citados.

---

*Tres superficies, un veredicto: la arquitectura full-document es defendible y está bien amortiguada por el mejor sistema de skeletons que vi en el proyecto — pero filtra en las costuras: dos success-paths enteros (login, recuperar) viajan por mecanismos que el propio repo declaró rotos, y todos los botones de la app se re-habilitan justo cuando el impaciente más necesita que no. Los tres FAIL-click no son ruido del harness: son la misma enfermedad — acciones primarias que perdieron su palabra visible — vista desde tres personas distintas. Nada de esto pide revertir la doctrina; pide terminarla.*

**Conteo**: 🔴 4 (F1 pending-gap · F2 recuperar-CSP · F3 redirect()-survivors · F4 Asentar hot path) · 🟡 6 (F5 loading gaps · F6 skeleton panorama · F7 scroll-reset · F8 back muerto · F9 open round-trip · F10 validación alta) · 🟢 6 fortalezas. Citados sin duplicar: C3 (CSP raíz, `<a>` duros), C6 (U1/U4/C1/C2, fortaleza sheet-nav), C5 (U4 "Dar vuelta"). Declarados `[ENTORNO]`: latencias cloud, tiles OSM, fotos seed, webm inexistentes, selector exacto del pan-FAIL-click.
