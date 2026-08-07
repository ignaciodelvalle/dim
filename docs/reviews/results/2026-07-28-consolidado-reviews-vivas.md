# Consolidado — cuatro reviews vivas adversas sobre `:3000` (2026-07-28)

**Ground truth:** `integration/all-20260703` @ `796a583f`.
**Método:** cuatro revisores de contexto fresco, superficies disjuntas, cada uno con su
propio chromium (el MCP de Playwright es un navegador compartido: en paralelo se pisan
las pestañas). Arnés: `e2e/demo/_capture-live.ts` — screenshot desktop + mobile 390px +
texto visible + errores de consola por ruta.

Informes individuales:

| Superficie | Informe | P1 |
|---|---|---|
| Público / entrada, sin cuenta | `2026-07-28-live-publico.md` | 1 |
| Dueño / libreta / credencial | `2026-07-28-live-dueno.md` | 3 |
| Panorama y mapa | `2026-07-28-live-panorama.md` | 3 |
| Operativa: colas, casos, vigilancia | `2026-07-28-live-operativa.md` | 6 |

**13 P1 en total.** Ninguno fue inventado: cada uno llega con el texto en pantalla
citado, la captura, y en casi todos el `archivo:línea` que lo causa.

---

## Antes de nada: la app estaba rota en vivo cuando fui a lanzarlos

`:3000` servía HTML donde iban los chunks de JS (`webpack-*.js` → 400, MIME `text/html`).
Causa: un `pnpm verify` mío había reconstruido `.next` bajo el servidor corriendo. El
servidor tenía dos días (arrancado el 26/7 19:51) contra un build del 28/7 19:31.

Si lanzaba los cuatro revisores contra eso, los cuatro reportaban lo mismo y no revisaban
nada. Reconstruí y reinicié antes de arrancar. **Esto ya estaba anotado en memoria y casi
lo piso igual** — queda como paso obligatorio del brief: nadie corre `build` mientras hay
revisores vivos.

---

## Lo que se arregló en esta misma sesión

### Panorama P1-1 — la leyenda decía "mejor" en el extremo equivocado

La píldora colapsada mostraba `Cobertura antirrábica (perros, 12m) | 40% · mejor | ▮▮▮▮ |
80% meta`, con el swatch **más pálido** del lado "mejor" y el más oscuro en la meta. Igual
en esterilización, microchip, PPP y antiparasitario: **cinco vistas, justo las de
cumplimiento legal**, las que miden a una jurisdicción.

Causa, una línea: `PanoramaConsole.tsx` pasaba `captionLayer?.higherIsBetter === true`.
`higherIsBetter` es **tri-estado**: `true` → "mejor" arriba, `false` → "mejor" abajo,
`undefined` → **ninguna palabra**, porque la capa declara una meta y ahí "oscuro = meta
cumplida" es la lectura establecida. El `=== true` aplastaba `undefined` en `false`.

La función pura estaba correctamente testeada en los tres estados — con capas
**sintéticas**. Nadie había pasado las capas reales del registro por ella, y nadie testeaba
el call-site. Arreglado, con tres tests nuevos: las capas reales, el caso contrario, y un
guard sobre el propio call-site (re-inyectar `=== true` hoy falla).

**Hallazgo lateral del test:** `indice-territorial` declara meta **y** polaridad, y para él
"más es mejor" es correcto. Tener meta y tener polaridad son independientes — el revisor no
había trazado esa distinción.

### Panorama P1-3 — `/gob/mortalidad` rompía su propia promesa de k-anonimato

La descripción accesible del gráfico promete "Localidades con menos de 5 fallecimientos
están ocultas por privacidad (k-anonimato)" y la página renderizaba
`Tierra del Fuego (otras localidades) — 2`.

El rollup de k-anonimato pliega las localidades suprimidas en **una** fila con el total —
pero **el rollup también es una celda publicada**, y k le aplica igual. Plegar una sola
localidad de 2 en "(otras localidades) — 2" no anonimiza nada: republica su cuenta exacta
con otro nombre.

Arreglado: por debajo de k, la fila no se publica. No se pierde información para el lector
— `suppressedCount` sigue reportando cuántas localidades se ocultaron, sin decir cuántas
muertes tienen. La regla se extrajo a función pura (`rollupSuppressedLocalities`) para que
sea testeable sin base de datos: una regla de privacidad que sólo se ejerce si el seed
tiene la forma justa es una regla que nadie chequea.

---

## Decisión tuya, no mía

### La libreta afirma "sin aplicar" sobre una dosis firmada por un veterinario

