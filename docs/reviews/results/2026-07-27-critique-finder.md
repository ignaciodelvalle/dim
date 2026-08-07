# Crítica de diseño: Flujo finder + catálogo /perdidas (C3)

> **Plan**: `docs/reviews/2026-07-26-plan-criticas-diseno.md` §4 · ficha C3
> **Persona**: finder con el perro EN LA MANO, en la vereda, apurado, una sola mano libre.
> **Pregunta rectora**: ¿cuántos taps/decisiones hasta "ya avisé"?
> **Evidencia visual**: `docs/reviews/results/2026-07-27-critique-screenshots/finder/` — `desk-encontre.png`, `mob-encontre.png`, `mob-encontre-full.png`, `desk-perdidas.png`, `desk-perdidas-full.png`, `mob-perdidas.png`, `desk-console.json`, `mob-console.json`.
> **`[ENTORNO]`**: datos sintéticos — todas las cards sin foto (seed sin attachments), sin raza/color, sin avistajes, todo con antigüedad "hace 1-2 meses" y KPIs 24h/7d en 0. Nada de eso es hallazgo per se; sí lo es cómo el diseño *responde* a esos vacíos.

## LIMITACIÓN DECLARADA (leer antes que nada)

El bundle capturó `/encontre` como URL top-level — **y esa ruta no existe**: ambas capturas del "wizard" son la página 404 (`desk-encontre.png`, `mob-encontre.png`). El flujo finder real vive **bajo la credencial**: `/p/<token>/encontre` (la tengo conmigo) y `/p/<token>/sighting` (la vi nomás), con el fork en la credencial pública. Por lo tanto:

- **Verificado visualmente**: el 404 de `/encontre` (desktop + mobile), `/perdidas` (desktop fold + full + mobile fold), y las consolas.
- **Evaluado SOLO desde código** (sin verificación visual): el fork "lo tengo yo / lo vi nomás" (`components/pet-profile/PublicLostSections.tsx`, `app/(public)/p/[publicToken]/CredentialActionBar.tsx`), el formulario de posesión (`app/(public)/p/[publicToken]/encontre/FinderInPossessionForm.tsx`), el de avistaje (`app/(public)/p/[publicToken]/sighting/PetSightingForm.tsx`), sus estados de éxito, el mapa `LocationFields` y la foto con cámara. Todo hallazgo sobre esas superficies queda marcado **[CÓDIGO, sin verificar visual]** y pide re-captura en la próxima tanda.
- **Sin evaluar**: comportamiento real del picker de mapa a una mano, permisos de GPS, estados de error de submit.

---

### Impresión general

**Primeros 2 segundos en `/perdidas` (desktop)**: funciona. "Mascotas **perdidas**" en serif con el acento rojo, una bajada que dice exactamente qué hacer ("abrí su credencial y dejá tu contacto — el dueño recibe la notificación al instante") y contadores institucionales. Se lee como un tablón oficial de búsqueda, no como Facebook de mascotas. La confianza está.

**Primeros 2 segundos en `/encontre`**: un signo de pregunta celeste y "No encontramos esta página" (`desk-encontre.png`). La URL que el propio plan del equipo consideraba la puerta del flujo finder no existe, y el 404 raíz no ofrece ningún camino hacia "encontré una mascota" — un solo botón "Volver al inicio". Para la persona con el perro en brazos, esto es un callejón sin salida con 13 errores rojos en la consola (ver sección de errores).

**El flujo real, leído del código, es mejor que su reputación**: no hay "wizard" de pasos — cada rama es UN formulario de una pantalla con mínimos requeridos (avistaje: solo la ubicación; posesión: ubicación + estado + disponibilidad), GPS a un tap y todo lo demás opcional y colapsado. El problema de este flujo no es de fricción interna sino de **puertas**: la entrada canónica depende 100% de escanear el QR o de encontrar la mascota en el catálogo; la URL adivinable no existe y el catálogo mobile entierra las cards bajo dos pantallas de estadística y filtros.

