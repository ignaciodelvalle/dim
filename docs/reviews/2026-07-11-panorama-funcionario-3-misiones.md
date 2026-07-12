# Panorama (:3001, rediseño) — Funcionario nacional: 3 misiones + hallazgos

**Fecha:** 2026-07-11 (ART) · **Entorno:** `http://localhost:3001` · admin universal (datos sintéticos de demo)
**Rol:** funcionario nacional usando el Centro de Situación Nacional para 3 decisiones reales.
**Método:** recorrí presets, capas, alcance (nacional↔provincia↔depto), períodos y la línea de tiempo; abrí los paneles del riel; leí los datos por el dock (Registros/Estadísticas) y por DOM/CSV. Anoto decisiones **y** dónde el mapa, el rótulo y los números no coinciden.

---

## TL;DR (para el director apurado)

- **Misión 1 — campaña antirrábica → SALTA.** Peor cobertura del país: **43,3%** (−37 pts vs meta 80%). También la más baja en esterilización (21,3%) y microchip (21,2%).
- **Misión 2 — focos zoonóticos (norte) → SALTA es el foco #1 (26 señales/30d)**, seguida de Catamarca (12), Chaco (6), Jujuy (5), Misiones (5), Corrientes (4). Salta combina **altas señales × baja cobertura** = el rincón de riesgo. Watch de la semana: Salta, Catamarca, y el clúster NEA (Chaco/Corrientes/Misiones).
- **Misión 3 — auditoría de bienestar → peores zonas por denuncias: Buenos Aires (195), Córdoba (118), Santa Fe (77)**; y en el norte Tucumán (42), Sgo. del Estero (37), Chaco (33). **Pero "qué venimos haciendo" (decomisos) NO se puede cuantificar en Panorama** (ver hallazgo H5).
- **Bonus:** tocar **cobertura Buenos Aires no rompe nada** ✅ — el fix de revalidación aguanta.
- **Hallazgo estrella (consistencia):** al mover la **línea de tiempo**, el **mapa** y los **Registros** cambian pero los **KPIs no** → el mapa dice una cosa y el número, otra (H1).

---

## Misión 1 — Planificador de campaña antirrábica

**Cómo lo resolví:** Vista → *Cumplimiento antirrábico* → dock *Estadísticas* → "PEORES 10 JURISDICCIONES".

**Ranking (cobertura antirrábica, % · pts vs meta 80):**
Salta 43 (−37) · Chubut 49 (−31) · La Rioja 51 (−30) · Tucumán 52 (−28) · Neuquén 53 (−27) · Formosa 55 (−25) · Catamarca 59 (−21) · Sgo. del Estero 63 (−18) · Santa Cruz 64 (−17) · …

**Decisión: SALTA.** Es la peor del país por lejos (−37 pts), y arrastra esterilización (21,3%) y microchip (21,2%) igual de bajos → provincia sub-atendida de forma integral, no solo en rabia. Mejor ROI para una única campaña.

**Lo que le mostraría al director:** el ranking "Peores 10" (exportable por *Exportar CSV* / *Copiar vista* con la URL exacta de la vista) + la ficha de Salta (43,3% / −37 / 21% esteril / 21% chip).

**⚠️ Fricción real (H2):** cuando drilleo Salta para decidir **en qué departamento** hacer la campaña, el mapa se vacía: "**Sin datos para esta capa en este alcance**", **Registros 0**, ranking "**No pudimos calcular**". La cobertura solo existe a **grano provincia** (confirmado también en Buenos Aires) → **no puedo localizar la campaña por debajo de provincia dentro del tool.** El % provincial dice 43,3% pero el drill dice "sin datos".

**Nota:** el "Informe de situación" (el briefing que le pasaría al director de una) está **"en desarrollo"** — hoy tengo que armarlo a mano.

---

## Misión 2 — Cazador de focos zoonóticos (norte)

