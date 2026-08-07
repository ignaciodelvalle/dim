# SC-7 — la pasada de las 520 familias muertas (P4.2, 2026-07-31)

**Leé esto ANTES de mirar las imágenes.** El cambio es grande y a propósito.

## Qué estás mirando

Elementos que **se venían renderizando en la tipografía heredada** (`Encode
Sans`, la del `body`) ahora se renderizan en la familia que su autor había
elegido: **IBM Plex Mono**, **IBM Plex Serif** o **IBM Plex Sans**.

Nada se "cambió de fuente por error". Cada elemento pasó de la familia que
heredaba a la que tenía declarada y que **nunca se aplicó**.

## Qué estaba roto

`font-` es tan ambiguo para Tailwind v4 como lo era `text-`: es el prefijo de
`font-family`, `font-weight` **y** `font-style`. Con una variable CSS pelada,
Tailwind elige **font-weight**. Del CSS compilado, literal:

```
.font-\[var\(--font-ln-mono\)\]{--tw-font-weight:var(--font-ln-mono);
                                font-weight:var(--font-ln-mono)}   <- MUERTA
.font-ln-mono{font-family:var(--font-ln-mono)}                     <- FUNCIONA
```

`--font-ln-mono` es una **pila de fuentes** (`"IBM Plex Mono", "Menlo",
monospace`), no un `<font-weight>`. La declaración es inválida, el navegador la
descarta, y el elemento se queda con la familia que **heredó**. Se acumularon
**520** de estas en **143 archivos** sin que fallara nada: ni el build, ni el
fence de tokens, ni la suite de tests. Era invisible para todo salvo para una
lectura de estilo computado.

Es el gemelo exacto de la pasada de los 703 (`../2026-08-01-703-pass/`), y
quedó sin fence por la misma razón por la que aquella pasó desapercibida: la
regla `DEAD_TEXT_VAR` estaba anclada al prefijo `text-`, así que **esta
población no tenía guard ni baseline**.

## La población real

| | Reportado en la spec | **Medido** |
|---|---|---|
| Usos | 521 | **520** |
| Archivos | 144 | **143** |

Desglose medido: **mono 348 · serif 135 · sans 37**.

La diferencia de -1/-1 es benigna (un ratchet sólo se queja si sobra, no si
falta), pero la spec no era exacta — igual que en la pasada de los 703, donde
"703, cero drift" resultó ser 702. Los otros 2 usos que aparecen en un `rg` sobre
todo el repo son **prosa en `docs/`**, no código.

## La evidencia: píxeles computados, no markup

Una clase en el HTML no prueba nada. Se leyó `getComputedStyle().fontFamily`
elemento por elemento, **antes y después**, emparejando por ruta del DOM
(cadena de `nth-child`), sobre 7 superficies.

| Superficie | Elementos con la clase muerta | Cambiaron de familia | Sin conciliar |
|---|---|---|---|
| `/` (landing) | 33 | 33 | 0 |
| `/p/DIM-PAMP-0001` (credencial) | 29 | 29 | 0 |
| `/adoptar` | 13 | 13 | 0 |
| `/cuenta` | 23 | 23 | 0 |
| `/transferencias` | 15 | 15 | 0 |
| `/gob/perdidas` | 0 | 0 | 0 |
| `/gob/panorama` | 0 | 0 | 0 |
| **Total** | **113** | **113** | **0** |

**113 de 113**, cero elementos sin explicación, cero rutas del DOM sin
emparejar. Que los totales de elementos por superficie sean idénticos antes y
después (1003 · 159 · 275 · 252 · 154 · 372 · 332) prueba además que **el DOM no
se movió**: sólo cambiaron cadenas de clases.

Ejemplos concretos, leídos de la página viva:

| Dónde | Elemento | Antes (heredado) | Después (intención) |
|---|---|---|---|
| `/p/DIM-PAMP-0001` | "Credencial pública" | Encode Sans | **IBM Plex Mono** |
| `/p/DIM-PAMP-0001` | inicial "m" del sello | Encode Sans | **IBM Plex Serif** |
| `/cuenta` | "MI MASCOTA ARGENTINA" | Encode Sans | **IBM Plex Mono** |
| `/cuenta` | botón "Cerrar sesión" | Encode Sans | **IBM Plex Sans** |
| `/` | nombre "Pampa" de la credencial | Encode Sans | **IBM Plex Serif** |
| `/adoptar` | "4 mascotas" | Encode Sans | **IBM Plex Mono** |

### Además: 116 elementos cambiaron por herencia

No llevaban la clase muerta, pero **heredan** de un ancestro que sí. Es el mismo
arreglo, propagado. Por eso el efecto se ve más grande que "113 elementos".

### Las dos superficies de gobierno son el control

