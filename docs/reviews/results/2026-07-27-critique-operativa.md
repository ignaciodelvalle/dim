# Crítica de diseño: Bandejas operativas /gob (C8)

**Fecha**: 2026-07-27 · **Plan**: `docs/reviews/2026-07-26-plan-criticas-diseno.md` §4 ficha C8
**Persona**: operador/a de bandeja con 10 minutos entre reuniones — *"¿qué expediente necesita MI próxima acción?"*
**Regla de oro aplicada**: cada fila debe responder **qué es, en qué estado está y qué acción me pide — sin abrirla.**

**Evidencia**: bundle Wave 0 `docs/reviews/results/2026-07-27-critique-screenshots/operativa/` (8 capturas; **son viewport 1440×900, no página completa** — el shell /gob scrollea internamente, así que el fold corta todas). Para ver bajo el fold se tomaron **capturas suplementarias contra el mismo build corriendo** (BUILD_ID del 26-07 20:32, HEAD `11d28295`, incluye `988a3cc8`) con viewport 1440×3200 y las mismas dos sesiones (`govt-local@dim.test`, `admin@dim.test`); se citan como *[supl.]*. Código leído: `app/gob/vigilancia/`, `app/gob/casos/`, `app/gob/denuncias/` (+`maltrato/`), `app/gob/decomisos/`, `app/gob/outbox/`, `app/admin/outbox/` y los primitivos `OpKpi`/`OpPill`/`CaseQueue`/`SlaBadge`/`OutboxTable`/`presentation-guards`.

**[ENTORNO]** (no son hallazgos): volumen sintético (175 denuncias sin asignar, 112 casos, 163 altas "hoy" en Palermo); lotes seed con fecha idéntica (19/6, "9:00 p. m." repetido en outbox); antigüedades de 25 meses en denuncias históricas; el drainer del outbox nunca corrió localmente (todas las filas con `attempts=0`, incluso las entregadas); la falta de asociación de `govt-local` a una autoridad sanitaria es casi seguro un hueco del seed — acá se critica el **diseño del estado** que eso revela, no el dato. El detalle de denuncia con evidencia/descarga no vino en el bundle; queda fuera de esta crítica (cobertura declarada, no inventada).

---

### Impresión general

Primera impresión (2 s por bandeja): **el sistema tiene una voz** — rail de filtros idéntico, tipografía operativa, chips mono en mayúsculas, footers de frescura ("Calculado al… · último evento…") en todas. Casos abre con la pregunta exacta de la persona como h1 ("¿Qué expediente necesita mi próxima acción?", `govt-casos.png`) — declaración de intención rara de ver. Denuncias responde de verdad: cada card trae severidad, SLA vencido, asignación y dos verbos ("Tomar", "Marcar revisada →").

Pero la promesa se rompe en tres lugares. En vigilancia nacional, la tile del **deadline legal** más importante de la pantalla rinde "—" neutral mientras un banner rojo grita "4 observaciones rábicas fuera del plazo legal" dos centímetros abajo (`admin-vigilancia-nacional.png`) — la vista se contradice a sí misma en el concepto que `988a3cc8` acababa de arreglar. En decomisos, el operador govt-local golpea una pared sin título ni salida (`govt-decomisos.png`), y en la vista con datos el número más grande de cada fila ("36 días") sigue corriendo aunque el episodio esté cerrado *[supl. admin-decomisos]*. Y el orden — la decisión silenciosa más importante de una bandeja — solo se declara en una de las cinco.

---

### Usabilidad (tabla)