**Taps hasta "ya avisé"** (respuesta a la pregunta rectora, derivada de código):

| Camino | Taps/decisiones | Veredicto |
|---|---|---|
| QR en la chapita → credencial → "La tengo conmigo" → GPS → estado → "indefinidamente" → enviar | **~6 taps, 2 decisiones reales** | Muy bien para un flujo con custodia |
| QR → credencial → "La vi cerca de acá" → GPS → enviar | **~4 taps, 0 decisiones** (fecha pre-cargada con "ahora") | Excelente |
| Sin QR: landing → "Encontré una mascota" → `/perdidas` → scroll/filtros → card → credencial → fork → form | 3 navegaciones + scroll largo en mobile | Aceptable, pero el catálogo mobile lo encarece (ver Jerarquía) |
| URL directa `/encontre` (link viejo, cartel, memoria) | **∞ — 404 sin rescate** | Roto |

---

### Usabilidad

| # | Sev | Hallazgo | Evidencia | Archivo |
|---|---|---|---|---|
| U1 | 🔴 | **`/encontre` no existe y el 404 raíz no rescata al finder.** El plan interno, y por lo tanto potencialmente cartelería/material impreso, asumen esa URL. El 404 genérico ("No encontramos esta página") ofrece solo "Volver al inicio"; la variante brandeada del grupo público (`app/(public)/not-found.tsx`) sí tiene CTA "Ver mascotas perdidas" → `/perdidas`, pero una URL inexistente cae en el 404 raíz, que no la tiene. Nada dentro de la app linkea a `/encontre` (la landing manda "Encontré una mascota" → `/perdidas`, `components/landing/CrisisBand.tsx:67`), así que el riesgo es de links externos/stale — pero el fix es un redirect de una línea. | `desk-encontre.png`, `mob-encontre.png` | `next.config.ts` (sin `redirects()`), `app/not-found.tsx`, `app/(public)/not-found.tsx:12` |
| U2 | 🟡 | **"¿Hasta cuándo podés cuidarla?" es requerido y solo ofrece dos extremos**: un `datetime-local` (calendario + hora con una mano, en la vereda) o el compromiso "Puedo tenerla indefinidamente". El finder apurado no sabe hasta cuándo; el error client-side lo frena: "Indicá hasta cuándo podés cuidarla o marcá que podés tenerla indefinidamente." Faltan atajos ("unas horas", "hasta esta noche", "no sé — que me llamen"). **[CÓDIGO, sin verificar visual]** | — | `FinderInPossessionForm.tsx:92-102, 254-287` |
| U3 | 🟡 | **El fork colapsa a un solo verbo en el sticky mobile.** `CredentialActionBar` pre-resuelve UNA acción primaria (encontre si el dueño lo permite, si no sighting); la opción de menor compromiso "La/Lo vi cerca de acá" queda solo como chip outline dentro de la card, arriba. Para ESTA persona (perro en mano) el verbo fijado es el correcto; para el que "lo vio nomás", el sticky lo empuja a la rama de custodia. Los verbos en sí ("La tengo conmigo" vs "La vi cerca de acá") comunican bien la diferencia sin subtítulo. **[CÓDIGO, sin verificar visual]** | — | `CredentialActionBar.tsx:50-62`, `PublicLostSections.tsx:176-191` |
| U4 | 🟡 | **Filtro temporal con tres vocabularios para una sola dimensión.** El panel pregunta "¿Cuándo se perdió?", los chips rápidos dicen "Visto hoy / Esta semana", y ambos filtran por `markedLostAt` (cuándo el dueño lo REPORTÓ perdido). "Visto hoy" promete avistajes que el sistema no está filtrando — el finder que busca "perros vistos hoy en mi zona" recibe "reportados como perdidos hoy". | `desk-perdidas.png` (panel + chips) | `lib/infra/lost-listing.ts:25-34`, `app/(public)/perdidas/page.tsx:259-267`, `LostFiltersBar.tsx:132` |
| U5 | 🟡 | **La card no responde "¿es este el perro que vi?" cuando faltan raza/color**: el fallback es la palabra "Mascota", descartando `item.species` que el tipo YA trae (`LostListingItem.species`). Con seed vacío TODAS las cards dicen "Mascota" `[ENTORNO amplifica, pero el fallback es real]`: en producción, un perro sin raza/color cargada tampoco diría "Perro". El filtro COLOR invita a filtrar por un dato que la card después no muestra para verificar. | `desk-perdidas-full.png` (24 cards "Mascota") | `app/(public)/perdidas/page.tsx:374`, `lib/infra/lost-listing.ts:89` |
| U6 | 🟢 | **Placeholder "Elegí una provincia" bajo el label LOCALIDAD** se lee como bug de copy-paste (y en mobile queda cortado: "Elegí una provinci"). Significa "primero elegí provincia" (el campo está `disabled` hasta entonces), pero no lo dice. | `mob-perdidas.png`, `desk-perdidas.png` | `LostFiltersBar.tsx:105` |
| U7 | 🟢 | **"Mostrar más" pagina reemplazando, no agregando**: es un `<Link>` a `?cursor=…` que navega a la página siguiente — las 24 cards anteriores desaparecen. El label promete acumulación. Honesto trade-off del patrón server-first, pero el copy debería ser "Siguientes 24" o el patrón conservar lo visto. | `desk-perdidas-full.png` (botón al pie) | `app/(public)/perdidas/page.tsx:170-178` |
| U8 | 🟢 | **La foto opcional está colapsada en `<details>`** en ambos formularios. Para confirmar identidad la foto "ayuda muchísimo" (dice el propio microcopy) — un input de cámara visible (ya tiene `capture="environment"`, un solo tap a la cámara) rendiría más que el acordeón. **[CÓDIGO, sin verificar visual]** | — | `PetSightingForm.tsx:127-148`, `FinderInPossessionForm.tsx:308-329` |
| U9 | 🟢 | **EXIF: el sistema hace lo correcto y no lo cuenta.** No existe el "EXIF viewer" que asumía la ficha del plan; las fotos del finder se re-encodean con sharp descartando GPS/metadata server-side (privacidad bien resuelta). Ningún copy se lo dice al finder ("la foto no revela tu ubicación") — reassurance gratis que hoy se pierde, justo en un flujo donde el finder puede dudar de sacar la foto. | — | `lib/infra/uploads.ts:94-107,149-160`, `app/(public)/p/[publicToken]/encontre/action.ts` |