**Cómo lo resolví:** Vista → *Brotes activos* (zoonosis × cobertura) para el riesgo combinado, y → *Síntomas / vigilancia sindrómica* para trabajar la serie temporal; ranking real leído del dock *Registros*.

**Señales de zoonosis por jurisdicción (últimos 30 días):**
**Salta 26** · Santa Fe 17 · Buenos Aires 16 · **Catamarca 12** · Mendoza 8 · Entre Ríos 7 · Chaco 6 · Córdoba 6 · **Jujuy 5 · Misiones 5 · Corrientes 4 · La Rioja 4** · Neuquén 4 · Sgo. del Estero 3 · Tucumán 2 · Formosa 1 …

**Cruzado con cobertura (el mapa bivariado "Cobertura baja × señales altas"):** el norte se prende en las tintas de peligro. **Salta es el peor caso en ambos ejes** (26 señales **y** 43% cobertura) — población canina susceptible sin vacunar + señales activas = el setup clásico de brote.

**A vigilar esta semana (respaldado por datos):**
1. **Salta** — foco #1 y cobertura más baja. Prioridad absoluta.
2. **Catamarca** — 12 señales, cobertura 59%.
3. **Clúster NEA — Chaco (6) / Corrientes (4) / Misiones (5)** — señales concentradas y contiguas.
4. **Jujuy (5)** y **La Rioja (4, cobertura 51%)** — vigilancia de segundo anillo.

**Insight para el jefe:** *Salta responde a las dos misiones a la vez* (peor cobertura **y** más señales). Una sola intervención en Salta ataca el foco y el déficit de vacunación.

**⚠️ Con la línea de tiempo (que "es mi amiga") tuve problemas:**
- En *Brotes activos* la **línea de tiempo está muerta** ("Estado actual — cobertura no varía con la fecha de corte"): como la métrica **primaria** es cobertura (estática), el scrubber no hace nada, aunque la capa de zoonosis **sí** es temporal (H3).
- En *Síntomas* sí funciona, **pero el thumb del scrubber no responde a arrastrar ni a clickear la barra** — solo se movió por teclado/programático (H4). Cuando lo moví a **23-jun**, el mapa y *Registros* bajaron a **19**, pero el KPI siguió en **102** (H1).

---

## Misión 3 — Auditor de bienestar ("¿dónde están las peores zonas y qué venimos haciendo?")

**Cómo lo resolví:** Vista → *Bienestar y fiscalización* (denuncias + decomisos), dock *Registros*, período 90 días.

**Peores zonas por denuncias de bienestar (90 días):**
Buenos Aires **195** · Córdoba **118** · Santa Fe **77** · Tucumán 42 · Entre Ríos 38 · Sgo. del Estero 37 · CABA 36 · Chaco 33 · Corrientes 29 · Chubut 28 · Catamarca 24 …

**Lectura honesta:** el ranking es por **conteo crudo**, así que lo dominan las provincias grandes (BA/Córdoba/Santa Fe = volumen poblacional). Para "peores zonas" reales conviene per-cápita — **y el tool no ofrece una normalización per-cápita de denuncias** (solo "Mordeduras/10k hab."). Aun así, **Tucumán (42), Sgo. del Estero (37) y Chaco (33)** saltan como puntos calientes del norte relativos a su tamaño.

**"¿Qué venimos haciendo?" — acá el tool me deja a mitad de camino (H5):**
- Los **decomisos** (nuestra acción de fiscalización) se **dibujan en el mapa** (burbujas teal) pero **no aparecen en la tabla de Registros** (0 filas de decomisos; las 24 filas son todas "Denuncias de bienestar"). Son una capa de **"Referencia"** (map-only), no tabulada.
- Tampoco hay un KPI de decomisos (solo "Denuncias activas 2.202" y "Mordeduras/10k").
- ⇒ **Desde Panorama no puedo cuantificar ni rankear nuestra respuesta.** Para contestarle al ministro "qué venimos haciendo" tengo que ir a los módulos **Casos / Decomisos / Moderación** (que están en el menú, pero el Centro de Situación no los resume).

