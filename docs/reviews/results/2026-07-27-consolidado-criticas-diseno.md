# Consolidado — 14 críticas de diseño en paralelo (tanda 1)

> Ejecuta el plan `docs/reviews/2026-07-26-plan-criticas-diseno.md` (+ ampliación §4b).
> **Método**: app real corrida en el entorno cloud de COWORK (build de HEAD `a1f0ec8f`,
> Postgres nativo + shim GoTrue/Storage, seed demo + panorama: 12.787 mascotas /
> 31.931 eventos / 406 denuncias / 163 casos, cubo refrescado), capturas Playwright con
> estados forzados (3 estados de disclosure, sesiones por persona, mobile 390 + desktop
> 1440/1512), 14 agentes en paralelo con el framework de `/design:design-critique`
> encarnado en la persona de cada scope. Cada crítica cita screenshot + archivo:línea.
>
> **Entorno declarado** (no criticable, marcado `[ENTORNO]` en cada doc): catálogo INDEC
> parcial (fixture 53 + altas manuales), volumen sintético, shim de auth (sin flujos de
> token reales de GoTrue), hardware cloud (tiempos relativos), tiles OSM bloqueados.
> **Incidencias de captura declaradas**: el drill a "Córdoba" nunca ocurrió (dos scripts
> independientes fallaron el mismo click → elevado a hallazgo de affordance); 6/12 shots
> de panorama byte-idénticos por eso; el modal post-alta y la tabs bar del detalle ya no
> existen en HEAD (fichas del plan desactualizadas respecto del churn — anotado).

## 1. Los números

| Crítica | Doc | Hallazgos | 🔴 | 🟡 | 🟢 |
|---|---|---|---|---|---|
| C1 Landing + login | `…critique-landing.md` | 18 | 2 | 8 | 8 |
| C2 Credencial `/p/<token>` | `…critique-credencial.md` | 16 | 2 | 7 | 7 |
| C3 Finder + `/perdidas` | `…critique-finder.md` | 17 | 2 | 7 | 8 |
| C4 Alta + primeros pasos | `…critique-alta.md` | 13 | 2 | 8 | 3 |
| C5 Detalle + libreta | `…critique-libreta.md` | 12 | 3 | 5 | 4 |
| C6 Cuenta + transferencias | `…critique-cuenta.md` | 14 | 1 | 9 | 4 |
| C8 Bandejas operativas | `…critique-operativa.md` | 16 | 3 | 10 | 3 |
| P1 Panorama semántica | `…critique-panorama-semantica.md` | 12 | 4 | 5 | 3 |
| P2 Panorama fluidez | `…critique-panorama-fluidez.md` | 8 | 2 | 4 | 2 |
| P3 Panorama visual | `…critique-panorama-visual.md` | 17 | 3 | 8 | 6 |
| P4 Panorama pulido | `…critique-panorama-pulido.md` | 20 | 2 | 12 | 6 |
| P5 Panorama performance | `…critique-panorama-perf.md` | perfil medido | — | — | — |
| X1 Fluidez transversal | `…critique-fluidez-app.md` | 16 | 4 | 6 | 6 |
| X2 Craft transversal | `…critique-craft.md` | 14 | 2 | 7 | 5 |
| **Total** | | **~193** | **32** | **96** | **65** |

## 2. Hallazgos SISTÉMICOS (el patrón vale más que la instancia)

**S1 · Las acciones primarias perdieron su palabra visible.** Tres FAIL-click del
harness en tres superficies distintas (transferir en /cuenta, navegación del detalle de
mascota, drill de provincia en panorama) + el slot "Asentar" que viaja por el hot path
que `sheet-nav.ts` declaró vedado (X1-F4) + cuatro verbos distintos para el alta
("Inscribir/Cargar/Registrar/Asentar", C4). No es casualidad del harness: dos scripts
independientes fallaron los mismos clicks que fallaría un usuario. → X1 §FAIL-click, C4,
C6, P2-H3.

**S2 · CSP nonce vs rutas prerenderizadas — mecanismo vivo con dos instancias.** La 404
prerenderizada carga con el 100% del JS bloqueado (los 14/25 errores de consola de C3,
causa raíz `middleware.ts:221`), y X1 confirmó la segunda instancia HOY: `/recuperar` —
el flujo de recuperación de contraseña — sale del build prerenderizado con nonce de
build-time. C3 lo predijo textual: "cualquier ruta pública que mañana se prerenderice
muere igual". Falta el guard estructural (test/lint que cruce prerenders del build vs
CSP enforcing). → C3 §Consola, X1-F2.