---

### Jerarquía visual

**En `/perdidas` mobile, la evidencia está dos pantallas abajo.** El orden es: título de dos líneas → bajada de 5 líneas → 3 tarjetas KPI apiladas (2+1, la tercera huérfana) → panel de filtros de ~6 campos → chips → recién ahí la primera card (`mob-perdidas.png`: en 390×844 no se ve NINGUNA mascota; el fold termina en "¿Cuándo se perdió?"). La persona vino a responder "¿es este el perro?"; el layout le contesta primero cuántas mascotas hay ("Activas ahora 28") y cuántas no hay ("Nuevas en 24h: 0"). Los KPI sirven a la narrativa institucional (y al funcionario), no al finder — grid en `page.tsx:119-123`, siempre antes del contenido.

**En las cards, la ausencia grita más que la presencia.** La línea "Sin ubicación de avistaje registrada" es *italic* `text-sm` (`page.tsx:391-394`) mientras que el contenido real de "Visto por última vez" es `text-xs` (`page.tsx:383-388`): el estado vacío usa cuerpo MAYOR que el dato que reemplaza. La decisión de decir la ausencia explícitamente está bien argumentada en el comentario del código (en un tablón de perdidos, la falta de última ubicación es decision-relevant) — pero repetida en 24 cards `[ENTORNO]` forma un muro de "no hay dato" que compite con los nombres. Bajarla a `text-xs` y quitarle la itálica la pone en su lugar.