| # | Sev | Bandeja | Hallazgo | Evidencia + código |
|---|---|---|---|---|
| U1 | 🔴 | Vigilancia | **La tile "Cumplimiento observación 10d" pinta neutral "—" con 4 incumplimientos legales vivos.** El guard de denominador cero (`closed=0`) pisa el headline breach-aware "4 fuera de plazo ahora" y el tono danger. Misma pantalla: tile neutral, banner rojo, card "Abiertas > 10 días: 4" en rojo, y la tile hermana ENO sí dice "3 vencidas ahora". Detalle §semáforo. | `admin-vigilancia-nacional.png`; *[supl. admin-tall-vigilancia]*; `app/gob/vigilancia/page.tsx:452`; `components/ui/dashboard/OpKpi.tsx:469-478`; `lib/metrics/presentation-guards.ts:114-115` |
| U2 | 🔴 | Decomisos | **El bloqueo "sin autoridad sanitaria" es un callejón sin salida sin anatomía de página**: retorno temprano sin `ScreenHeader` (la página no dice ni qué es Decomisos), un párrafo en caja punteada, cero acción (ni mailto, ni link a directorio), y el ítem "Decomisos" sigue clickeable en la nav para un usuario que no puede operar la pantalla. La causa de la desasociación es [ENTORNO]; el diseño del estado es producto. | `govt-decomisos.png`; `app/gob/decomisos/page.tsx:81-89` |
| U3 | 🔴 | Decomisos | **"N días" sigue contando en episodios cerrados**: `daysElapsed(c.openedAt)` usa `Date.now()` sin mirar `closedAt`. Fila real: "CERRADO · Abierto el 19 de junio · Cerrado el 19 de junio" con **"36 días"** en bold 18px — el episodio duró 0 días. El número más prominente de la fila miente en un sistema cuyo invariante es la honestidad del dato. | *[supl. admin-tall-decomisos]*; `app/gob/decomisos/page.tsx:65-67,279,326` |
| U4 | 🟡 | Casos | **"Urgencia" ordena solo la página, no la cola**: el fetch trae los 50 más recientes por `openedAt` (keyset) y `CaseQueue` ordena por urgencia client-side. El propio header lo confiesa: "Mostrando los 50 más recientes de 112" arriba de "Ordenar por: Urgencia". Un caso viejo ultra-urgente más allá de la posición 50 nunca aparece primero. | *[supl. admin-tall2-casos]*; `app/gob/casos/CasosScreen.tsx:68,132-147`; `components/ui/dashboard/CaseQueue.tsx:199-213` |
| U5 | 🟡 | Brotes | **El criterio de orden no se declara en ninguna parte**: la lista viene `desc(occurredAt)` (más reciente primero) y la única pista es leer los "hace 22 min / hace 6d" y deducirlo. Casos tiene el toggle "Ordenar por:"; brotes y denuncias, nada. En denuncias el orden real (severidad → más antigua) es exactamente "próxima acción primero" — mérito que la UI ni menciona. | `admin-vigilancia-nacional.png` (panel Señales); *[supl. admin-tall-brotes]*; `lib/analytics/dashboards/surveillance.ts:135`; `app/gob/vigilancia/brotes/page.tsx:162-169`; `MaltratoQueueScreen.tsx:183-190` |
| U6 | 🟡 | Outbox (gob) | **El banner cuenta breaches de la página visible, no del total**: `rows.filter(...)` local, mientras `/admin/outbox` usa `countOutboxBreaches()` global con un comentario que documenta exactamente por qué lo local sub-reporta (C2). El gemelo govt quedó con el bug que el gemelo admin arregló. | `app/gob/outbox/page.tsx:146` vs `app/admin/outbox/page.tsx:69-72` |
| U7 | 🟡 | Outbox (gob) | **El copy ordena una acción que la pantalla no ofrece**: banner "Revisá los items marcados en rojo **y reintentá** si es necesario" pero para govt la columna Acción entera es "—" (`detailHrefFor → null`; el retry vive en `/admin/outbox/[id]`). Instrucción sin affordance = frustración garantizada para la persona de 10 minutos. | `app/gob/outbox/page.tsx:187-190,235`; `components/ui/dashboard/OutboxTable.tsx:236-238` |
| U8 | 🟡 | Denuncias | **KPIs con "NO VARÍA CON EL PERÍODO" en pantallas que no tienen selector de período**: el tag derivado (`basis:"stock"+window:"now"`) se imprime en 3 de 4 tiles de triage y en el home, pero `MaltratoQueueScreen` renderiza `OpFilterBar showPeriod={false}` — el tag defiende al número de un control que no existe. Donde sí hay período (vigilancia), el mismo tag es valioso. Falta condicionarlo al contexto. | `govt-denuncias.png`, `govt-home.png`; `components/ui/dashboard/OpKpi.tsx:486-487,680-687`; `MaltratoQueueScreen.tsx` (OpFilterBar `showPeriod={false}`) |
| U9 | 🟡 | Decomisos | **La nota del período es honesta; el control sigue mintiendo por posición.** "El período seleccionado no filtra este listado…" está bien escrita y bien ubicada (bajo el h2 de la lista), pero el rail de período conserva la prominencia de un control de página entera (7 presets, ancho completo, arriba de todo) cuando gobierna una sola tile — y la tile "Decomisos del período: 0" convive con 20+ episodios listados abajo. La jerarquía del control debe achicarse al alcance real (moverlo dentro de la sección KPI), no solo anotarse. | *[supl. admin-tall-decomisos]*; `app/gob/decomisos/page.tsx:206,249-267` |
| U10 | 🟡 | Denuncias | **Rojo severidad y rojo deadline son el mismo chip**: `critical/high → danger` y `SLA vencido → danger` usan idéntico OpPill rojo; una card crítica vencida muestra dos chips rojos + borde izquierdo rojo, distinguibles solo leyendo el texto de 9px. El ámbar de "MEDIA" vs el rojo de "VENCIDO HACE 109 DÍAS" sí se separa (caso del screenshot), pero en el peor caso — que es el que importa — el canal de color colapsa. | `govt-denuncias.png`; `WelfareDenunciaRow.tsx:46-51,141-148`; `SlaBadge.tsx:70-78` |
| U11 | 🟡 | Decomisos | **La fase que necesita MI acción es la más calma**: "En custodia oficial (**sin refugio asignado**)" — lo único que depende del propio org — rinde pill AZUL (triaged), mientras "Esperando aceptación del refugio" (espera a un tercero) rinde ÁMBAR. Salencia invertida respecto de la pregunta de la persona. Además la fila repite "Sin refugio asignado" dos veces (en el pill y en línea ámbar propia). | *[supl. admin-tall-decomisos]*; `app/gob/decomisos/page.tsx:50-63,319-321,343-345` |
| U12 | 🟡 | Outbox | **"Sin intentos" junto a "Entregado" se contradice a simple vista** (¿entregado sin ningún intento?). El dato es [ENTORNO] (drainer sin correr), pero la celda no debería afirmar en palabras algo imposible junto al estado: en filas `delivered` correspondería el conteo real o "—", reservando las palabras para pending/breach — que es donde el propio comentario W3 dice que importan. | `admin-outbox.png`; `components/ui/dashboard/OutboxTable.tsx:198-216` |
| U13 | 🟡 | Outbox (gob) | **"Últimas 0 filas de la bandeja de salida…"**: el subtítulo interpola `rows.length` sin rama para cero y produce copy degenerado arriba del empty state real. Es la prueba de que el "cero explícito" no escala mecánicamente (ver §semáforo/cero). | *[supl. govt-tall-outbox]*; `app/gob/outbox/page.tsx:178` |
| U14 | 🟢 | Brotes | **Código de evento crudo en la UI**: chip `rabies_suspected` (inglés, snake_case) al lado de "Sospecha de rabia" — misma clase de jerga interna que qa-triage #8 ya purgó de las tiles (A8/A9). El código no le sirve al operador; el nombre ya está. | *[supl. admin-tall-brotes]*; `OutbreakSignalRow.tsx:73` |
| U15 | 🟢 | Casos | **El pill de edad explica su número solo en hover**: "88 DÍAS" rojo con la leyenda ("días abierto desde la apertura… ≥14 = alerta SLA") en `title`/`aria-label` de un `<span>` no focusable — invisible para teclado y para quien no se detiene a hoverear. Y con umbral binario a 14d, 36 y 88 días rinden el mismo rojo (sin gradación), con ~40% de las filas en rojo con este volumen. | *[supl. admin-tall2-casos]*; `CaseQueue.tsx:48,428-439` |
| U16 | 🟢 | Vigilancia | **Mapa de país entero para un operador de un barrio**: con scope Palermo/CABA el choropleth muestra Argentina completa vacía (el drill depende del param de URL, no del mandato del operador). Estado escaso mal aprovechado: la jurisdicción propia ni se distingue. | *[supl. govt-tall-vigilancia]*; `app/gob/vigilancia/page.tsx:99-101,236-260` |