`findVaccineByName` es igualdad exacta en minúsculas. El catálogo dice
`"Séxtuple (DHPPi-L)"`, el evento firmado dice `"Séxtuple"` → no matchea. Resultado: la
dosis con matrícula (lote VG-2026-25, vence 20/09/2026) se archiva como "1 vacuna fuera del
calendario" **y** la entrada core reporta `missing`. El dashboard dice **"2 vacunas del
calendario recomendado sin aplicar"** a unos cinco centímetros del registro firmado.

**No lo toqué, y por una razón**: `libreta-health-status.ts:133-135` dice textualmente
*"We deliberately do NOT fuzzy-match against the catalog."* Es una decisión documentada
sobre datos médicos, no un olvido. Pero el lado veterinario del mismo sistema
(`vaccine-reminder-state.ts`, `atender-vaccine-gate.ts`) **sí** matchea difuso, con umbral
`VACCINE_AUTOSELECT_CONFIDENCE = 0.85`. Mismo dato, dos matchers, respuestas opuestas.

| | Opción | Riesgo |
|---|---|---|
| (a) | Matchear difuso a ≥0.85 en la libreta, igual que el lado vet | Consistencia total; puede matchear la vacuna equivocada |
| **(b)** | **RECOMENDADA** — mantener exacto, pero **nunca afirmar "sin aplicar"** cuando hay una dosis libre sin matchear: degradar a "sin confirmar / revisar" | El sistema no adivina, pero tampoco miente. Cambio chico |
| (c) | Normalizar en **escritura**: que el form del vet guarde el nombre del catálogo | Arregla el futuro, no los eventos ya firmados (spine append-only) |

Recomiendo **(b)** y, en paralelo, **(c)** para que el problema no siga creciendo.

---

## Los que quedan abiertos, por gravedad

### Números que un funcionario ve mal

1. **"Atrasadas" esconde 3 de 7 denuncias vencidas** — incluida una *crítica* 3 días pasada
   de un SLA de 1 día. La tab usa una regla plana de 7 días; el badge de la fila usa
   `isSlaBreached` con escalones por severidad (1/3/7/14d). `welfare-sla.ts:10-18` documenta
   la divergencia **en su propio encabezado** y nadie reconcilió la tab. La tab dice 5,
   siete filas dicen `VENCIDO`, y una fila que sí está en la tab dice "SIN SLA ACTIVO".
2. **"Mascotas recuperadas (260)"** — la tab mapea a `status=active`, o sea el padrón vivo
   entero. El KPI de la misma página dice `RECUPERADOS (30D) 2`.
3. **"Denuncias escaladas: ABIERTOS 28"** — `countCasesForGovt` no lleva filtro de `kind`.
   `kind=welfare_denuncia` devuelve **0** filas en todos los estados. Los 28 son expedientes
   de custodia.
4. **Disputas de custodia duplicadas** — 11 en la tab Casos (tabla `cases`, códigos `CAS-`,
   sin acciones) contra 1 en Disputas (tabla `custody_disputes`, tokens `DIS-`, con formulario
   de resolución). La misma disputa bajo dos códigos, con chips `ABIERTO` / `ABIERTA`.
5. **El mapa de vigilancia se alimenta de `eq(cases.status,'open')`** — pinta disputas de
   custodia como geografía epidemiológica, en una página donde todos los indicadores epi
   marcan 0.
6. **Los choropleth por provincia no aplican k-anonimato** (`toProvinceChoroplethCells` no
   tiene umbral) mientras el badge siempre-visible `⊘ k<5 protegido` afirma que sí. Santa Cruz
   se publica como `100%` de cobertura sobre 11 mascotas cuya única celda departamental está
   suprimida.

### Cosas que no se pueden hacer

7. **El detalle de caso es de sólo lectura para todos los kinds.** Cinco detalles, cuatro
   kinds, y el único control encontrado fue "Activar mapa interactivo". La fila #1 de urgencia
   de la cola (650 días) abre a una página muerta, mientras el hub promete "abrir, sumar
   partes, resolver".
8. **SC-6 confirmado y cuantificado.** El server trae `openedAt DESC LIMIT 50`; la urgencia
   (`edad × peso`) es un sort **del lado cliente sobre esa página**. Están invertidos: página 1
   máximo 76, página 12 máximo 184, y las disputas de 650 días puntúan 1300.
9. **Transferencia saliente invisible.** Rocco tiene una transferencia pendiente viva.
   `/transferencias` la renderiza bien — pero el único link ciudadano a esa ruta tiene badge
   gateado en un conteo **sólo de entrantes** con `hideWhenZero`: con 0 entrantes la card
   desaparece y la ruta queda huérfana. Nada en el animal, ni en el índice, ni en la bandeja.
   Y `TransferSenderForm.tsx:117` promete "podés cancelarla".