**Lo que sí está bien jerarquizado**: el pennant PERDIDO/A arriba-izquierda + chip de antigüedad arriba-derecha sobre la foto; nombre grande; zona a la derecha; un solo CTA por card ("Ver credencial →"). La urgencia **ordena de verdad, no decora**: el listado sale por `markedLostAt desc` (`src/modules/lost/infrastructure/lost-listing-read.ts:188`) y el chip gradúa crítico=rojo / reciente=ámbar / viejo=gris (`page.tsx:327-332`), con banda roja superior solo cuando hay críticas en 24h (`page.tsx:84-100`). En las capturas todo es gris "HACE 1 MES" `[ENTORNO: no hay datos frescos; la gradación no pudo verse ejercitada]`.

---

### Errores de consola (agrupados, con causa probable)

**Total: 14 en desktop, 25 en mobile. Tras agrupar: son UN solo bug con eco, más un 404 esperado.**

| Grupo | Desktop | Mobile | Qué es |
|---|---|---|---|
| A. `Failed to load resource: 404` | 1 | 1 | El documento `/encontre` devolviendo HTTP 404. Esperable para una ruta inexistente — el error real es U1, no este log. |
| B. `Refused to load the script '/_next/static/chunks/…' … violates script-src 'self' 'nonce-…'` | 12 | 22 (12 + 10 en dos cargas) | **Todos los chunks del runtime** (webpack, main-app, layout, error, global-error, not-found) bloqueados por CSP en la página 404. |
| C. `Refused to execute inline script … 'nonce-…' 'strict-dynamic'` | 1 | 2 (1 por carga) | El bootstrap inline de Next, bloqueado por el mismo motivo. |

**Causa probable (verificada en código)**: `middleware.ts` acuña un nonce **por request** (`:102`) y desde el barrido "cero violaciones" el header del response es **enforcing**: `response.headers.set("Content-Security-Policy", csp)` (`middleware.ts:221`). Las páginas dinámicas reciben el nonce estampado en sus `<script>` y pasan limpias — por eso `/perdidas` (con `force-dynamic`, `page.tsx:37`) registra **cero errores** en ambas viewports. Pero la página 404 es **prerenderizada en build**: su HTML no puede llevar el nonce del request → el browser rechaza el 100% de sus scripts. La página se ve (SSR) y su único link funciona de casualidad (es un `<a>`), pero llega muerta: sin hidratación, sin error boundaries, y con 13 errores rojos por carga. Los 25 de mobile son el mismo grupo **dos veces** porque el harness navegó dos veces (captura normal + full-page; `mob-encontre.png` y `mob-encontre-full.png` son bytes idénticos). El barrido pre-enforcement que cita el comentario (`middleware.ts:217-220`) evidentemente no incluyó el page-type *not-found*.

**Por qué es 🔴 y no ruido**: (1) un ciudadano con la consola roja es un ciudadano con bugs probables — este es el argumento del encargo, y acá es literal: la página no ejecuta NADA de JS; (2) el mecanismo es sistémico — cualquier ruta pública que hoy o mañana se prerenderice (SSG/ISR) muere igual bajo el CSP enforcing; el 404 es solo la instancia observada; (3) es el tipo de error que un auditor de seguridad o un funcionario técnico ve primero al abrir devtools en un demo.

---

### Consistencia