---

### El semáforo de deadlines

`988a3cc8` ("stop painting a failed legal deadline green") arregló lo que decía: `rabiesComplianceTone` ahora pinta contra la meta estatutaria (7,1% → danger, test en `targets.test.ts:336-355`), y con breach vivo escala a danger siempre. **En ninguna vista un 7,1% puede volver a verse verde**: el único call site del % es la tile de vigilancia (verificado por grep), y el branch smallN (n<5) fuerza neutral con nota "Muestra chica", nunca ok.

**Pero el arreglo quedó por debajo de otra capa de honestidad que lo anula en el peor estado posible.** Reproducido en vivo contra el build actual *[supl. admin-vig-repro-crop]*, con `closed=0` y `openBreaches=4`:

1. `rabiesComplianceHeadline` produce correctamente `"4 fuera de plazo ahora"` + sub "Sin cierres en el período" (`lib/metrics/targets.ts:299-317`).
2. `rabiesComplianceTone` produce correctamente `"danger"` (`targets.ts:295`).
3. La tile pasa `guardInput={{ n: rabiesCompliance.closed }}` (`app/gob/vigilancia/page.tsx:452`) → `resolveOpKpiContract` rutea valor y tono por `guardRatioTone` (`OpKpi.tsx:469-478`) → `zeroDenominatorGate` ve `n=0` y devuelve `{value: "—", tone: "neutral"}` (`presentation-guards.ts:114-115`), **descartando el conteo vivo y el danger**.