**S3 · La honestidad de estado se deshace en la última milla de render.** La clase de
defecto que la jornada del 26-07 cazó en datos reapareció en presentación, cuatro veces:
la tile "Cumplimiento observación 10d" rinde "—" neutral con 4 incumplimientos legales
vivos (`presentation-guards.ts:114` pisa el headline breach-aware — deshace en práctica
lo de `988a3cc8`; C8, reproducido en vivo); el panel de cumplimiento sella "VIGENTE"
dosis cuya proyección dice "vigencia desconocida" (`ComplianceObligationsPanel.tsx:58-67`,
C5); las leyendas provinciales publican endpoints falsos (breaks interiores como min/max
— "4…15" sobre mortalidad real 1..63; la rama división se arregló, la provincial no;
`panorama-labels.ts:185-188`, P1-F3); y "oscuro" cambia de bando entre provincia y
localidad en la MISMA vista (`division-fill.ts:265` omite `invert`; P1-F1 + P3). → C8,
C5, P1, P3.

**S4 · Estado de cámara/frame que se filtra entre vistas del panorama.** Veredicto de
P2 con evidencia de código: DEFECTO, no encuadre deliberado — el frame "nacional" de los
deep-links `?preset=` se resuelve contra `layersBbox` (extensión de capas de PUNTO), por
eso desierto/acceso/brotes abren en AMBA@5km bajo caption "Nacional"; el fix v2C del
07-11 arregló exactamente esto en el path "← Volver a Nacional" y el path de preset
quedó como hermano sin arreglar (`SituationalMap.tsx:1036-1044`). Consecuencia extra:
la URL compartible MIENTE (misma URL ≠ misma vista). → P2 (central), P3, P1.

**S5 · Un producto, dos pieles, costuras a la vista.** X2: el sistema Ln (cálido,
serif) / Op (frío, denso) está bien COSIDO por el azul institucional, pero: género de
chips de estado que cambia por portal ("PERDIDO" fijo sobre una hembra vs helpers
sex-correct que ya existen), cinco radios de botón primario contra un canon pill
declarado, ~10 tamaños artesanales de h1 serif, tres gramáticas de confirmación
conviviendo (C6), y chips de bandeja que cada cola inventa (C8). Todo legal para
`lint:tokens` — vive en las 1.980 violaciones grandfathered del baseline. → X2, C6, C8.

**S6 · El producto no se vende en sus momentos clave.** El login es invisible en la nav
mobile ≤560px (C1 🔴); el estado vacío de mis-mascotas no menciona credencial/QR y la
pantalla de éxito del alta pide guardar el QR en el collar sin ofrecer descargarlo/
imprimirlo (C4); la credencial muestra el broken-image nativo si la foto falla
(fallback solo cubre `photoUrl === null`; C2). → C1, C4, C2.

**S7 · El botón revive mientras el documento viaja + `redirect()` vivo en success-paths.**
X1-F1/F3, sistémico sobre la doctrina full-document: el pending muere cuando la action
resuelve y el botón se re-habilita ANTES de que llegue la página nueva (89 call sites,
mayoría sin idempotencia de UI); y `redirect()` — que la propia doc del repo declaró
silently-dropped por el client router (3/3) — sigue vivo en el LOGIN
(`src/modules/auth/application/login.ts:100,103,124`), reservar turno, editar mascota y
match por chip: "Ingresando…" → botón vuelve → nada, intermitente, invisible para
soporte y para `lint:nav` (que caza `router.refresh()` pero no `redirect()` en actions).
→ X1 (central), C6.

**S8 · La libreta del dueño quedó degradada por el churn (regresión funcional).** C5:
los 11 grupos consolidados solo los ve el VETERINARIO por share link; `LIBRETA_FILTER_CHIPS`
quedó huérfano; el dashboard "Estado médico actual" quedó sin caller. Para el dueño,
"¿última desparasitación?" = scroll de hasta 250 asientos. Una feature completa del
sprint quedó colgada sin superficie. → C5 (🔴×3).

**S9 · Hidratación monolítica de la joya.** P5 con números: `PanoramaConsole.tsx` =
5.080 líneas, `"use client"` línea 1, 17 useState / ~187 hooks, hidrata como UNA unidad
→ 12-15 long tasks (1,25-1,75s total, máx 271ms) que ponen INP en riesgo (proyección
>1s en notebook de gobierno, declarada como extrapolación). La carga en sí está sana
(LCP 292-660ms, CLS 0,0102, mapa lazy verificado — maplibre NO va en el eager bundle).
→ P5, P2.

## 3. Top-10 puntuales (por daño, con su archivo)

