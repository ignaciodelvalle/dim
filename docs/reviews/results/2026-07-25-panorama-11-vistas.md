# Panorama — las 11 vistas, una por una

> Pedido de PO (2026-07-25): qué escenario le planteamos a un funcionario en
> cada vista, **cómo lo ayudamos**, y qué artefactos del mapa usamos para
> resolver esa problemática.
>
> **Método**: las 11 abiertas en el build de producción, admin, alcance
> nacional, período por defecto de cada preset, 1600×1000, **con el cajón
> expandido** (ranking + leyenda + KPIs). Capturas y volcados en el scratchpad.

---

## El patrón que atraviesa todo

Antes del detalle, lo que se repite y explica casi todos los problemas:

**El ranking funciona mejor que el mapa.** En varias vistas la información existe
y es legible **en la tabla**, mientras el mapa está totalmente suprimido o pinta
marcas que no codifican nada. El artefacto que salva la vista es el que menos
protagonismo tiene.

**Tres vistas ordenan por población, no por problema.** Bienestar (Buenos Aires
187 → Córdoba 114 → Santa Fe 65 → CABA 49) y Pérdidas (Córdoba 210 → Buenos
Aires 205 → Santa Fe 106) son, esencialmente, el ranking poblacional de
Argentina. Un funcionario ya sabe que en Buenos Aires pasan más cosas. El toggle
per cápita existe y está **apagado por defecto**.

**Tres "Registros" son aritmética sin sentido**: 1.394,7 (decimal), −13.288
(negativo), y 154 con ranking vacío. Suman capas de unidades distintas.

---

## Vista por vista

### 1 · Brotes activos ❌

- **Escenario**: *¿dónde hay brotes activos sobre huecos de vacunación?*
- **Cómo lo ayudamos**: hoy, **casi nada por el mapa**. Las 24 provincias se
  pintan con la trama de supresión k<5 — el país entero rayado. Lo que salva la
  vista es el ranking: nombra departamentos reales con conteos (General José de
  San Martín, Salta 11 · Anta, Salta 11 · Capital, Salta 8…).
- **Artefactos usados**: coropleta bivariada (cobertura × señal), inset CABA,
  ranking, trama de supresión, línea de tiempo.
- **Por qué falla**: cruza *cobertura × zoonosis*; las señales de zoonosis son
  tan ralas que cada celda del cruce cae bajo k=5. **233 unidades suprimidas
  contra 9 visibles.** La protección funciona; la vista está construida sobre un
  cruce que no puede sobrevivirla.
- **Extra**: el ranking titula **"TUS 9 JURISDICCIONES"** en una vista nacional
  — la copia de alcance-chico explica el motivo equivocado (no son "tuyas", son
  las 9 que sobrevivieron a la supresión).

### 2 · Síntomas / vigilancia sindrómica ❌

- **Escenario**: *¿dónde se concentran los síntomas reportados con alerta?*
- **Cómo lo ayudamos**: no lo ayudamos. El ranking está vacío y el mapa dibuja
  ~150 círculos **todos del mismo tamaño y color** — sin magnitud, sin
  severidad, sin jerarquía. La capa de síntomas tiene **1** registro.
- **Artefactos**: símbolos graduados (que no gradúan nada), ranking, KPIs.
- **Contradicción**: el dock dice **Registros 0** y el KPI de la misma pantalla
  dice **119 señales**.
- **Lo único que funciona**: el estado vacío del ranking ahora dice la verdad
  epistémica ("Sin señales no es lo mismo que sin problema") — es el arreglo C4
  de esta corrida operando en producción.

### 3 · Cumplimiento antirrábico ✅ *(la vista modelo)*

- **Escenario**: *¿qué jurisdicciones están por debajo de la meta?*
- **Cómo lo ayudamos**: **bien, y es el patrón a copiar**. Coropleta secuencial
  contra meta (40% → 80%), y un ranking que responde la pregunta ordenado por lo
  que importa: Salta 45% (−35,5 pts) · Chubut 50% (−30,0) · Tucumán 50% (−29,7)…
  La columna **Brecha vs meta** convierte el valor en acción.