Resultado en pantalla (`admin-vigilancia-nacional.png`): tile neutral "— / Sin cierres en el período" — la sub del branch de breach sobrevive, delatando que el valor fue dasheado — mientras el banner A9 dice "4 observaciones rábicas fuera del plazo legal de 10 días" y la card dice "Abiertas > 10 días: **4**". La tile ENO hermana, con el mismo estado (3 vencidas), sí lidera "3 vencidas ahora" en ámbar porque su call site no pasa guard de denominador. **Cuatro superficies, tres verdades.** El guard fue diseñado para ratios ("no fabricar 0/0"); el headline K2 convirtió el valor en un conteo vivo cuando hay breach, y el guard no distingue. No es "verde de nuevo": es peor en otro eje — **silencio neutral sobre un incumplimiento legal activo**, exactamente lo que un operador de 10 minutos filtra como "acá no hay nada".

**¿Rojo=vencido se distingue de rojo=urgente?** En las tiles, sí — el texto hace el trabajo ("N fuera de plazo ahora" vs %) y el glifo+sr-only cubren WCAG 1.4.1. En las filas de denuncias, no por color (U10): severidad crítica y SLA vencido comparten el mismo rojo OpPill y solo el texto separa "esto ES grave" de "esto se PASÓ de plazo". El sistema tiene la distinción semántica correcta en el modelo (SlaBadge la posee estructuralmente) pero no le asignó un canal visual propio.

**El cero explícito (Intentos) y si escala.** La decisión W3/PO-26-07 ("Sin intentos" en palabras porque `attempts` existe y es 0, y en una fila en breach "nadie intentó todavía" es el dato más importante) es correcta *para esa celda en ese estado*. La evidencia muestra sus dos modos de falla al generalizar: repetida en las 6 filas se vuelve textura (y junto a "Entregado" se vuelve contradicción, U12), y aplicada mecánicamente a otro cero produce "Últimas 0 filas" (U13). La regla que el sistema ya practica implícitamente y debería codificarse: **"—" = el valor no existe/no aplica; palabras = el valor existe, es cero, y ese cero exige acción; tag caps = el control no aplica** — y las palabras se eligen por estado, no por plantilla.