- 🟡 **El rojo hace triple turno en `/perdidas`**: es semántica de estado (pennant PERDIDO, chip crítico, KPI err, banda 24h), acento de marca (título "perdidas") **y** color de acción (botón "Buscar" `LostFiltersBar.tsx:178-183`, link "Ver credencial →" `page.tsx:405`, botón "Reportar pérdida" del aside). En el resto del portal ciudadano la acción es azul (el 404, los submits de ambos formularios finder, la credencial). Cuando todo es rojo, el chip rojo de una mascota *crítica* — el único rojo que DEBE gritar — compite con seis rojos decorativos. `desk-perdidas.png`.
- 🟡 **Tipografía hardcodeada fuera del sistema**: los labels del panel de filtros usan `text-[9.5px]` literal (4 ocurrencias, `LostFiltersBar.tsx:46,68,91,113,130`) donde el KPI card usa `var(--text-xs)` (`page.tsx:225`). Mismo idioma visual (mono uppercase tracking), dos implementaciones — y 9.5px queda por debajo de cualquier escala del sistema.
- 🟢 **Botón crudo vs sistema LnButton**: "Buscar" es un `<button>` a mano mientras el propio código de la credencial declara la cerca "citizen buttons fence — no raw button elements" (`CredentialActionBar.tsx:36`). Los `<a>` crudos del fork sí documentan su porqué (hard-nav anti-stall); el de Buscar no.
- 🟢 **Doble representación de los mismos 3 filtros** (checkboxes del panel + chips rápidos para microchip/castrado/crítica) en la misma pantalla. Sincronizan bien vía URL, y el patrón espeja `/adoptar`, pero duplica superficie de decisión para el apurado. `desk-perdidas.png`.
- ✔ **Consistencias logradas que vale nombrar**: vocabulario temporal unificado card↔credencial (`lostTimeLabel`, un solo formateador con comentario de la divergencia que arregló); género gramatical data-driven en todo el flujo (PERDIDO/PERDIDA/PERDIDO/A, "Castrado/a", "Lo tengo conmigo"/"La tengo conmigo"/"Está conmigo" — `lib/utils/format.ts:381-390,502-528`); URL como fuente de verdad en filtros (forma GET pura, D11).

---

### Accesibilidad

- ✔ **Base sólida en los formularios** [CÓDIGO]: todo input con `<label htmlFor>`, errores con `role="alert"` + `aria-describedby` estable, `fieldset/legend` en grupos, `sr-only` en file inputs, CTAs `min-h-11` (44px), teclados correctos (`inputMode="tel"/"email"`, `autoComplete`), foco visible con borde+ring. Los tokens de color vienen pre-endurecidos con contraste documentado en `globals.css` (`--color-ln-warn` oscurecido a 5.28:1, `--color-ln-mute` a 5.02:1) — los chips ámbar/gris con texto blanco pasan AA.
- 🟡 **Labels de filtros a 9.5px uppercase**: legibilidad hostil para baja visión; ninguna pauta del sistema los cubre (ver Consistencia). `LostFiltersBar.tsx:46`.
- 🟢 **`aria-pressed` sobre `<a>`** en los chips rápidos (`page.tsx:295`): `aria-pressed` pertenece a botones toggle; en un link los lectores de pantalla lo ignoran o confunden. Como navegan a una URL, el patrón correcto es `aria-current` o texto de estado.
- 🟢 **Targets táctiles de los checkboxes**: caja de 16px (`h-4 w-4`, `components/ui/Field.tsx:403`) con label `text-xs`; la fila completa ronda ~20px de alto — bajo el mínimo 24px de WCAG 2.5.8 y lejos del 44px que el propio módulo declara como regla (`Field.tsx:6`). Con una mano y caminando, son los controles más difíciles de la página.
- 🟢 **`datetime-local` como único input fino de fecha** en la disponibilidad del finder (U2): los pickers nativos de fecha+hora son de los peores widgets a una mano; agrava la fricción de U2. [CÓDIGO]
- 🟢 **Alt de foto = solo el nombre** (`alt={item.name}`, `page.tsx:341`): "Zeus" como alt no dice que es una foto de mascota; "Foto de Zeus" orienta mejor en el grid. El avatar-letra fallback es texto decorativo dentro del link — inocuo.

---

### Lo que funciona bien