| # | Hallazgo | Dónde | Crítica |
|---|---|---|---|
| 1 | Login con `redirect()` droppeado → "Ingresando…" y nada, intermitente | `src/modules/auth/application/login.ts:100,103,124` + `LoginForm.tsx` | X1-F3 |
| 2 | Tile de cumplimiento legal en "—" con 4 incumplimientos vivos en pantalla | `presentation-guards.ts:114` | C8 |
| 3 | Libreta del dueño sin grupos/chips/dashboard (solo el vete los ve) | `LIBRETA_FILTER_CHIPS` huérfano + dashboard sin caller | C5 |
| 4 | "VIGENTE" sellado sobre vigencia desconocida (variant "SIN DATO" existe y no se usa) | `ComplianceObligationsPanel.tsx:58-67` | C5 |
| 5 | `/recuperar` prerenderizada con 100% del JS bloqueado por CSP en prod | `.next` build + `middleware.ts:221` | X1-F2 / C3 |
| 6 | Frame "nacional" de presets resuelve a AMBA@5km (layersBbox de capas punto); URL no determinística | `SituationalMap.tsx:1036-1044` (path hermano del fix v2C) | P2 |
| 7 | Leyendas provinciales con endpoints falsos en superficie exportable con sello | `panorama-labels.ts:177-201` | P1-F3 |
| 8 | Polaridad invertida no declarada donde se lee + "oscuro" cambia de bando con el zoom | `SituationalMap.tsx:1415` vs `1462/1488`, `division-fill.ts:265` | P1-F1 / P3 |
| 9 | Login invisible en nav mobile ≤560px (comentario CSS con premisa vieja) | `app/globals.css` | C1 |
| 10 | Suelo perceptual del mapa colapsado: lienzo/tierra/clase-1/sin-dato indistinguibles | `province-choropleth-style.ts` + basemap | P3 |

Menciones que casi entran: chips del header de credencial colisionando a 390px
(`p/[publicToken]/page.tsx:605`, C2); transferencia saliente invisible en la IA (C6);
"Asentar" en loop con 0 mascotas (C4); tres contadores sin reconciliar en Registros
("0" / "0 en 0 unidades" / "72 filas", P4-U1); punto decimal en la brecha
(`PanoramaDataTable.tsx:444`, P4-F1); mini-mapa recortado ocultando la atribución
OpenStreetMap — requisito de licencia (C2); "N días" contando después del cierre (C8);
"Urgencia" ordenando solo la página de 50 (C8).

## 4. Qué NO tocar (funciona, y es la referencia)

El wizard de alta de 2 pasos con bifurcación dueño/cuidador y "No sé" como default
(C4: "ejemplar"); la captura por texto libre de la libreta — antirrábica guardada en
3-5 taps y 2 campos (C5); el fail-closed de la credencial que degrada con elegancia —
página idéntica, 100% accionable, la omisión no parece rotura (C2 — validación directa
de la decisión 0158); el sistema de skeletons ("el mejor sistema de loading del
proyecto", X1) y la doctrina full-document en sí — ningún doc pide revertirla, piden
terminarla; el layout del panorama (mapa al 71%, chrome ≤20%) y su carga (LCP<700ms,
CLS 0,01, mapa lazy); la arquitectura de la pregunta rectora en bandejas (C8 elogia el
banner rojo + la card); las dos pieles Ln/Op como decisión (X2: bien documentada y
cosida — el problema son las costuras, no las pieles); es-AR consistente en casi toda
cifra (P4 encontró exactamente UN punto decimal vivo).

## 5. Handoff a Claude Code — orden sugerido

**Lote A — correcciones quirúrgicas de verdad-en-pantalla (días):** top-10 #2, #4, #7,
#8 + label "sin atención registrada" (P1-F2) + "un solo reloj" (P1-F4) + punto decimal
(P4-F1). Ninguna pide rediseño; todas tienen fix con archivo:línea en su doc.

**Lote B — los agujeros de la doctrina de navegación (días, alto impacto):** #1 login →
contrato N3 (`redirectTo` + `useActionRedirect`); auditar los 12 archivos de actions con
`redirect(`; un lint que lo cace (el agujero es invisible para `verify` hoy); pending
que sobreviva hasta el unload (X1-P2); `/recuperar` → force-dynamic o nonce-free (#5);
guard estructural CSP×prerender (S2).

**Lote C — recuperar lo perdido (días):** libreta del dueño (#3 — recablear grupos,
chips y dashboard a la vista owner); frame nacional de presets (#6 — la misma solución
que v2C ya aplicó al path de back); transferencia saliente en la IA (C6).

**Lote D — sistema visual (continuo, con el baseline como ratchet):** canon de radios y
h1 (X2), género de chips (helpers existentes), gramática única de confirmación (C6),
anatomía única de chips de bandeja (C8), suelo perceptual del mapa (#10 — separación
lienzo/tierra/sin-dato/clase-1).

**Lote E — estructural (planificar):** partir la unidad de hidratación del
PanoramaConsole en islands (P5, criterio: ninguna long task >200ms), medir INP real con
throttling 4x como gate.

**Re-runs pendientes de captura** (deuda de esta tanda, no del producto): drill
provincia→departamento vía dropdown (el click por texto no existe — S1), estados
forzados de censored/stale-frame, dark-mode N/A (light-only por decisión, confirmado en
código), org portal + admin ops (tanda 2 del plan), pase `/design:accessibility-review`
sobre superficies estables post-fixes.

## 6. Sobre el proceso (para la próxima tanda)

Dos fichas del plan estaban desactualizadas respecto del churn real (tabs bar del
detalle ya no existe; modal post-alta ahora es página) — señal de que las críticas
tienen que correr MÁS seguido, no más grandes. Los agentes detectaron sus propias
capturas degradadas (md5 idénticos) y lo declararon en vez de inventar — el patrón
[ENTORNO] + "declará lo no verificado" funcionó y queda como estándar para tanda 2.