---

### Consistencia entre bandejas (tabla comparativa)

Mismos conceptos, cinco bandejas (F = fila; el ✅/❌ es "¿un solo sistema?"):

| Concepto | Vigilancia/Brotes | Casos | Denuncias (triage) | Decomisos | Outbox (admin/gob) | ¿Sistema único? |
|---|---|---|---|---|---|---|
| **Contenedor** | `<li>` card-lite en OpCard | tabla (`CaseQueue`) | cards con botonera lateral | OpCard por fila | tabla (`OutboxTable`) | ❌ 3 anatomías (defendible por familia de decisión, nunca declarado) |
| **Estado** | — (señal, sin estado) | `CaseStatusBadge`: Abierto ámbar / Escalado rojo / Cerrado **verde** | OpPill: Abierta ámbar / En curso violeta / Cerrada **verde** | `phasePillTone`: Cerrado **neutral gris**; abierto sin refugio **azul**; esperando refugio ámbar | chip fusión estado+SLA: Entregado verde / En SLA neutral / Incumplimiento rojo / Fallido rojo | ⚠️ ámbar=abierto y rojo=deadline son consistentes; **"cerrado" es verde en 2 y gris en 1**; el azul de decomisos invierte urgencia (U11) |
| **Urgencia/deadline** | ninguna (recencia implícita) | pill rojo "N DÍAS" ≥14d, binario | `SlaBadge` 3 estados: "SLA {tier} · vencido hace N" rojo / "en plazo" verde / "Histórico · sin SLA activo" gris | **ninguna** — "N días" sin tono (y corre tras el cierre, U3) | chip Incumplimiento + tinte de fila rosa | ❌ cuatro tratamientos; decomisos sin semáforo alguno; solo SlaBadge dice el *cuánto* vencido |
| **Fecha** | relativa "hace 22 min/6d" (>1 año → absoluta) | absoluta "26 de julio de 2026" | relativa "hace 3 meses/25 meses" (sin corte a absoluta) | absoluta "Abierto el 19 de junio…" + "N días" | corta numérica "17/6/26, 9:00 p. m." | ❌ 4 formatos y **2 implementaciones distintas de `timeAgo`** con políticas opuestas para ítems viejos (`OutbreakSignalRow.tsx:20-36` vs `WelfareDenunciaRow.tsx:77-85`) |
| **Jurisdicción** | "La Plata, Buenos Aires" muted | columna propia | "Palermo, CABA · hace 3 meses" muted | no se muestra (scope de org) | columna "Salta, Salta" | ✅ razonable ("Localidad, Provincia" estable) |
| **Orden — ¿declarado?** | ❌ (recencia) | ✅ "Ordenar por: Urgencia/Recientes" (pero ver U4) | ❌ (severidad→antigüedad, el mejor orden del sistema, mudo) | ❌ ("más recientes" solo en la nota) | ❌ (recencia) | ❌ 1 de 5 |
| **Acción primaria en fila** | "Abrir investigación →" | ninguna (fila = link) | "Tomar" + verbo por estado ("Marcar revisada/Iniciar seguimiento/Cerrar…") | "Ver caso" + "Reasignar"/"Devolver al dueño" | "Detalle →" (admin) / **columna entera "—"** (govt, U7) | ⚠️ denuncias es el patrón a imitar; outbox govt es fila sin acción |
| **Estado vacío** | `LnEmptyState` ámbar epistémico ("la ausencia de X no implica ausencia de Y") | caja punteada con copy por filtro | `LnEmptyState` | caja punteada + CTA "Nuevo decomiso" / **bloqueo U2** | párrafo plano suelto | ⚠️ el patrón epistémico es excelente; la anatomía varía sin motivo |
| **Cero/sin dato** | "—" + subs honestas + tag caps | "—" en Mascota | tag caps sin selector (U8) | KPI "0" sobre lista llena (U9) | "Sin intentos" (U12) / "Últimas 0 filas" (U13) | ⚠️ tri-estado correcto en espíritu, sin regla escrita |

