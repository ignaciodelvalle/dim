# La pasada de los 703 — capturas antes/después (P4.1, 2026-07-31)

**Leé esto ANTES de mirar las imágenes.** Si no, vas a reportar como regresión
algo que es un arreglo.

## Qué se arregló

`text-[var(--text-sm)]` y sus siete hermanos **no fijaban ningún tamaño de
letra**. Tailwind v4 no puede saber si un `text-[…]` arbitrario es un tamaño o
un color, y con una variable CSS pelada elige **color**. Del CSS compilado,
literal:

```
.text-\[var\(--text-sm\)\]{color:var(--text-sm)}     <- MUERTA
.text-sm{font-size:var(--text-sm);line-height:…}     <- FUNCIONA
```

`color: 12px` no es un `<color>` válido, el navegador descarta la declaración,
y el elemento se queda con el tamaño que **heredó**. Se acumularon **703** de
estas (207 archivos) sin que fallara nada: ni el build, ni el fence de tokens,
ni 12.5k tests.

Esta pasada reemplaza las 702 que quedaban vivas por la utilidad nombrada
equivalente. Mismo token, misma fuente de verdad — pero ahora se aplica.

## Los tres avisos que cambian cómo se leen las capturas

### 1. Los textos cambian de tamaño. Ese ES el arreglo.

Nada se "achicó por error". Cada elemento pasó del tamaño que heredaba al
tamaño que su autor había elegido y que nunca se había aplicado. Medido en
píxeles computados sobre el navegador, no en el markup:

| Superficie | Elemento | Antes (heredado) | Después (intención) |
|---|---|---|---|
| `/gob/perdidas` | h1 "Mascotas perdidas" | 16px | **22px** (`--text-title`) |
| `/gob/panorama` | valores KPI (0 · 4 · 13) | 13px | **18px** (`--text-lg`) |
| `/gob/panorama` | micro-etiquetas del riel | 13px | **10px** (`--text-xs`) |
| `/p/DIM-PAMP-0001` | "1" y "Sí" del resumen médico | 16px | **22px** (`--text-title`) |
| `/` (landing) | nombre "Pampa" de la credencial | 17px | **20px** (`--text-xl`) |

Sobre las 5 superficies capturadas hubo **107 elementos muertos en el DOM**:
103 cambiaron de tamaño, 4 no (explicados abajo), 0 quedaron sin conciliar.

### 2. Diecisiete elementos CAMBIAN DE COLOR. También es el arreglo.

Todas las utilidades `text-[…]` caen en un único bloque ordenado
alfabéticamente en el CSS compilado, y **`"color"` ordena antes que `"text"`**.
Con la misma especificidad gana la última regla del archivo: la regla muerta le
ganaba a la regla de color correcta, sin importar el orden en el `className`. Y
como `color: var(--text-sm)` es inválido, el elemento caía a color
**heredado** — un color que nadie eligió.

Al sacar la clase muerta, el color que el autor sí había declarado se aplica
**por primera vez**. Verificado píxel contra píxel (el color del token se
resolvió *en la página viva*, nunca contra un hex del código fuente):

| Dónde | Antes (heredado) | Después | Token declarado (resuelto por el navegador) |
|---|---|---|---|
| Riel del operador: SITUACIÓN / PROGRAMA / INTERVENCIÓN / BANDEJA OPERATIVA / PROFUNDIDAD | `rgb(220,230,241)` | `rgb(147,168,191)` | `--color-ln-op-rail-mute` = `rgb(147,168,191)` ✔ |
| Landing: bajada "El registro nacional de identidad y salud…" | `rgb(27,42,51)` | `rgb(97,110,119)` | `--color-ln-mute` = `rgb(97,110,119)` ✔ |
| `/cuenta`: iniciales "DD" del avatar | `rgb(27,42,51)` | `rgb(60,75,85)` | `--color-ln-ink-2` = `rgb(60,75,85)` ✔ |

Contraste medido en vivo después del cambio: micro-etiqueta del riel
**5.19:1** sobre el navy del riel, y las cuatro micro-etiquetas de la consola
del landing entre **4.53:1 y 4.91:1**. Todas siguen pasando WCAG AA.