**Respuesta que le daría al ministro:** "Recibimos ~2.200 denuncias activas de bienestar, concentradas en Buenos Aires, Córdoba y Santa Fe, con focos del norte en Tucumán, Santiago del Estero y Chaco. Hay decomisos en curso (visibles en el mapa), pero el tablero todavía no cuantifica nuestra respuesta — ese dato sale de Casos/Decomisos."

---

## Bonus — cobertura Buenos Aires (fix de revalidación)

Toqué **cobertura → Buenos Aires**: carga limpio, KPI provincial **64,0%**, sin pantalla blanca ni error. **El crash de revalidación no reproduce ✅.** (Igual que Salta, el mapa de departamentos queda "Sin datos" — límite sistémico de cobertura, no un bug de BA.)

---

## Hallazgos QA — lo que confunde, lo que falta, y dónde mapa↔rótulo↔números NO coinciden

### 🔴 Consistencia (lo que pediste vigilar)
- **H1 — Scrubber mueve el mapa y los Registros, pero NO los KPIs.** Con la línea de tiempo en 23-jun: mapa con menos burbujas + *Registros* 24→**19**, pero el KPI sigue en "**102 Zoonosis activas**" y "Datos al 11/7". El mapa y el número se contradicen. **Es el mismatch más importante.**
- **H2 — KPI provincial con dato, drill sin dato.** Salta muestra "43,3% cobertura" pero al entrar: mapa "Sin datos para esta capa en este alcance", *Registros 0*, ranking "No pudimos calcular". Sistémico (pasa igual en Buenos Aires) — cobertura solo existe a grano provincia.
- **H6 — Los números no cierran entre superficies.** Suma de *Registros* de denuncias = **965** vs KPI "**2.202** Denuncias activas". Suma de señales de zoonosis ≈ **142** vs KPI "**102** Zoonosis activas". Señales/registros vs "activas": no hay pista de por qué difieren.
- **H7 — "Datos al …" cambia con el alcance.** Nacional: 11/7 09:40 p.m.; Salta: 10/7 12:59 a.m. Si es "último evento en el alcance" está bien, pero leído como *frescura de datos* confunde (parece que Salta tiene datos más viejos).

### 🟠 Funcionalidad / flujo
- **H3 — Línea de tiempo muerta en *Brotes activos*.** La métrica primaria (cobertura) es estática y apaga el scrubber, aunque la capa de zoonosis del mismo preset es temporal. Justo el preset "de brotes" es donde no puedo reproducir la historia.
- **H4 — El thumb del scrubber no responde a mouse.** Ni arrastrar ni clickear la barra lo mueven (sí teclado/programático). Un funcionario con el mouse cree que la línea de tiempo está rota.
- **H5 — Decomisos: map-only, no tabulado.** Se ven en el mapa pero no están en *Registros* ni en KPI → no se puede medir la fiscalización desde el Centro de Situación (clave para "qué venimos haciendo").
- **H8 — "Peores 10 jurisdicciones" es SIEMPRE por cobertura.** No cambia con el preset ni al clickear otro KPI (probé Zoonosis). En *Brotes/Síntomas* no hay ranking por señales — tuve que leer/ordenar *Registros* a mano.