Lectura: **la capa de tokens es un solo sistema; la capa de semántica por bandeja tomó decisiones locales** (verde-cerrado vs gris-cerrado, azul-custodia, 4 relojes). Ninguna divergencia parece decidida a favor del operador; parecen historias de crecimiento.

---

### Jerarquía visual

- **Vigilancia** ordena bien sus alturas (KPIs → cumplimiento → banner → cards → mapa/señales → tendencia) pero U1 rompe la cadena de mando: el banner rojo queda contradicho por la tile neutral que está *más arriba* en la jerarquía de lectura. En el estado escaso (Palermo) la página es una columna de cuatro empty-states ámbar + un mapa nacional vacío — correcto epistémicamente, pobre jerárquicamente: nada le dice al operador "tu próxima acción está en Denuncias".
- **Casos** con volumen *[supl. admin-tall2-casos]*: el h1-pregunta está bien, el toggle de orden está bien, pero la señal de urgencia (pill "88 DÍAS") vive **en la última columna, dentro de Apertura**, mientras Código (azul, primera columna) es el elemento más saturado de la fila. La fila responde "qué es" y "en qué estado está"; el "qué me pide" queda en la esquina.
- **Denuncias** es la mejor fila del sistema (tipo+severidad+SLA+asignación+2 verbos), al costo de densidad de chips: hasta 5 chips de 9px por card. El inspector vacío ("Elegí una denuncia para verla acá") ocupa ~60% del ancho con 2 denuncias — en estado escaso el vacío domina la pantalla.
- **Decomisos**: el número más grande de la fila (días, 18px bold) es el dato sin semáforo y a veces falso (U3); el período tiene la prominencia equivocada (U9); "36 días" idéntico para abierto y cerrado aplana la lectura.
- **Outbox**: jerarquía correcta (banner global → filtros → tabla con tinte de fila en breach). El chip fusionado responde "¿me necesita?" en un solo glifo — bien — aunque la columna se llame "SLA" y contenga estados de entrega.

---

### Accesibilidad

- ✅ Base sólida y por encima de lo habitual: glifo + `sr-only` en tonos de OpKpi (WCAG 1.4.1, con test dedicado), `caption` sr-only + `th scope="col"` en las dos tablas, `aria-live` en conteos, `aria-pressed` en chips/toggles, `aria-current` + focus ring visible en filas de brotes, botones de fila como hermanos del anchor (nunca anidados) en denuncias, `<time dateTime>` en fechas.
- 🟡 **Información solo-hover**: la leyenda del pill de edad en casos y la nota ENO "ⓘ" del outbox viven en `title` de spans no focusables — inalcanzables por teclado y touch (`CaseQueue.tsx:428-439`, `OutboxTable.tsx:171-179`).
- 🟡 **Texto crítico a 9px mono mayúsculas**: los chips (OpPill) cargan la distinción severidad/deadline (U10) en tipografía de 9px con tracking — legible en desktop nítido, castigo en proyector o visión disminuida. El color no es el único medio (bien), pero el medio restante es minúsculo.
- 🟡 U1 tiene arista a11y: el estado real (breach legal) queda *fuera* de la tile que un lector de pantalla anuncia como "Cumplimiento observación 10d, —" sin tono; la corrección de U1 arregla también esto.
- 🟢 El tinte de fila rosa en outbox va acompañado de chip textual (no color solo) ✅; contraste general de tokens st-* aparenta AA en las capturas (no se midió instrumentalmente en esta pasada).

---

### Lo que funciona bien