- **Artefactos**: coropleta con ancla en meta, leyenda con la meta marcada,
  ranking con brecha, hover-preview (de esta corrida) que muestra
  "La Rioja · 52% · Brecha −28,0 pts · Clic para entrar".
- **Defecto**: el dock cierra con **"últimos 90 días"** mientras la vista se
  describe **"estado actual"** y sus tres KPIs dicen ESTADO ACTUAL. Es el mismo
  mentir-por-cercanía que arreglamos en los KPIs; al dock no llegó.

### 4 · Registro PPP ✅

- **Escenario**: *¿qué jurisdicciones tienen bajo registro de PPP?*
- **Cómo lo ayudamos**: igual que Cumplimiento y igual de bien — La Pampa 17%
  (−63,3 pts) · Tierra del Fuego 20% (−60,0) · Salta 23% (−56,9).
- **Artefactos**: los mismos que Cumplimiento.
- **Confirma D1**: es la MISMA vista con otra métrica. Fusionable.

### 5 · Bienestar y fiscalización ⚠️ *(la default)*

- **Escenario**: *¿dónde se acumulan denuncias y decomisos?*
- **Cómo lo ayudamos**: el mapa se lee bien (936 registros, símbolos graduados
  con rango 1–187). Pero **el ranking responde la pregunta equivocada**: Buenos
  Aires 187 → Córdoba 114 → Santa Fe 65 → CABA 49 **es el orden poblacional**.
- **Artefactos**: símbolos graduados, dos capas, toggle per cápita, ranking.
- **El toggle per cápita es la respuesta correcta y está apagado por defecto.**
  Para una vista de *fiscalización* —donde la pregunta es dónde inspeccionar—
  el default debería normalizar.

### 6 · Control poblacional ⚠️

- **Escenario**: *¿estamos conteniendo la población? Cobertura de esterilización
  vs meta.*
- **Cómo lo ayudamos**: mismo patrón tasa-contra-meta de Cumplimiento, con
  ranking por brecha. Funciona.
- **Artefactos**: coropleta anclada en meta + ranking con brecha.

### 7 · Mortalidad ❌

- **Escenario**: *¿dónde se concentra la mortalidad registrada?*
- **Cómo lo ayudamos**: **el dock dice 154 registros y el ranking está vacío.**
  La leyenda muestra el rango 2–6: todos los valores caen bajo k=5, así que se
  suprimen todos.
- **Hallazgo sobre nuestro propio trabajo**: el estado vacío dice *"Ninguna
  unidad del alcance reportó datos suficientes para medir"* — y **eso es falso
  acá**: sí reportaron, pero la privacidad impide mostrarlo. El eje epistémico
  que introduje en C4 es binario (medido-cero / sin-señal) y **le falta un tercer
  estado: "medido pero protegido"**. Mi propio arreglo miente en esta vista.

### 8 · Pérdidas y reunificación ❌

- **Escenario**: *¿cuántas mascotas perdidas se reencuentran con su familia?*
- **Cómo lo ayudamos**: el mapa combina pérdidas (burbujas) con reunificación,
  y el KPI da la tasa (9,4%). Pero el dock dice **"Registros 1.394,7"** — un
  conteo de filas **con decimales**, porque suma conteos con una tasa.
- **Artefactos**: burbujas graduadas + capa señal, KPIs, ranking.
- **Y el ranking vuelve a ser poblacional**: Córdoba 210 → Buenos Aires 205 →
  Santa Fe 106.

### 9 · Desierto veterinario ❌

- **Escenario**: *¿qué zonas llevan más días sin actividad veterinaria?*
- **Cómo lo ayudamos**: no lo ayudamos. Registros 2.138, ranking vacío, y la
  leyenda dice **90 / 90** — todas las unidades en el máximo, o sea sin
  variación que pintar. La línea de tiempo dice "Sin eventos registrados".
- **Defecto de composición**: sus KPIs son **cobertura antirrábica y
  esterilización** — ninguno mide lo que la vista mapea. El operador ve el mapa
  de días sin veterinaria y ningún número que lo cuantifique.

