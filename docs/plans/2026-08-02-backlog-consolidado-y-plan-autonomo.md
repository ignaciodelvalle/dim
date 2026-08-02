# Backlog consolidado y plan autónomo — 2026-08-02

> **EJECUTADO 2026-08-01/02** (corrida autónoma, 6 pistas, ~44 commits, review
> adversa PUSH-READY, gate final verify + 13.850 tests verdes).
> Resultado por tier: T1 completo (T1.2 resultó ser el "actual" de
> suscripciones calculado nacional — scoping arreglado en la evaluación);
> T2 completo (T2.1/T2.3/T2.5 eran una sola clase: dato viejo sin indicador de
> vuelo; T2.4 era timezone UTC vs UTC-3, baseline de timezone quedó en CERO);
> T3.1/T3.2 completos (shell síncrono + presupuesto por consulta), T3.3 resuelto
> de rebote, T3.4/T3.5 NO REPRODUCEN (artefactos de la automatización de cowork);
> T4: 10 arreglados, T4.2/T4.8/T4.12 ya estaban arreglados, resto diferido con
> razón en el informe; T5 completo; T6: RA-7 F4 cerrado, F5/F6/F7 **ya estaban
> cerrados en código** (este doc estaba desactualizado — ver PENDIENTES.md).
> Pendientes del PO sin tocar: T7.3 tokens, T7.4/T7.5 datos staging, T7.6 kill
> elevado del puerto 3000. Los `alert_firings` históricos conservan el
> `observedValue` nacional (append-only, no se repara).

Reanálisis completo. **Todo lo abierto entra acá**: los 42 hallazgos de la auditoría
de cowork, lo que quedó de hoy, el `PENDIENTES.md` histórico (P1/P2/P3), y lo
diferido hace tiempo. Lo que no entra al plan está **explícitamente diferido con
su razón** — no hay categoría "se nos pasó".

## Cómo leer los estados

| Estado | Significa |
|---|---|
| **VERIFICADO** | Reproducido con evidencia. Causa raíz conocida. |
| **REPORTADO** | Cowork lo vio y documentó. Yo no lo verifiqué todavía. |
| **HIPÓTESIS** | Tengo una explicación plausible sin confirmar. Se verifica antes de tocar. |
| **DIFERIDO** | No entra, y abajo dice por qué. |

Regla que rige todo el plan: **verificar antes de arreglar**. Hoy casi mando dos
diagnósticos equivocados (el `UNION ALL` y el deploy-durante-auditoría) y en los
dos casos los datos los mataron. El costo de verificar es minutos; el de arreglar
lo que no está roto es una regresión la noche antes de una demo.

---

# PARTE I — EL BACKLOG

## 🔴 Tier 1 — Números que mienten

Lo único que hace que un funcionario **cite algo falso**. Todo lo demás lo
incomoda; esto lo compromete.

| # | Qué | Estado | Dónde |
|---|---|---|---|
| **T1.1** | `SLA ENO · Mediana 287.432300277778 h` — interpolación cruda de un float. Cowork no pudo saber si son 287 mil horas o 287,4 | **VERIFICADO** | `lib/metrics/targets.ts:238` |
| **T1.2** | La alerta de esterilización de CABA muestra **36,4** — el valor **nacional** — bajo etiqueta CABA. Padrón dice 37,0%, Alertas dice 38 | REPORTADO | alertas / `lib/metrics` |
| **T1.3** | Adopciones: título "Tiempo **promedio** y percentil 75", columnas "**Mediana** \| P75". Uno de los dos miente | REPORTADO | `app/admin/adopciones` |
| **T1.4** | Outbox: 13 filas `ENTREGADO` con INTENTOS = "Sin intentos" | REPORTADO | `app/admin/outbox` |
| **T1.5** | Panorama: entrada por menú rotula "Últimos 90 días" y muestra 3.778; entrando por Vista, 1.863 | REPORTADO | `app/admin/panorama/page.tsx` |
| **T1.6** | Vista "personalizada" al primer ingreso, con banner "Editaste la vista" que nadie editó — estado persistido de otra sesión | REPORTADO | estado de cliente del panorama |