1. **`SlaBadge` es el primitivo modelo del sistema** (`SlaBadge.tsx`): posee la semántica (deriva breach/histórico/en-plazo de los inputs crudos, nadie puede pasarle un tier donde va un overdue), tres estados honestos, demotion de backlog histórico coherente con el label de severidad "(histórica)". Es la respuesta correcta a "¿rojo=vencido o rojo=urgente?" — extenderlo, no reinventarlo.
2. **Los headlines breach-aware** ("3 vencidas ahora" liderando sobre el % histórico demovido) — verdad viva primero, referencia después. U1 es la excepción que lo traiciona, no la regla.
3. **La gramática de workqueue de denuncias**: Tomar + verbo-por-estado + "Sin asignar/Mía/Asignada a {nombre}" responde la pregunta de la persona fila por fila.
4. **El lenguaje epistémico unificado de los vacíos** ("la ausencia de registro no implica ausencia de X") repetido con la misma voz en 4+ superficies — madurez que casi ningún producto gubernamental tiene.
5. **Honestidades pequeñas y consistentes**: nota del período en decomisos (el texto en sí), "Mostrando los 50 más recientes de 112", guard note "Base del período anterior inestable", footer de frescura idéntico en todas las bandejas, "Registrada y auditada — transmisión pendiente de endpoint receptor".
6. **El rail `OpFilterBar` + "Copiar vista" + "Vistas guardadas"** uniforme: el operador aprende una vez y navega cinco bandejas.

---

### 3 Prioridades con fix + archivo

1. **🔴 Que ninguna capa de honestidad silencie un incumplimiento legal vivo (U1).**
   Fix: en `app/gob/vigilancia/page.tsx:452` condicionar el guard al estado sin breach — `guardInput={rabiesCompliance.openBreaches > 0 ? undefined : { n: rabiesCompliance.closed }}` — o, mejor estructural: en `resolveOpKpiContract` (`OpKpi.tsx:469`) no aplicar `zeroDenominatorGate` cuando el caller marque el valor como conteo vivo (nuevo flag `guardInput.liveCount` o detectar que `value` no es el ratio del descriptor). Agregar el caso al test de `targets.test.ts`/`OpKpi.test.tsx`: `closed=0 ∧ openBreaches>0` ⇒ valor "N fuera de plazo ahora", tono danger. Criterio de aceptación: la tile, el banner y la card cuentan la misma historia en `admin-vigilancia`.

2. **🔴 Filas de decomisos que digan la verdad y pidan acción (U3 + U11 + U2).**
   Fix en `app/gob/decomisos/page.tsx`: (a) `daysElapsed` debe cerrar en `closedAt` (`Math.floor(((c.closedAt ?? new Date()).getTime() − c.openedAt.getTime())/86400000)`); (b) darle tono al número de días en abiertos (reutilizar el patrón de umbral de `CaseQueue`/`SlaBadge` — p. ej. ámbar >30d, rojo >60d, o el umbral legal que defina producto) y pill ámbar—no azul—para "sin refugio asignado", eliminando la línea duplicada (:343-345); (c) el bloqueo sin autoridad sanitaria renderiza `ScreenHeader` + `LnEmptyState` con acción concreta (link a `/gob/directorio` o mailto del admin) en vez del párrafo suelto (:81-89).

3. **🟡 Declarar el orden en las cinco bandejas y hacer global la urgencia (U4 + U5).**
   Fix: (a) una línea estándar junto al conteo — brotes: "Ordenadas por detección más reciente" (`app/gob/vigilancia/brotes/page.tsx:162-169` y panel "Señales recientes" de `page.tsx:780`); denuncias: "Ordenadas por severidad y antigüedad" (`MaltratoQueueScreen.tsx`, junto a `OpCardHead "Denuncias (N en total)"`); outbox/decomisos: "Más recientes primero". (b) En casos, mover el ranking de urgencia al servidor (ordenar por `ageCaseDays × caseKindSeverityWeight` en `lib/infra/case-queries.ts` cuando `sort=urgencia`, con cursor propio como ya hizo maltrato con su risk-cursor) o, mientras tanto, renombrar el toggle activo a "Urgencia (de esta página)" — que el label no prometa lo que la query no hace (`CasosScreen.tsx:68,132`; `CaseQueue.tsx:199-213`).

*(Prioridad 4 si hay presupuesto: paridad del gemelo govt del outbox — banner global + acción por fila o quitar la instrucción "reintentá" — U6/U7, `app/gob/outbox/page.tsx:146,187-190,235`.)*
