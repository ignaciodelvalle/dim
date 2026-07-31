# 🚨 GATE DE DEPLOY — LEER ANTES DE SUBIR NADA

**La migración `db/migrations/0162_welfare_reports_jurisdiction_unverified.sql`
DEBE aplicarse antes de que esto shipee.** `db/schema.ts:1680` ya declara
`jurisdictionUnverified` y `MaltratoQueueScreen` hace un `.select()` pelado sobre
`welfareReports`: contra una base sin migrar, **toda query de welfare da 500 y el
circuito de denuncias entero se cae**. Numeración verificada (0160/0161/0162,
forward-only, idempotente). Aplicada SOLO en local.

# ⛔ VEREDICTO RA-3 — NO APTO PARA STAGING HASTA CERRAR C1-C4

**La review de privacidad volvió NOT CLEAN: 8 confirmados, 4 de severidad alta.**
Regla 7 y D.13 aplican. **No se pushea nada nuevo hasta que C1-C4 cierren.**

**La causa estructural, y es la lección de toda la ola**: los tres barridos de
k-anon (#40, #40b, #40c) se acotaron **por PIPELINE**, no por superficie. Existe
un SEGUNDO pipeline por unidad, al mismo grano, **sin ninguna supresión**:
`lib/analytics/dashboards/surveillance.ts` + `lib/analytics/choropleth-data.ts`,
alimentando **`/gob/analytics`, `/gob/vigilancia` y `/gob/perdidas`**. Esa es la
familia que nadie barrió, y los 8 hallazgos viven ahí o en su borde.

| # | Sev | Qué |
|---|---|---|
| **C1** | ALTA | **El drill de admin apaga D.10 con un parámetro de URL.** `?province=AR-V` angosta el scope entero a esa provincia: la tabla oculta la celda y **el KPI de al lado publica el mismo número, en la misma página y el mismo request**. Los dos CSV lo heredan. El propio código había argumentado el caso — *"una supresión que cualquiera puede apagar no es una supresión"* — y el KPI vecino la apaga |
| **C2** | ALTA | **Diferenciación con DOS celdas suprimidas.** `complementarySuppress` solo dispara con `n === 1`. Con `[TdF 1, SC 1, BA 998]` y total 1000: `1000 − 998 = 2` repartido en dos celdas de ≥1 ⇒ **cada provincia tiene exactamente 1**. Y el test guard afirma *"no cell isolable"*, una propiedad que no se cumple — su propio fixture ya fija cada celda |
| **C3** | ALTA | **`fetchOutbreakHistory` publica conteos de enfermedad a grano LOCALIDAD, sin k-anon.** Una sola señal renderiza *"Rabia · Ushuaia · Tierra del Fuego · 12 mar 2026 · 1"* — un animal, una localidad, una fecha. La re-identificabilidad más alta del informe. **La misma página k-anonimiza y ANUNCIA su tarjeta de acceso veterinario**: el estándar está probado presente y salteado acá |
| **C4** | ALTA | **`fetchCasesPerCapita`: conteo crudo + tasa por provincia, sin k-anon.** Amplificador: **la tabla ordena por tasa per cápita, que sistemáticamente sube las provincias más chicas al tope** — las celdas sub-k son justo las más mostradas |
| C5 | MED | Los coropletas nacionales de `/gob/vigilancia` y `/gob/perdidas` pintan polígono y tooltip con 1 caso. El drill de departamento SÍ está suprimido; solo el tier de provincia está desnudo |
| C6 | MED | `MapChoropleth` renderiza la leyenda **"Datos insuficientes (privacidad)" incondicionalmente**, en todos los callers, pinte o no una trama. Espejo exacto de la falla que la ola ya cazó una vez |
| C7 | MED | `fetchRegionRanking` publica una tasa por unidad sin denominador en la decisión. 3 perros / 1 vacunado ⇒ `33%`. `bottom` ordena ascendente, así que las provincias más chicas salen primero |
| C8 | MED | **Diferenciación cruzada por denominadores ANIDADOS en datos abiertos.** El agrupamiento conjunto compara el NOMBRE de la columna base, pero `perros_registrados` es subconjunto estricto de `mascotas_activas`: la resta da las mascotas no-perro de la provincia. Ambas celdas pasan su propio k-check; la regla conjunta nunca ve el par |

Lo bueno, y hay que decirlo: **el motor está bien construido.** `anonymity.ts`,
`province-suppression.ts`, `province-disclosure.ts` y los tiers de censo,
población y datos abiertos están sólidos y guardados. El defecto es de ALCANCE,
no de diseño.

---

# Plan de ejecución nocturno — 2026-08-01 · **Corrida de aptitud para staging**

> **Este archivo es el estado.** Consolida TODO lo que quedó abierto de las
> corridas del 29, 30 y 31, y define el set de reviews adversariales que decide
> si lo que sube a staging es una iteración real de miMAR.
>
> Supersede las tablas de estado de `2026-07-30-*` y `2026-07-31-*`. Esos dos
> archivos siguen siendo la fuente de las specs detalladas (B2/SC-7) y de la
> lista de ratificación R1-R10 / N1-N4.
>
> **CERO decisiones intermedias del PO.** (1) Decisión previa o precedente del
> repo manda. (2) Opciones equivalentes → el agente decide y DOCUMENTA. (3)
> Visible de producto → se implementa la lectura recomendada, se deja evidencia,
> y va a RATIFICACIÓN. Nunca se frena.
>
> **Escape hatch, obligatorio**: si la intención documentada en el código
> contradice lo que este plan dice, **gana la intención documentada** — se anota
> y se sigue. Se usó cuatro veces en dos noches y las cuatro evitaron trabajo
> prolijo en la dirección equivocada.

---

## Decisiones del PO tomadas ANTES de arrancar (2026-07-31)

| # | Tema | Decisión |
|---|---|---|
| **D.10** | **#40c alcance** | **El funcionario ve SU propia jurisdicción con el número real; se suprime lo ajeno. El export coincide EXACTAMENTE con la pantalla.** Razón: mirar el censo del propio municipio no es una divulgación —son sus administrados, ya están en su padrón—; la supresión existe para impedir inferir sobre jurisdicciones ajenas. Y un export que difiera de la pantalla se vuelve la vía para saltear la protección |
| **D.11** | **Geocoding caído** | **Fallback a la jurisdicción del texto del formulario, marcada como NO VERIFICADA.** Nunca se pierde la denuncia. **Condición de implementación (no negociable)**: la marca de baja confianza debe ser VISIBLE en la cola del operador, no solo persistida — si no, una denuncia ruteada al municipio equivocado *se ve atendida y no lo está*, que es el riesgo que el PO aceptó y que esta condición neutraliza |
| **D.12** | **A14 interino** | Si no aparece la causa raíz: **fallo RUIDOSO**. El vet ve "no pudimos confirmar — revisá la libreta antes de volver a firmar", nunca "Registrando…" eterno. No afirma éxito: declara que no sabe. Corta el daño irreversible. **NO** se agrega un guard server-side de re-firma (lógica de dominio nueva, sin tiempo de maduración) |
| **D.13** | **Push y visuales** | **Push AUTORIZADO para esta corrida.** Los dos cambios visuales grandes (703 + SC-7) entran con capturas antes/después por superficie y van a ratificación. Si una review da DO NOT SHIP y el fix no es claro: **NO se pushea** y el veredicto queda arriba de todo en este archivo |

## Defaults que el agente fija (no molestar al PO por esto)

- **A2b (limpiador de huérfanos)**: **NO se implementa.** Cambia un script que BORRA y no hay autorización. Queda documentado con la propuesta.
- **Partir `PanoramaConsole.tsx`** (para desbloquear A2c): **se hace.** Es refactor mecánico con tests detrás, y el fence obliga igual.
- **Si `verify` se pone rojo por algo que no puedo arreglar**: se detiene ESA unidad, siguen las demás, se documenta.
- **Si una review da DO NOT SHIP**: no se pushea, veredicto arriba de todo (D.13).
- **Escritura a la base local bloqueada por el clasificador**: NO se insiste ni se rodea. Se encola con el comando exacto para el PO y se sigue con otro trabajo. **Nunca se frena la corrida por esto.**
- **Ratificación R1-R10 / N1-N4**: no bloquea nada, se acumula.
- **Fecha de cutover**: no se propone hasta que la tabla cierre (regla D7).

## PARTE 1 — El backlog completo

### Prioridad 1 — Privacidad y daño irreversible

| # | Unidad | Estado |
|---|---|---|
| **P1.1** | **#40c — censo y control de población.** `census.ts:645,656` y `population-control.ts:132,146` publican conteo y tasa CRUDOS por provincia. Confirmado NO exento (una tasa revela su denominador). Los renders viven en `app/`: hay que cerrar datos **y** divulgación juntos o no se cierra. Consumidores: `/admin/censo`, `/gob/censo`, `/gob/censo/export`, `/admin/poblacion`, `/gob/poblacion/export` | **cerrada** |
| **P1.2** | **A14 — nav drop post-acción.** Mecanismo hallado: `pendingLanes == suspendedLanes == warmLanes` con `pingedLanes == 0` → transición suspendida sobre una promesa que no resuelve. Explica el link que no navega y el `isPending` clavado. `PendingSignaturesCard` es causal dominante (0/8 vs 8/8 apagada); queda 25-40% de fondo sin ella. **Próximo experimento: separar la query del servidor del render de la tarjeta.** Daño: el vet firma, no recibe confirmación, vuelve a firmar → fila duplicada permanente en una libreta con peso legal | abierta |

### Prioridad 2 — Confianza en el gate

| # | Unidad | Estado |
|---|---|---|
| **P2.1** | **Los 4 rojos de `final-seams`.** La spec no podía fallar (verde-y-muerta en TODAS las corridas de CI). Ahora afirma. El PO pidió **investigar los 4 antes** de decidir arreglarla o jubilarla — `crisis-seams` cubre las mismas costuras sobre el nivel que CI sí siembra y pasa | abierta |
| **P2.2** | **A15 — el fixture de RLS elige mascota con transferencia pendiente.** `__tests__/rls/matrix.test.ts:222` choca con `one_pending_per_pet`. **Solo local** (CI bootstrapea limpio). Mismo patrón que A8: `NOT EXISTS` sobre el predicado del índice, copiar `scripts/seed-case-guards.ts` | abierta |
| **P2.3** | **`csp-smoke` escanea un 404.** Verde para una ruta que nunca visitó — misma clase que el gate de a11y que escaneaba un no-encontrado | abierta |
| **P2.4** | **El chequeo de PII de `synthetic-monitor` no puede fallar** — asserta contra `"Ignacio del Valle"` mientras el dueño en CI es `"Lucía Tester"` | abierta |
| **P2.5** | **`owner-ia-p6` 1/2/10 y `synthetic` (c)/(d)** — páginas trabadas en skeletons de Suspense pasado el presupuesto de 8s de CI. Sospecha: bloat de la base local; no reproducible sin bootstrap fresco | abierta |
| **P2.6** | **El worker de Windows** — `0xC0000409`, crash NATIVO, **no reproduce en Linux**. NO bloquea. Siguiente candidato razonado: `pool: "threads"`, con el parche de stderr-tail primero | abierta, no bloqueante |
| **P2.7** | **A2b — el limpiador de huérfanos cubre 4 de ~20 prefijos.** Propuesta escrita y **deliberadamente sin implementar**: cambia un script que BORRA. Necesita revisión humana | abierta |

### Hallazgos de P1.1 que quedan abiertos

- **`pnpm lint` (biome) falla** en `app/org/[orgToken]/atender/[publicToken]/page.tsx:78` (`useTemplate` sobre un `String.fromCharCode`). Territorio vivo de P1.2 — **rompe `verify` hasta que se arregle**.
- **Divergencia aceptada, para ratificación del PO**: un operador govt en jurisdicción sub-k ahora ve su número REAL en `/gob/censo` (D.10) y la MISMA provincia hachurada en `/gob/panorama` (regla ciega de #40). D.10 se acotó a #40c a propósito; **realinear Panorama a la regla de propiedad es otra decisión** y se señala en vez de colarse.
- **Comentario que se volvió mentira** (material de RA-5): el header de `lib/open-data/province-suppression.ts` sigue afirmando que *"the authenticated Panorama province choropleth publishes province aggregates UNSUPPRESSED"* — falso desde #40.
- Cerrado de paso: el pie de "sin provincia asignada" se recalculaba desde las filas visibles, lo que **sobreestimaba el residual y recuperaba la celda oculta por resta**. Ahora sale del Σ que incluye las ocultas.

### Hallazgos de P2.2-P2.4 — dos que reencuadran, y una unidad nueva

- **El arreglo obvio de P2.2 habría sido PEOR.** `owner@dim.test` tiene exactamente UNA mascota activa y es la que carga la transferencia de demo, así que un `NOT EXISTS` sobre sus mascotas no encuentra candidato → `setupError` → **las 44 celdas de la matriz pasan a skip silencioso y la suite imprime verde**. Medido: las salteadas corren en 0 ms, las reales en 3-4 ms. El fixture ahora se auto-provisiona una mascota propia, siguiendo el precedente del propio archivo. **Segundo caso en esta ola de "el arreglo obvio empeora"** — el primero fue el `ORDER BY` de A8, que habría convertido un fallo intermitente en uno del 100%.
- **El `assertRealPage()` de A7 tenía el mismo bug que arreglaba.** Matcheaba solo `/no encontramos esta página/i`, pero `app/(public)/not-found.tsx` dice **"No encontramos esa CREDENCIAL"** — y `/p/[token]` es una ruta `(public)`, exactamente la que A7 estaba reparando. Cinco boundaries, dos títulos; el guard no reconocía el que guardaba. Ahora hay una sola implementación en `e2e/demo/_helpers.ts` + un `data-testid` en `BrandedNotFound` para que el copy no pueda desarmar el gate.
- **UNIDAD NUEVA — P2.8: `__tests__/rls/matrix.test.ts:552` es skip-es-aprobado.** `setupError` solo hace `console.warn` y las 44 celdas retornan temprano, así que **la suite puede imprimir verde entero sin afirmar nada**. Es la misma enfermedad; se dejó sin tocar por radio de explosión y porque necesita una decisión de semántica CI-vs-local.

### Prioridad 3 — Robustez y defectos de producto

| # | Unidad | Estado |
|---|---|---|
| **P3.1** | **`nominatim.openstreetmap.org` hardcodeado.** Fetch server-side sin override por env, en el ruteo de jurisdicción. Desde una IP compartida de Actions puede fallar, y **un caso sin jurisdicción es invisible para toda cola de gobierno** | **cerrada** |
| **P3.2** | **`jurisdictionProvince` sin `z.enum`** (`CreateAlertSubscriptionSchema`) — a diferencia de `metricKey`/`direction`. Una provincia no canónica se escapa de Zod y llega al usuario como error crudo de Postgres. Ya hay un test que documenta el estado y se pondrá rojo al arreglarlo | abierta |
| **P3.3** | **A2c — el aviso de capa desconocida está enterrado** en la pestaña "Línea de tiempo" de un dock colapsado, así que en el aterrizaje no se ve. **Bloqueada**: `PanoramaConsole.tsx` está exactamente en su fence de 5089 líneas — hay que partirlo primero | abierta |

### Prioridad 4 — Estética y deuda de diseño (specs completas, listas para ejecutar)

| # | Unidad | Estado |
|---|---|---|
| **P4.1** | **B2 — la pasada de los 703.** Spec completa en `2026-07-30-*` §B1. Recordar: **85 elementos cambian de color** por el cascade alfabético y es CORRECCIÓN, no regresión; ~14 usos viven fuera de `className=` literal → codemod por texto crudo, no por AST; **jamás tocar los 1.881 `text-[var(--color-*)]`** | abierta |
| **P4.2** | **SC-7 — el gemelo sin fence.** `font-[var(--font-ln-*)]`, 521 usos / 144 archivos, font-family MUERTA. 349 elementos que el diseño quiere monoespaciados se ven en la sans heredada. Unidad propia con guard y baseline nuevos (el fence actual matchea solo `text-`) | **cerrada** |

### Prioridad 5 — Stretch
SC-6 (cursor keyset por urgencia) · D.5(b) en `CabaInset`/`MapChoropleth` · #41 detalle de caso · las 5 `it.todo` de Zod (despriorizadas por el PO).

### Ratificación pendiente del PO
R1-R10 (`2026-07-30-*`) y N1-N4 (`2026-07-31-*`). Todo implementado y verde: es confirmar o vetar, **no frena nada**. N4 ya resuelto: no se agrega chip "Otros".

---

## PARTE 2 — El set de reviews adversariales

### Por qué estas y no una "code review" genérica

Estas diez están diseñadas **contra los modos de falla que esta ola demostró**, no contra un checklist. En dos noches se encontraron ~15 tests que no guardaban nada, 5 fugas de privacidad vivas, 3 no-ops silenciosos y 4 comentarios que se habían vuelto mentira y se citaban como justificación. Una review que no cace esas clases no nos dice nada que no sepamos.

**Regla transversal, aplica a las diez:** un hallazgo sin **input concreto → salida incorrecta** es una sospecha, no un hallazgo. Se reportan por separado.

---

### RA-1 · Regresión cero — *la que el PO pidió explícitamente*
**Caza**: cualquier cosa que un usuario podía hacer antes y ahora no puede.
**Método**: diff completo del rango contra el punto de partida de la ola. Por cada cambio visible —label, ruta, prop, forma de dato, gate de capacidad— responder: ¿qué flujo tocaba esto y sigue completo de punta a punta?
**Foco especial, porque esta ola los movió**: los 24 labels de confirmación (D.3), el verbo del alta (D.9), las 4 colas realineadas (D.4), el copy del vacío, el slot del tab bar, las rutas de la libreta.
**Trampa conocida**: un label renombrado rompe locators de e2e Y comentarios que lo citaban. Ya pasó dos veces esta ola.

### RA-2 · Caza de no-ops silenciosos
**Caza**: todo control que parece hacer algo y no hace nada.
**Por qué**: la ola encontró tres — el botón "Asentar" con 0 mascotas apuntando a una sheet inerte, la tarjeta de firma que nunca se limpia, y la navegación post-acción que se pierde. Los tres eran invisibles porque **fallan en silencio**.
**Método**: enumerar CTAs, submits, links y acciones de servidor; para cada uno, ¿hay un camino donde commitea y no informa, o informa y no commitea, o no hace nada? Prestar atención especial a condiciones de salida que la arquitectura hace **inalcanzables** (el caso de append-only).

### RA-3 · Honestidad de la divulgación (privacidad)
**Caza**: datos protegidos que se filtran, y supresiones que no se anuncian.
**Por qué**: los dos lados aparecieron. Fugas: tasa sobre denominador 1, conteos por unidad, la lista completa de eventos en el drill, `?? 0` publicando cero confiado. Y el reverso: un mapa entero hachurado que no avisaba nada, y una leyenda que anunciaba una trama que el mapa no pintaba.
**Método**: por cada agregado por unidad, ¿k-anon con denominador? ¿Un cero falso en algún lado? ¿Se puede recuperar una celda suprimida restando publicadas de un total publicado? Y por cada supresión: ¿hay superficie que lo diga, y dice la verdad sobre ESTE frame?
**Regla 7**: si no cierra entero —datos + render + divulgación + tests— se revierte.

### RA-4 · Integridad de los tests — *el sujeto son los tests, no el código*
**Caza**: tests que no pueden fallar, o que afirman el defecto.
**Por qué**: ~15 en dos días. Formas confirmadas: aserción de ausencia sobre un literal ya borrado; mock que alimenta un estado que la query real no puede devolver; `catch` que setea `pass=false` y nadie lo asserta; gate que escaneó un 404 y por eso dio verde; contador que compara contra un nombre que no existe en ese entorno.
**Método**: por cada test que toca superficie crítica, ¿existe una mutación del código que lo deje verde? Verificar con grep **sobre código sin comentarios**.
**No tocar**: los guards anti-resurrección son legítimos y se ven idénticos — ver el de `PanoramaConsole.test.tsx:1160`, ya documentado.

### RA-5 · Comentarios que se volvieron mentira
**Caza**: comentarios que declaran un invariante o citan una decisión y ya no son ciertos.
**Por qué**: `"province cells are large"` justificó una fuga de privacidad durante meses y se citaba como razón en 13 archivos. El comentario del retorno D4 describía una IA retirada y casi genera trabajo de producto sobre algo que funciona. `"USUALLY no suppressedCount"` sobrevivió al cambio que lo invalidó.
**Método**: cada comentario que afirma "siempre"/"nunca"/"no hace falta X porque Y" es una hipótesis falsable. Verificarla contra el código de hoy.

### RA-6 · Arranque en frío / primera visita
**Caza**: todo lo que solo funciona con datos acumulados.
**Por qué**: "pasa local" estaba midiendo semillas aplicadas a mano hace meses. CI —base fresca, cachés vacíos, servidor frío— **es más parecido a un municipio nuevo que nuestra laptop**. Y ahí aparecieron un gate de a11y sobre un 404 y specs apoyadas en cuentas que no existen.
**Método**: bootstrap limpio, sin data de demo. Recorrer los flujos principales como una jurisdicción recién dada de alta: ¿qué ve? ¿Hay estados vacíos que mientan, o pantallas que asuman datos?

### RA-7 · Verdad del operador en el panorama
**Caza**: el mapa diciendo algo distinto de lo que los datos dicen.
**Por qué**: el estado de aterrizaje pintaba el país entero "sin datos" incluida CABA con 40%; el cubo devolvía provincias protegidas como cero real; la leyenda y el mapa podían contradecirse.
**Método**: **píxeles computados, no DOM** (regla 8). Por cada capa y grano: lo pintado == lo que el loader devuelve == lo que la leyenda declara. Con el preset donde la supresión realmente dispara.

### RA-8 · Autorización y multi-tenencia
**Caza**: acceso que no debería existir.
**Método**: RLS por tabla, aislamiento cross-tenant, gates de capacidad pineados al token de la URL, y **controles de autorización sin cobertura de runtime** — el borrado de suscripciones existía y nadie lo verificaba; puede haber más.

### RA-9 · Accesibilidad, sobre páginas reales
**Caza**: barreras reales.
**Por qué**: el gate de a11y estaba verde porque escaneaba una página de no-encontrado. **Primero probar que la página es la página**, después medir.
**Método**: axe sobre superficies verificadas + navegación por teclado en los flujos críticos (que es lo único que falló cuando el escaneo era falso).

### RA-10 · Coherencia estética y de sistema de diseño
**Caza**: lo que hace que el producto se vea a medio terminar.
**Por qué**: 703 font-sizes muertos, 521 font-families muertas, 5 anatomías de cola distintas, 6 gramáticas de confirmación.
**Método**: **en píxeles computados**. Escala tipográfica efectiva por superficie, familias aplicadas, gramática de confirmación consistente, anatomía de fila, estados vacíos. Capturas antes/después por superficie.
**Recordar**: al arreglar los 703, **85 elementos cambian de color** y es una corrección — quien lea las capturas sin saberlo va a reportar una regresión donde hay un arreglo.

---

## Orden de ejecución

1. **P1.1 y P1.2** primero — privacidad y daño irreversible.
2. **P2.1-P2.5** — hasta que el gate diga la verdad, ninguna review vale.
3. **P4.1 y P4.2** — necesitan UNA sesión de servidor con capturas.
4. **P3.x** en paralelo donde el territorio sea disjunto.
5. **Las diez reviews al final**, sobre el rango completo, con el gate verde.

## Reglas de la corrida
Las 18 de `2026-07-31-*` siguen vigentes. Las tres que más costaron:
- **`git commit` commitea el ÍNDICE ENTERO** → siempre `git commit -m "…" -- <paths>`.
- **Nunca `git checkout -- <file>`** para revertir una mutación — borra todo lo no commiteado de ese archivo.
- **Verificar mutaciones con grep sobre código SIN COMENTARIOS**.
- **Serializar todo lo que necesite servidor.** Máximo 3 escritores, territorio enumerado.

## Autorización de push
**CONCEDIDA (PO, 2026-07-31)** — ver D.13. Al cierre: gate verde → las 10 reviews
sobre el rango completo → fixes de los CONFIRMED como commits propios → push.
DO NOT SHIP con fix no claro ⇒ no se pushea y el veredicto va arriba de todo.
Es para ESTA corrida, no permanente.

## Auditoría de autonomía — dónde PODRÍA trabarme, y qué hago

| Riesgo | Mitigación |
|---|---|
| El clasificador bloquea una escritura a la base local (pasó el 31 con un `UPDATE` a `pets`) | No insistir. Encolar el comando exacto y **seguir con otras unidades**. La corrida no se frena |
| Una unidad de privacidad no cierra entera | Regla 7: se revierte y se documenta. No es una pregunta |
| Los 4 de `final-seams` resultan defectos reales y caros | Se arreglan si son baratos o revelan un defecto; se jubila la spec solo si son puro drift de nivel demo **y** se demuestra que `crisis-seams` cubre la misma costura |
| Dos agentes chocan por el servidor | Máximo 3 escritores, territorio enumerado, **y una sola unidad con servidor por vez** |
| El worker de Windows pone la suite en exit 1 | Conocido, no reproduce en Linux. Se juzga por CONTEOS, nunca por exit code |
| Una review produce cien "quizás" | Regla transversal: sin input concreto → salida incorrecta, es sospecha y va en sección aparte |

## Estado

| Unidad | Estado | Commit |
|---|---|---|
| P1.1 #40c censo/población | **CERRADA** (datos + render + divulgación + tests) | `9305f942` · `4ff4d55c` · `bf5c9edf` |
| P1.2 A14 nav drop | pendiente | |
| P2.1 los 4 de final-seams | pendiente | |
| P2.2 A15 fixture RLS | **CERRADA** — el `NOT EXISTS` obvio dejaba 44 celdas en skip-silencioso; el fixture se auto-provisiona una mascota propia | `4bd6f9fd` |
| P2.3 csp-smoke sobre 404 | **CERRADA** — y `assertRealPage()` de A7 tenía el mismo bug que arreglaba: no reconocía el 404 de `(public)` | `d2494b60` |
| P2.4 PII assert imposible | **CERRADA** — PII del dueño descubierta en runtime; teléfono por dígitos; `findPiiLeaks` lanza si el nombre viene vacío | `e93a1a72` |
| P2.5 skeletons de Suspense | pendiente | |
| P2.6 worker de Windows | pendiente (no bloquea) | |
| **P2.8 (NUEVA)** rls/matrix skip-es-aprobado | pendiente — 44 celdas retornan temprano; la suite imprime verde sin afirmar nada | |
| P2.7 A2b limpiador | pendiente (necesita revisión) | |
| P3.1 nominatim hardcodeado | **CERRADA** (env override + timeout con budget compartido + fallback D.11 al texto del formulario, marcado y VISIBLE en la cola de triage) | `937a4007` |
| P3.2 jurisdictionProvince sin enum | pendiente | |
| P3.3 A2c aviso enterrado | bloqueada por el fence | |
| P4.1 B2 los 703 | **CERRADA** — 702 usos / 207 archivos al utility nombrado; `deadTextVar` 703 → 0; `text-[var(--color-*)]` intacto (1874/263 antes y después); 107 elementos medidos en píxeles computados, 103 cambiaron de tamaño, 17 de color (la corrección del cascade); contraste re-medido 4.53-5.19:1, sigue AA; capturas en `docs/reviews/results/2026-08-01-703-pass/` con README que explica el caveat de color | `b39d9d2f` · `435fa426` |
| P4.2 SC-7 los 521 | **CERRADA** — la población real era **520 usos \ 143 archivos** (mono 348, serif 135, sans 37), no 521\144: drift -1\-1, igual de benigno que el 703→702 de P4.1. Los otros 2 que aparecen en un `rg` del repo son prosa en `docs/`. **Sitios fuera de `className=`: 2** (`Badge.tsx` `base`, `Field.tsx` `controlBase`) — esta población NO tiene la trampa del `summaryClassName` de P4.1; se verificó con el AST y se validó que el walker SÍ ve props custom. Diff probado byte a byte contra HEAD+sustitución (0 discrepancias, 143 archivos, 520 sustituciones); tras el reflow de Biome quedan 2 archivos que difieren sólo por dos reescrituras sintácticas (`{" "}` → espacio literal, paréntesis JSX redundantes). **113 de 113** elementos medidos en píxeles computados cambiaron de familia, 0 sin conciliar, 0 sin explicar; +116 por herencia; `/gob/perdidas` y `/gob/panorama` (sin usos muertos) dan **0 píxeles de diferencia**. Fence nuevo: regla 10 `DEAD_FONT_VAR` + baseline `deadFontVar` en 0 para los 456 archivos, dientes verificados, `totalViolations` intacto (1751). **Un hallazgo de producto**: la chapita "AL DÍA" del teléfono del landing se partía en dos renglones (mono es más ancha; perdía por 0,9 px) → `whitespace-nowrap` en `StatusFlag`, 0 de 17 chips se parten. Capturas en `docs/reviews/results/2026-08-01-sc7-pass/` | `8525a10b` · `b164e623` |
| RA-1..RA-10 | pendientes | |