**T1.5 y T1.6 son probablemente el mismo bug.** Traza parcial: `PANORAMA_DEFAULT_PRESET
= "3y"` (`lib/metrics/period-presets.ts:115`) convive con la ventana del preset en
el mismo render. **Descarté** que el KPI reciba la ventana de 3 años en un primer
ingreso limpio: el bloque `if (seedPreset)` hace `return` adentro y usa `seedPeriod`
(90d). Queda como principal sospechosa la **restauración de estado persistido**, que
es justo lo que T1.6 describe. Verificar los dos juntos.

## 🟠 Tier 2 — El reloj del Panorama

Cowork cerró la Parte 1 con *"un reloj en el que no se puede confiar"*. Es un tema,
no cuatro bugs sueltos.

| # | Qué | Estado |
|---|---|---|
| **T2.1** | Con play, el strip de KPIs queda clavado mientras mapa y Registros viajan | REPORTADO |
| **T2.2** | Con scrub manual el strip **sí** viaja, pero el subtítulo "acumulado" queda en presente **dentro de la misma tarjeta** | REPORTADO |
| **T2.3** | Al "Volver al último evento", el strip sigue mostrando el pasado ~20 s antes de autocorregirse | REPORTADO |
| **T2.4** | Off-by-one en el rótulo as-of: header "al 7 de mayo", panel "08 de may", URL `asOf=2026-05-08` (×4) | REPORTADO |
| **T2.5** | Durante la actualización, el velo k<5 publica el valor del período **anterior** rotulado como actual (~8 s) | REPORTADO |
| **T2.6** | Header "Estado actual" con URL `period=90d` en ≥6 vistas de cobertura | REPORTADO |
| **T2.7** | Cambiar de vista cambia el período en silencio | REPORTADO |

## 🟡 Tier 3 — Plataforma

| # | Qué | Estado |
|---|---|---|
| **T3.1** | `/admin/sistema` **no cuelga: tarda**. Render de servidor sin presupuesto ni parcial — retiene el shell hasta resolver todo. Local <25 s; staging >34 s, que fue el límite de paciencia de cowork | **VERIFICADO** (reproducido con navegador en :3001) |
| **T3.2** | Mismo patrón en Inteligencia (timeout 18 s, Reintentar colgado) y Auditoría (~20 s, recarga la trae) | REPORTADO |
| **T3.3** | Con una página resolviendo, el menú se traga los clicks | **HIPÓTESIS**: navegación encolada detrás del Server Component en vuelo. El control no miente, pero tampoco avisa — para el usuario es lo mismo |
| **T3.4** | 176 excepciones de consola: React #418 (hidratación) y `TypeError: null parentNode` | REPORTADO |
| **T3.5** | Deep-links del Panorama que no montan al reabrirlos | REPORTADO, **cowork lo marcó A VERIFICAR** y sospecha de su automatización |
| **T3.6** | Latencias del strip 8–24 s; primera carga ~30 s | REPORTADO |

El Panorama ya resolvió esta clase con `withDbBudget` + esperar solo la capa del
mapa. `Sistema` no tiene nada de eso. **La solución existe en el repo.**

## 🟢 Tier 4 — Claridad y honestidad de la lectura