### Entrada y primera impresión

10. **D.7 confirmado, y el comentario que lo justifica es falso.** El link de ingreso está
    `display:none` a ≤560px (límite medido: 560 oculto, 561 visible) y `LandingNav` **no tiene
    hamburguesa a ningún ancho**. No colapsa: pierde la entrada. El comentario en
    `globals.css:872` dice *"sign-in stays reachable from the footer and the hero"* — los links
    existen, pero el más cercano está a **y = 12.260px** a 375px. Unos quince scrolls.
11. **La credencial se pisa a sí misma en 390px** — "CREDENCIAL PÚBLICA" renderiza a 2px de
    ancho contra 58px de contenido (96,5% recortado). Limpio en 320 y 360. 390 es el ancho más
    común en Argentina.
12. **Dos formularios rivales de "lo encontré"** — uno inline con **cero** campos requeridos,
    otro (`/encontre`) con tres, incluido un pin en mapa. El barato está enterrado; el caro
    tiene el botón primario.
13. **Mascotas de prueba E2E encabezan `/perdidas` público** — `ProbeAlta-1785241484517` y
    `E2EPet-1785241569076`, arriba de casos reales.

### Vistas de plan confirmadas

- **C.1** — peor de lo descrito: no hay chips de filtro (tres tiles de estado, dos
  deshabilitados), y `/libreta`, `/vacunas` e `/historial` son **byte-idénticas** (md5
  verificado en ambos viewports) mientras `PetReminders.tsx:106` sigue linkeando a `?tab=vacunas`.
- **D.4** — **cinco** anatomías distintas de fila en seis colas (4 ubicaciones de conteo, 4
  formatos de fecha, 4 tratamientos de estado, 4 ubicaciones de código).
- **D.3** — **seis** gramáticas de confirmación más dos caminos sin confirmación, y la
  asimetría está al revés: reasignar un decomiso pide modal + "Confirmar reasignación" + "no se
  puede deshacer", mientras **cerrar una denuncia Ley 14.346** recibe un "Confirmar" genérico inline.
- **D.2** — los quiebres reales de género son `ABIERTO`/`ABIERTA` sobre una misma disputa,
  `RECUPERADOS` vs `Recuperadas` en una misma pantalla, y `Dueño actual` contra el propio
  `dueño/a` de la app. Los chips de denuncias y pérdidas están bien.
- **D.5** — piso perceptual medido: ΔE00 clase-1 vs sin-datos = 4,62; sin-datos vs fondo del
  mapa = **2,61**; contra 10,77 entre dos clases de datos adyacentes.
- **D.8** — **Inscribir → Registrar → Crear** en un solo camino ininterrumpido, y después
  INSCRIPTO vs REGISTRADA para el resultado.

---

## Lo que aguantó (importa igual)

- **CSP × prerender está arreglado** en el 404 y en `/recuperar`: cero errores de CSP, y
  `/recuperar` de verdad envía y devuelve la confirmación anti-enumeración.
- **La privacidad del dueño no filtra.** Se escaneó texto renderizado *y* `outerHTML` crudo
  buscando teléfono/mail/DNI/lat-lng/calle en dos credenciales perdidas: sólo un `href` `tel:`,
  correctamente gateado.
- **El k-anonimato a grano departamental sí funciona** — texto de rechazo honesto, polígono
  rayado, y `suppressed: true` en la API.
- **"Asentar" quedó bien** (B.7): href según contexto, abre en el lugar, sin navegación.
- **La affordance de drill existe** — `<select>` reales y etiquetados.
- **URL determinística** (round-trip byte-idéntico) y **reset de cámara** al cambiar vista
  (z 8,22 → 4,22).
- **La polaridad del ranking es correcta en ambas direcciones** — el bug estaba confinado a
  la leyenda.
- Paginación por keyset, persistencia de filtros, cerco jurisdiccional y a11y de
  `ConfirmDialog`: presionados y firmes.

## Sobre los revisores mismos

Tres de los cuatro **se retractaron de un hallazgo propio** antes de entregar: uno midió un
`<details>` cerrado y lo leyó como formulario vacío; otro leyó `transferencias/page.tsx:28-62`
y paró antes de la línea 67, casi enviando un falso positivo que sólo manejar la app en vivo
descartó; otro tomó una carrera de su propio script por un bug de paginación. Un cuarto
presionó el modelo de procedencia buscando una contradicción, no la encontró, y lo puso en
"lo que aguantó".

Eso es lo que hace utilizable un informe adversario: que diga también dónde se equivocó.