### 10 · Tendencia ❌

- **Escenario**: *¿dónde hay más o menos eventos que en el período anterior?*
- **Cómo lo ayudamos**: no lo ayudamos. **"Registros −13.288"** — un conteo de
  registros **negativo**, porque suma los deltas con signo. Ranking vacío.
- **Artefactos**: coropleta divergente anclada en cero (rango −2371 / 2371).
- **Mismo defecto de composición**: sus KPIs son mordeduras, pérdidas y
  denuncias — ninguno es la variación que la vista pinta.

### 11 · Riesgo PPP ✅ *(el mejor mapa)*

- **Escenario**: *¿dónde se cruzan mordeduras altas con bajo registro PPP?*
- **Cómo lo ayudamos**: **la coropleta bivariada pintada entera** — 979
  registros, las 24 provincias con color, matriz 3×3 legible. Es la prueba de
  que el bivariado funciona cuando ambos ejes son densos.
- **Defecto**: la leyenda dice **"cobertura × señal"** — el vocabulario de
  *Brotes activos*. Esta vista cruza Registro PPP × Mordeduras. El registro de
  presets ya tiene `bivariatePair` con las palabras correctas; la leyenda no las
  usa.

---

## Los artefactos del mapa: cuál resuelve qué

| Artefacto | Resuelve | Dónde brilla | Dónde falla |
|---|---|---|---|
| Coropleta anclada en meta | "¿quién está bajo el umbral?" | Cumplimiento, Registro PPP, Control poblacional | — |
| **Ranking con brecha** | "¿por dónde empiezo?" | Las tres de arriba | Ausente en las de densidad |
| Coropleta bivariada | "¿dónde se cruzan dos problemas?" | Riesgo PPP | Brotes activos: se autosuprime |
| Símbolos graduados | "¿dónde hay más?" | Bienestar | Síntomas: no gradúan nada |
| Coropleta divergente | "¿subió o bajó?" | — | Tendencia: conteo negativo |
| Trama k<5 | proteger sin mentir | Todas | No se distingue de "sin datos" en el mapa |
| Hover-preview *(esta corrida)* | leer sin clic | Cumplimiento, Registro PPP | — |
| Estado vacío epistémico *(esta corrida)* | "ciego ≠ tranquilo" | Síntomas | Mortalidad: le falta "protegido" |
| Toggle per cápita | quitar el sesgo poblacional | — | **Apagado por defecto donde más se necesita** |

---

## Qué haría, por apalancamiento

1. **Los tres números imposibles** (−13.288, 1.394,7, y 154-con-ranking-vacío).
   Un conteo negativo en una consola de gobierno destruye la confianza en todo
   lo demás de la pantalla. Es lo más barato y lo más caro de no hacer.
2. **Tercer estado epistémico: "medido pero protegido"** — cierra la mentira que
   introduje en C4 y aplica a Mortalidad, Desierto y Brotes.
3. **Rescatar Brotes activos**: caer automáticamente a la señal sola cuando el
   bivariado suprime más de X% de las celdas, **y decirlo**.
4. **Per cápita por defecto** en las vistas de densidad, o al menos una segunda
   columna "por 10.000 hab." en el ranking. Sin eso, tres vistas contestan
   "dónde vive más gente".
5. **Que cada vista muestre KPIs de su propia métrica** (Desierto y Tendencia
   hoy muestran los de otras).
6. **La leyenda bivariada usando el `bivariatePair` de la vista.**
7. **Codificar los puntos de Síntomas** por magnitud y severidad.

## Comparativas que un funcionario todavía no tiene

- **Contra pares, no contra la escala nacional.** Un funcionario provincial
  necesita saber si su número es malo *para una provincia como la suya*.
- **Contra sí mismo en el tiempo**, sin cambiar de vista: hoy estado y variación
  son vistas separadas, y la decisión necesita las dos juntas.
- **Ranking por brecha × población**, el criterio que el plan maestro ya fijó
  para el briefing y que el mapa no usa.