| # | Qué |
|---|---|
| **T4.1** | Referencias no explica los círculos, la trama punteada, el "⊘ k<5", ni distingue **sin datos / protegido / cero**. *Es la mitad que quedó abierta de lo que arreglé hoy en la píldora* |
| **T4.2** | Modo del mapa: el botón muestra la **acción**, no el estado ("Per cápita" mientras el mapa pinta conteos) |
| **T4.3** | El ranking no acompaña el modo per cápita (está rotulado, y aun así mapa y tabla cuentan historias opuestas) |
| **T4.4** | Badge "Registros N" cuenta filas/unidades, no eventos: Nacional 24, Córdoba 25 — el subconjunto "mayor" que el todo |
| **T4.5** | Handoff a la acción pierde el filtro de la unidad clickeada |
| **T4.6** | "Volver a Nacional" no responde con el drawer abierto (11 s, sin aviso) |
| **T4.7** | "Último evento en el alcance" queda pegado al valor del drill |
| **T4.8** | KPIs "en el período" con el selector en placeholder "Seleccionar período" |
| **T4.9** | "Moderación" del menú Admin cambia de portal sin aviso (badge UNIVERSAL→NACIONAL) |
| **T4.10** | Briefing: "↑ Sube +100%" sobre **n=2** |
| **T4.11** | Frescura dispareja entre pantallas (3:30 p.m. vs 4:58 vs 5:08) sin marca de caché |
| **T4.12** | Alertas: promete marca de breach a los 3 días; la fila de 25 días no la tiene |
| **T4.13** | Observaciones: 18 de 19 sin "Cierre estimado"; un dueño como email crudo |
| **T4.14** | Casos: badge "22 DÍAS" con umbral no declarado; "—" y "Animal sin registrar" para el mismo vacío |
| **T4.15** | Novedades: pares duplicados por localidad, badges "2" sin rótulo |
| **T4.16** | Inteligencia: decimales en formato inglés ("65.5%") conviviendo con la coma |

## 🔵 Tier 5 — Idioma y pulido

| # | Qué |
|---|---|
| **T5.1** | Desglose "Por tipo" en inglés crudo: `abandonment 7, neglect 10, physical_abuse 1…` |
| **T5.2** | "TUS 1 DEPARTAMENTOS" (posesivo + concordancia) |
| **T5.3** | "hace **1 días**" ×3 |
| **T5.4** | "Cerrada **POSITIVA**" vs "Cerrada negativa" |
| **T5.5** | Flecha ASCII `->` entre flechas → |
| **T5.6** | `caba(CABA)` y `1(0%)` sin espacio; "· ·" doble separador |
| **T5.7** | `método=linear` sin traducir |
| **T5.8** | Siglas sin glosario: **ENO**, "(C1)", "(C7)" |
| **T5.9** | Tres nombres para la misma ventana: "12 meses" / "Último año" / `trailing12m` |
| **T5.10** | Comas huérfanas de tono (", Normal", ", Atención") que un lector de pantalla lee |
| **T5.11** | La diferencia entre las dos bases temporales no se explica hasta activar la segunda |

## ⚫ Tier 6 — Deuda estructural (`PENDIENTES.md`)

Preexistente a esta ola. **Entra al análisis, y la mayoría sale diferida** — pero
por decisión escrita, no por olvido.

**P1 — rompe algo sin cola:** RA-2 F4 (firmar un chip distinto deja el canónico
intacto en silencio) · RA-2 F5 · RA-2 F9 (capacidad concedida inerte + mensaje
falso) · RA-2 F10 · RA-7 F4 (un cambio de nivel fallido dice "sin datos" donde su
propio docblock lo prohíbe).

**P2 — el gate miente:** 10 archivos `"use server"` invisibles a los tres linters ·
`check-authz-scoping` se derrota con un comentario · `check-rls-coverage` no mira
contenido · 8 políticas sin cláusula `TO` · `middleware.ts` no autoriza · `lint:nav`
prohíbe solo `router.refresh(` con 20 sitios vivos · cuatro fences con copia
byte-idéntica de `stripComments` · e2e no es gate (33 rojas, 30 preexistentes) ·
el presupuesto de login por email · `cube-parity` vacuo · RA-4 F8/F9 (tests que
nunca ejecutan su aserción).

**P3 — el panorama contándose distinto:** RA-7 F5 ("se midieron 10" cuando midió
24) · RA-7 F6 (cuatro respuestas a "cuántas celdas protegidas") · RA-7 F7.

## 🟣 Tier 7 — Datos y manual (PO)