1. **El mínimo para avisar es de verdad mínimo** [CÓDIGO]: en avistaje, la ubicación es lo único requerido; fecha pre-cargada con "ahora" en hora argentina (con el bug de medianoche UTC documentado y resuelto), contacto y foto opcionales y colapsados; en posesión, nombre y contacto son opcionales por decisión de PO con una línea que explica por qué dejar contacto ayuda. Nadie te pide cuenta, nadie te pre-llena nada, y el banner "¿No sos vos? Salí de la sesión" protege al que avisa desde el teléfono de otro.
2. **La honestidad de datos como sistema**: "Mostrando las 24 más recientes de 28 activas en total" (evita que 24 vs 28 parezca contradicción — con comentario citando la validación ciudadana que lo motivó), KPIs "Nuevas en…" que explican sus ceros, banda roja solo cuando hay algo urgente que anunciar, empty state con "Limpiar filtros" y hasta una buena noticia cuando no hay perdidas sin filtros.
3. **La urgencia es información, no decoración**: orden por recencia = orden por urgencia, gradación cromática con tokens semánticos, filtro "Crítica (últimas 24h)" y banda de anuncio, todo derivado de `markedLostAt` sin estado duplicado.
4. **Privacidad con affordance**: el fork se pre-resuelve server-side sin filtrar PII al cliente; el teléfono ausente se explica sin revelar si existe ("Por privacidad no mostramos el teléfono del dueño: completá uno de estos avisos y le llega al instante"); el EXIF se descarta en server. Es raro ver un flujo de crisis donde la privacidad no le cuesta taps al que ayuda.
5. **Los `<a>` duros del camino de crisis**: la decisión documentada de no usar soft-nav en las rutas one-shot del finder (stalls de 2-4s medidos) es exactamente el tipo de trade-off que esta persona necesita.

---

### 3 Prioridades

**P1 🔴 — Sanar el conflicto CSP ↔ páginas prerenderizadas (y de paso, el 404 muerto).**
El único grupo de errores de consola del scope (26 de los 39 logs) sale de que el CSP enforcing con nonce por-request bloquea el 100% del JS de toda página estática — hoy, la 404.
*Fix*: en `middleware.ts`, decidir una de dos: (a) servir la 404 dinámica (un `export const dynamic = "force-dynamic"` en `app/not-found.tsx` la saca del prerender), o (b) excluir del header enforcing los page-types prerenderizados / mover chunks a `'self'` sin `strict-dynamic` para estáticos. Agregar el page-type *not-found* (y cualquier futura ruta SSG) al barrido de violaciones citado en `middleware.ts:217-220`.
*Archivos*: `middleware.ts:221`, `app/not-found.tsx`, `app/(public)/not-found.tsx`.

**P2 🔴 — Darle puerta al finder que llega por URL.**
`/encontre` debe existir aunque sea como alias: redirect 308 → `/perdidas` (o una interstitial mínima "¿Tenés el QR? escanealo / ¿No? mirá las perdidas"). Y el 404 raíz debe heredar el CTA "Ver mascotas perdidas" que la variante pública ya tiene — un 404 en este producto es, con probabilidad alta, alguien buscando una mascota.
*Fix*: `redirects()` en `next.config.ts` (`/encontre` → `/perdidas`); sumar `primary={{ href: "/perdidas", label: "Ver mascotas perdidas" }}` al 404 raíz reutilizando `BrandedNotFound`.
*Archivos*: `next.config.ts`, `app/not-found.tsx`.

**P3 🟡 — Mobile-first de verdad en `/perdidas` + cards que identifiquen.**
(a) Reordenar en mobile: cards antes que KPIs (o KPIs colapsados a una línea de texto bajo el título); el finder ve mascotas en el primer fold. (b) Fallback de especie: `[breed, color].filter(Boolean).join(" · ") || speciesLabel(item.species)` — "Perro" dice infinitamente más que "Mascota" y el dato ya viaja en el item. (c) Unificar el vocabulario temporal a "se perdió" (chips "Perdido hoy / Esta semana") mientras el filtro siga siendo por `markedLostAt`. (d) Bajar "Sin ubicación de avistaje registrada" a `text-xs` sin itálica.
*Archivos*: `app/(public)/perdidas/page.tsx:119-123` (orden), `:374` (fallback), `:259-267` + `LostFiltersBar.tsx:132` (vocabulario), `:391-394` (empty line).

---

*Conteo de hallazgos: 2 🔴 · 7 🟡 · 8 🟢 (más 5 fortalezas). Errores de consola: 39 logs → 1 causa raíz (CSP enforcing vs prerender) + 1 404 esperado.*