*(El análisis del 2026-07-30 proyectó 85 elementos con esta condición en todo
el código. 17 de ellos caen dentro de las 5 superficies capturadas; los otros
viven en pantallas que esta pasada no fotografía.)*

### 3. Cuatro elementos NO cambiaron de tamaño, y está bien

- **2 en `/cuenta`** (`h3` "Datos de la cuenta", "Verificaciones de
  identidad"): pedían `--text-base` = 16px y ya heredaban 16px del `body`. El
  bug era invisible ahí. Ahora es explícito.
- **2 en el landing** (`.lp-lead`): la regla `.lp .lp-lead` de `globals.css`
  tiene especificidad 0,2,0 y le gana a cualquier utilidad de una sola clase.
  Sigue mandando su `clamp(17px, 1.7vw, 21px)`. La utilidad era inerte antes y
  sigue siendo inerte — **deuda latente, no una regresión**: alguien puso un
  `text-lg` sobre un elemento cuyo tamaño ya estaba decidido por CSS propio.

## Los archivos

| Archivo | Qué es |
|---|---|
| `01-landing-{before,after}.png` | `/` — página completa (10.315 px de alto; la región que cambia es la consola de vigilancia) |
| `01b-landing-consola-DETAIL-after-only.png` | recorte de esa consola. **Solo hay versión "after"**: se recortó cuando el servidor ya corría el build nuevo. La evidencia antes/después de esa región son las mediciones numéricas |
| `02-credencial-publica-{before,after}.png` | `/p/DIM-PAMP-0001` |
| `03-panorama-{before,after}.png` | `/gob/panorama` |
| `03b-panorama-estadisticas-{before,after}.png` | idem con el panel "Estadísticas" desplegado (la superficie más densa: `PanoramaConsole.tsx` sola tenía 30 usos) |
| `03-panorama-before-ERROR.png` | primer intento fallido: el harness esperaba un `<h1>` y **`/gob/panorama` no tiene ninguno** (su título es la banda "CENTRO DE SITUACIÓN"). Se deja como evidencia de que la falla era del harness, no de la página |
| `04-cola-gob-perdidas-{before,after}.png` | `/gob/perdidas` — la cola gob |
| `05-cuenta-{before,after}.png` | `/cuenta` |
| `measurements-{before,after}.json` | píxeles computados (`getComputedStyle`) de cada elemento rastreado, con su ruta en el DOM como identidad estable |

## Cómo se midió (regla 8: píxeles computados, no DOM)

El fence es ciego al CSS que no se aplica: una clase en el markup no prueba
nada. Cada elemento se identificó por su **ruta en el DOM** (cadena de
`nth-child`), que sobrevive a un cambio que solo toca strings de clases, y se
leyó su `font-size`, `line-height` y `color` **efectivos** antes y después.
Las 6 superficies devolvieron exactamente la misma cantidad de elementos
rastreados en ambas corridas (54 · 24 · 73 · 92 · 81 · 91) y **0 rutas sin
conciliar** — o sea, el DOM no se movió; solo cambió lo que se pinta.

Las páginas hacen streaming detrás de `loading.tsx`: con `waitUntil:"load"` el
`h1` ya existe pero está oculto y se fotografía el esqueleto "Cargando…". El
harness espera `state:"visible"` antes de medir.

## Efecto secundario documentado del rename

`text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` / `text-2xl`
arrastran el `line-height` por defecto de Tailwind, que hoy no se aplicaba
(se ve en la columna `lh` de la conciliación: p. ej. 18.85px → 13.33px junto al
10px). `text-md` y `text-title` son tokens propios del proyecto y **no** tienen
compañero de `line-height`: quedan limpios.

Además `--text-xs` (10px) y `--text-sm` (12px) pisan la escala de Tailwind
(12/14). No es un problema; explica por qué se ven más chicos que en cualquier
otro proyecto.

## Lo que NO se tocó

`text-[var(--color-*)]` — **1.874 usos en 263 archivos**, unas 3× la población
muerta. Esos **funcionan** (el nombre de la variable lleva `color-`, que es
justo lo que deja a Tailwind inferir el tipo). Contados antes y después de la
pasada: 1.874 / 263 en ambos casos. Cero tocados.