| # | Qué | Estado |
|---|---|---|
| **T7.1** | 27 fotos: 24 de `/perdidas` + 3 de adopción | lista lista, `docs/plans/2026-08-01-lista-fotos-demo.md` |
| **T7.2** | Renombrar `CursorPet-001` — tarjeta **#1** de `/perdidas` | SQL de una línea, en el mismo doc |
| **T7.3** | Tokens `PANO-HIST-*` en 22 de 24 credenciales | **decisión del PO**: reescribir `public_token` invalida QRs ya generados |
| **T7.4** | Poblar las 4 vistas muertas del Panorama, dejando las 2 veterinarias parciales | **plan completo aprobado** en `bubbly-forging-hennessy.md` |
| **T7.5** | Texto `PANO-HIST-WEL-001022` en el PDF del MPF | recarga de datos |
| **T7.6** | Matar el proceso del puerto 3000 (build muerto) — `taskkill /PID 36372 /T /F` elevado | local, no afecta la demo |

---

# PARTE II — PLAN AUTÓNOMO

## Regla de territorio

Norma del proyecto: **escritores paralelos solo en worktrees**, con territorio de
archivo disjunto y merge serial. Las pistas de abajo están cortadas para que no se
pisen. El orquestador decide cuántas lanza según lo que encuentre; si dos pistas
convergen en un archivo, **serializa** — no negocia.

## Fase 0 — Verificación (bloqueante, secuencial, ~30 min)

Nada se arregla antes de esto. Sale un informe con estado por ítem.

1. Levantar QA (`qa-up.ps1 -Port 3001` si 3000 sigue tomado) y **confirmar que el
   build servido coincide con HEAD** — el script lo verifica solo.
2. Reproducir con navegador y consola abierta, midiendo tiempos: **T1.2** (los tres
   valores de CABA en las tres pantallas), **T1.5+T1.6** (entrada por menú vs por
   Vista, con y sin estado persistido — probar en ventana limpia), **T2.1/T2.3**
   (play y vuelta al presente, cronometrando los ~20 s), **T3.5** (deep-link en
   pestaña nueva — el que cowork no pudo descartar).
3. Marcar cada uno CONFIRMADO / NO REPRODUCE / DISTINTO A LO REPORTADO.

**Lo que NO reproduzca no se arregla.** Se documenta con lo que se vio.

## Pistas paralelas (el orquestador decide cuáles y cuántas)

| Pista | Territorio | Contenido | Depende de |
|---|---|---|---|
| **A · Números** | `lib/metrics/*`, `app/admin/{adopciones,outbox}` | T1.1, T1.3, T1.4, y T1.2 si Fase 0 lo confirma | Fase 0 (solo T1.2) |
| **B · Reloj** | `app/admin/panorama/page.tsx`, `PanoramaConsole.tsx`, estado persistido | T1.5+T1.6, T2.1–T2.7 | Fase 0 |
| **C · Plataforma** | `app/admin/{sistema,inteligencia}`, auditoría | T3.1, T3.2 — reusar `withDbBudget` del panorama | nada |
| **D · Referencias** | `MapLegends.tsx` | T4.1 — reusar `BivariateMatrix`, `HATCH_SWATCH_CSS`, `NO_DATA_SWATCH_CSS`, `frameHasSuppressedMark` | nada |
| **E · Idioma** | copy y catálogos, disperso | T5.1–T5.11 | nada |
| **F · Claridad** | pantallas admin, disperso | T4.2–T4.16 | conflicto probable con B y C — **serializar después** |

**B y C no pueden correr juntas sin worktree**: las dos tocan rutas de admin y B
toca `PanoramaConsole`, que ya está en el ratchet de tamaño.

**A, D y E sí son genuinamente paralelas** — territorios disjuntos, sin estado
compartido. Ese es el trío que yo lanzaría primero.

## Reglas para cada pista

- **`pnpm verify` verde antes de commitear.** Sin excepciones.
- **El fence de tamaño se obedece extrayendo, nunca subiendo el baseline.**
  `PanoramaConsole` y `SituationalMap` están al límite; la pista B casi seguro va a
  tener que extraer. Precedentes de hoy: `BivariateMatrix`, `LegendCaptionBlock`,
  `province-chrome`, `owner-pending-counts`.
- **Un test que no falla contra el código viejo no prueba nada.** Verificar las dos
  direcciones antes de dar por bueno un test de regresión.
- **Nunca filtrar la salida de la suite con `rg` para leer el exit code.** Hoy eso
  convirtió una suite roja en `exit 0` y perdí el nombre del archivo que falló.