### 🟡 Confusión / diseño
- **H9 — Deltas de KPI implausibles.** "▲ +50%" aparece repetido (cobertura, mordeduras), y por provincia: Salta +46%, Buenos Aires **+76%** de cobertura. Una cobertura antirrábica no sube 50–76% en el período — parece delta mal calculado o mal etiquetado.
- **H10 — El mapa bivariado no tiene leyenda visible.** "Cobertura baja × señales altas" pero sin la grilla de color no sé qué tono = máximo riesgo.
- **H11 — El ícono de "Filtro" (embudo) abre un selector de CAPAS, no un filtro de datos.** No hay filtros por atributo (severidad, estado, "solo firmado"): "combinar N filtros" = capa × período × alcance, nada más. El embudo desorienta.
- **H12 — Mapa en blanco al entrar por URL directa.** En *Bienestar* las burbujas tardaron ~2–4 s en pintar (arrancó vacío con 2.202 denuncias y 24 registros). Latencia de carga, no bug duro, pero un funcionario ve un mapa vacío al abrir.
- **H13 — Sparkline sí, línea de tiempo no.** El KPI de cobertura muestra una sparkline de tendencia, pero la pestaña *Línea de tiempo* dice "No disponible en esta vista". Contradice la expectativa.
- **H14 — Drill por URL no vuela la cámara.** `?province=AR-B` sin `z/lat/lng` deja el mapa en vista nacional (el drill por `<select>`/click sí encuadra). Rompe el "compartir la vista".

### ✅ Lo que funciona muy bien
- **Rótulo ↔ KPI ↔ mapa re-sincronizan** al drillear y volver (Nacional 64,8% ↔ Salta 43,3% ↔ Nacional 64,8%; "Volver a Nacional" impecable).
- **"Peores 10 jurisdicciones"** es justo lo que un planificador necesita.
- **Registros** con orden/descarga por columna — pude sacar el ranking real de señales/denuncias por jurisdicción.
- **k-anon** ("k<5 protegido") presente y honesto; empty-states honestos ("Sin datos para esta capa en este alcance").
- **Mapa bivariado** de riesgo combinado: concepto muy fuerte para epidemiología (solo le falta leyenda).
- **Bonus verificado:** cobertura Buenos Aires no rompe.

---

## Qué mejoraría (priorizado, como usuario)
1. **H1/H6 — un solo "as-of" para toda la vista:** que KPIs, mapa, Registros y "Datos al" respondan al **mismo** corte temporal y de alcance. Que los números cierren (o explicar señales vs activas).
2. **H2 — cobertura por departamento/localidad** (o, si no hay dato, decir "cobertura solo a nivel provincia" en vez de "Sin datos") para poder localizar campañas.
3. **H3/H4 — línea de tiempo utilizable:** que funcione en *Brotes activos* (capa temporal manda) y que el thumb responda al mouse.
4. **H5 — tabular decomisos/fiscalización** (Registros + KPI), o linkear el resumen de "qué venimos haciendo".
5. **H8 — ranking por la métrica del preset** (señales en Brotes/Síntomas, denuncias en Bienestar), y **denuncias per-cápita**.
6. **H9/H10/H11 — arreglar los deltas de KPI, poner leyenda al bivariado, y renombrar el "Filtro" (es un selector de capas).**

---

### Anexo — datos crudos usados
- **Cobertura antirrábica (peores):** Salta 43 · Chubut 49 · La Rioja 51 · Tucumán 52 · Neuquén 53 · Formosa 55 · Catamarca 59 · Sgo. Estero 63 · Santa Cruz 64. Nacional 64,8%.
- **Zoonosis / señales (30d):** Salta 26 · Santa Fe 17 · Bs As 16 · Catamarca 12 · Mendoza 8 · Entre Ríos 7 · Chaco 6 · Córdoba 6 · Jujuy 5 · Misiones 5 · Corrientes 4 · La Rioja 4 · Neuquén 4 · … (KPI "activas" 102).
- **Denuncias de bienestar (90d):** Bs As 195 · Córdoba 118 · Santa Fe 77 · Tucumán 42 · Entre Ríos 38 · Sgo. Estero 37 · CABA 36 · Chaco 33 · Corrientes 29 · Chubut 28 · Catamarca 24 … (suma 965; KPI 2.202). Decomisos: no tabulados.
- No creé datos (solo lectura/navegación).