`/gob/perdidas` y `/gob/panorama` ya usaban la utilidad nombrada, así que no
tenían un solo uso muerto. Se capturaron igual **a propósito**: comparadas píxel
contra píxel, dan **0 píxeles de diferencia** (0.000%). Es la prueba de que la
pasada no tocó nada fuera de su población.

## Lo único que quedó peor — y se arregló

**La chapita "AL DÍA" del teléfono del landing se partía en dos renglones.**

IBM Plex Mono es más ancha que Encode Sans. El chip de estado
(`components/ui/StatusFlag.tsx`) no tenía guarda de wrap, y el llamador más
angosto perdió por **0,9 px**:

| | Ancho × alto | Renglones |
|---|---|---|
| Chip "AL DÍA" que se partía | 70 × 34,8 | **2** |
| Sus hermanos idénticos | 70,9 × 20,4 | 1 |
| Después del arreglo | 70,9 × 17,3 | **1** |

Arreglado con la utilidad correcta — `whitespace-nowrap` en el primitivo, no
volviendo al patrón muerto. Una chapita de estado es un token único y nunca
debería partirse; el arreglo cubre a **los 17** chips de la superficie, no sólo
al que falló. Medido después: **0 de 17 se parten**.

Fuera de eso, **ninguna superficie quedó peor**:

- **No hay prosa larga en monoespaciada.** El texto más largo que pasó a mono
  tiene 60 caracteres. **53 de las 74** conversiones a mono de las superficies
  capturadas son `uppercase` — el registro de etiqueta/rótulo, que es
  exactamente para lo que se eligió la mono.
- Los dos textos de la credencial que **no** son rótulos ("El dueño habilitó la
  libreta médica de forma permanente" y "Esta vista no expone contacto del
  dueño…") llevan `tracking-[.02em]` en el código: el autor **afinó el
  interletrado para una monoespaciada**. La intención está documentada en el
  código, así que se respeta.
- **El layout casi no se movió.** Altura de página antes → después: seis de las
  siete superficies dan **exactamente 0** de diferencia. La única que crece es la
  credencial, **+13 px**, porque la nota de privacidad de 9,5 px pasa a dos
  renglones. Es una nota micro dentro de una tarjeta: no es una regresión.
- **El titular del landing no cambió** ("Toda una vida, en una sola miMAR."). Lo
  gobierna el CSS a mano de `.lp` en `globals.css`, cuya especificidad le gana a
  cualquier utilidad de una sola clase. Mismo hallazgo que en la pasada de los
  703 con `.lp-lead`: **deuda latente, no regresión**.

## El fence nuevo (esta población no tenía ninguno)

- **Regla 10, `DEAD_FONT_VAR`** en `scripts/check-design-tokens.ts`.
- Categoría `deadFontVar` en el baseline, en **0 para los 456 archivos**. A
  diferencia de la regla 9, esta **nace en cero**: cualquier hit es una
  regresión nueva, no deuda heredada.
- **No** está limitada a las tres familias que existen hoy
  (`font-[var(--font-ln-loquesea)]` también cae), para que un token futuro no
  pueda reintroducir la misma forma muerta.
- `_meta.totalViolations` **no cambia** (1751): se sumaron ceros.
- Dientes verificados: se reintrodujo el patrón a mano y el fence salió en rojo
  con el mensaje correcto; se restauró y volvió a verde.

## Un aviso para quien audite esto después

**El CSS compilado NO sirve como prueba de que esto se arregló.** Tailwind v4
sin `@source` explícito escanea todo el proyecto — incluidos `docs/`,
`scripts/` y `__tests__/`. Este mismo README nombra el patrón, así que las
reglas muertas **siguen emitiéndose** en el CSS aunque no haya un solo elemento
que las use. La prueba de esto es que el CSS compilado hoy contiene una regla
para `--font-ln-display`, un token que **no existe en ninguna parte** salvo como
caso negativo en `__tests__/check-design-tokens.test.ts`.

La fuente de verdad es el **fence sobre el código fuente** (regla 10) y la
**medición en píxeles computados**, no un `grep` sobre el CSS.

## Archivos

- `NN-<superficie>-{before,after}.png` — página completa, 1440 px de ancho.
- `01c-landing-consola-DETAIL-*` — el recorte donde el landing efectivamente
  cambia (la consola y el teléfono). El resto del landing casi no se mueve:
  0,183 % de píxeles distintos en toda la página.
- `02b-credencial-cuerpo-DETAIL-*` — el cuerpo de la credencial, que es la
  superficie más afectada (1,754 % de píxeles distintos).
- `04b-cuenta-encabezado-DETAIL-*` — encabezado de `/cuenta`.
- `measurements-{before,after}.json` — familia, peso, tamaño y color computados
  de **cada** elemento, con su ruta de DOM.
- `reconciliation.txt` — la conciliación elemento por elemento.