- Cursor como revisor fresco antes de pushear el rango, si tiene crédito.

## Fase final — integración serial

Merge de a una pista, `pnpm verify` + suite completa entre cada una, push al final.

---

# PARTE III — LO QUE SE DIFIERE, Y POR QUÉ

Cada uno con su razón. Ninguno "se nos pasó".

| Ítem | Por qué se difiere |
|---|---|
| **T3.4 — 176 excepciones de consola** | React #418 es hidratación. Tocar hidratación sin un caso reproducible aislado es cómo se rompen pantallas que hoy andan. **Se difiere hasta tener una ruta que las produzca de forma determinista**; la Fase 0 puede darla gratis. |
| **T3.5 — deep-links** | Cowork mismo lo marcó A VERIFICAR y sospecha de su automatización: "Cargando…" sin errores de consola, con la pestaña original viva. **Se verifica a mano en Fase 0**; si no reproduce, se cierra sin tocar código. |
| **T3.6 — latencias 8–24 s** | Staging es Vercel + base gratuita. Real como experiencia, pero optimizar contra un entorno cuyo perfil no es el de producción es afinar el instrumento equivocado. Lo que sí entra es **T3.1/T3.2**, que es estructura (falta de presupuesto), no velocidad. |
| **T6 P1 — RA-2 F4/F5/F9/F10** | Son de organizaciones y microchip, superficies que **la demo no toca**. F4 (el chip que no se actualiza en silencio) es el más grave del grupo y merece entrar en la ola siguiente, no en esta. |
| **T6 P1 — RA-7 F4** | Sí entra: es del Panorama y dice "sin datos" donde su docblock lo prohíbe. **Va en la pista B.** |
| **T6 P2 — fences de authz** | Un ratchet de crecimiento vale en proporción a la tasa de **nuevas** server actions. Durante un freeze esa tasa es cero. Decisión ya tomada hoy; se mantiene. |
| **T6 P2 — e2e como gate** | Bloqueado por el presupuesto de login **por email** (5/min, 20/hora, ~20 specs compartiendo cuentas semilla). El arreglo es infraestructura de test —cuenta por spec o tope en entorno de test—, no un bug. Ola aparte con su propio diseño. |
| **T6 P2 — los cuatro `stripComments` duplicados** | Mecánico y de bajo riesgo. **Candidato ideal para la pista E** si sobra tiempo. |
| **T6 P3 — RA-7 F5/F6/F7** | Misma familia que el reloj: el panorama contándose distinto a sí mismo. **Van en la pista B** si el presupuesto alcanza; si no, primera de la ola siguiente. |
| **El logo** | Concepto aprobado (huella con perro y gato). Necesita redibujo vectorial que sobreviva a 16px y un color. Decisión del PO: después de la demo, bien hecho. |
| **Micro-tipografía 8px de la credencial** | Contraste medido, pasa AA (5,24:1). El problema es el tamaño, y cambiarlo mueve el layout de la credencial insignia. **Necesita ojo del PO, no un arreglo a ciegas.** |
| **T7.3 — tokens PANO-*** | Reescribir `public_token` invalida cualquier QR ya generado. En staging probablemente no cuesta nada, pero **es decisión del PO**, no mía. |
| **El archivo de test que falló una vez** | **CERRADO hoy.** Era `subject-rights-rpcs`: traía 1,7M payloads JSONB a Node y filtraba en JS. Arreglado en `025e83e0`. |

---

# ESTADO AL CERRAR

- **Gate verde.** Suite completa 13.749 tests, 1138 archivos.
- **`025e83e0` commiteado y SIN PUSHEAR** — el barrido de mascotas huérfanas y el
  fix de las 1,7M filas de auditoría. Primera acción de la próxima sesión: pushearlo.
- Staging: datos coherentes (317 perdidas, 465 expedientes, 19 en observación),
  con el orden de `/perdidas`, la barra de contexto, la matriz 3×3, un solo
  punteado y la línea de tiempo en dos pasos.
- Puerto 3000 local sirviendo un build muerto; 3001 sano.
