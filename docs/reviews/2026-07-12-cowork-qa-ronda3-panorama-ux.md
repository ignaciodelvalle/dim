# Cowork QA — Ronda 3 · Panorama, prueba de fluidez como funcionario

**Fecha:** 2026-07-12 (ART) · **Entorno:** `http://localhost:3001` (build actualizado, sincronizado a lo último) · datos sintéticos de demo.
**Cuenta:** `lucas@dim.test` (funcionario, `/gob/panorama`, scope **CABA · 5 localidades**: Palermo, Recoleta, Puerto Madero, Retiro, San Nicolás).
**Foco pedido:** rail derecho (íconos, "paneles sin toggle Simple/Detalle"), lista **"Peores 10 jurisdicciones"** en Estadísticas, tabla de **Registros**, y **cards de métricas** de la izquierda (¿se ve que son clickeables?). Consigna: *usalo de verdad y anotá lo que trabe/confunda/falte — no solo bugs, también ideas.*
**Método:** recorrí el panorama como lucas de punta a punta — abrí cada panel del riel, cliqueé las 4 cards, leí Registros y Estadísticas por DOM, moví la línea de tiempo programáticamente y por mouse, probé período largo, y verifiqué los fixes de rondas anteriores. No creé datos. Marco honestamente dónde no pude testear por límite de la automatización.

---

## TL;DR — ¿se puede usar con fluidez?

**Mayormente sí para navegar, pero hay tres cosas que te frenan de verdad y una que directamente confunde el dato.**

- ✅ **Mejoró desde la ronda 1:** el delta de KPI ya no dice "+50%/+1839%" — ahora es **"▲ +4 pts"** (unidad correcta). El rótulo de frescura pasó a **"Último evento en el alcance"**. Las cards seleccionadas ahora se marcan con **anillo azul + viñeta llena (●)**. Los empty-states siguen honestos.
- 🔴 **Lo que más confunde (dato):** la tabla de **Registros** dice **"Total: 0 registros"** y abajo muestra **5 filas con valores** (Palermo **204%**, Recoleta **157%**) — columna rotulada solo **"Valor"**, en **%** que pasa de 100, y que **cambia si prendés otra capa** (Palermo salta a **251%**). Nadie puede interpretar "Palermo 251%".
- 🔴 **Contradicción card ↔ mapa:** la card dice **"Cobertura antirrábica 64,4%"**, la cliqueás para pintarla, y el mapa responde **"Sin datos para esta capa en este alcance"** + Registros **"0 en 0 unidades"**. El número agregado existe; el detalle por localidad no. La UI no explica por qué.
- 🔴 **Delta se pega al scrubbear:** mover la línea de tiempo deja el delta **clavado en "+63 pts"** y **no vuelve** a "+4 pts" ni volviendo a "último evento" (solo con recargar). Y el **valor del KPI no se mueve** con la línea de tiempo ni con el período: el mapa cambia, el número no.
- 🟡 **"Peores 10 jurisdicciones" está vacío para un funcionario de comuna:** con 5 localidades dice **"Sin datos suficientes en este alcance"** — aunque Registros, al lado, muestra 5 unidades con datos. Inconsistencia entre dos pestañas del mismo dock.
- 🟡 **Simple/Detalle inconsistente:** se sacó de *Vista* y *Período*, pero **sigue en *Capas del mapa* y en *Reproducción temporal***.
- ↩️ **Corrijo un hallazgo mío de la ronda 1 (H4):** el scrubber usa un handler de puntero propio (`pointer-events:none` en el input, drag en el div padre). **No pude moverlo con la automatización, pero está hecho para mouse/touch** — así que retiro el "no responde al mouse": era artefacto de mi herramienta, no un bug confirmado.

---

## 1 · Cards de métricas (izquierda) — ¿se ve que son clickeables?

Las cuatro cards: **Cobertura antirrábica 64,4% (▲ +4 pts)**, **Esterilización 39,4%**, **Microchip 82,3%**, **Pérdidas activas 3**, todas con "ESTADO ACTUAL".

**Afordancia (a medias).** Al pasar el mouse aparece el tooltip *"Click para pintar el mapa por esta métrica"*, y la card activa se marca con **anillo azul + viñeta llena (●)** mientras las otras quedan con **○**. O sea: la señal de "seleccionada" **existe** — pero es sutil (viñeta chica) y en el estado inicial no queda claro cuál está activa. Un funcionario nuevo no adivina que son botones hasta que hace hover.

**🔴 El problema real es el comportamiento, no solo la afordancia.** Clickear las cards **modifica el set de capas del mapa de forma poco predecible**:
- Al tocar **"Cobertura antirrábica"**, el `layers` de la URL pasó de `zoonosis,cobertura` a `zoonosis` (le **sacó** una capa), pintó antirrábica y el mapa quedó en **"Sin datos para esta capa en este alcance"**.
- Al tocar después **"Esterilización"**, `layers` pasó a `zoonosis,esterilizacion` (le **sumó** una capa).

Un click quita, el siguiente suma; el rótulo del tooltip promete "pintar el mapa por esta métrica" pero a veces el resultado es "sin datos". El modelo mental (¿es un radio que elige UNA métrica, o un checkbox que apila capas?) no queda claro. **Se comportan como toggles de capa, pero se ven como KPIs.**

**🔴 Contradicción 64,4% ↔ "sin datos".** Es el hallazgo más fuerte de la sección: la card afirma con toda confianza **64,4% de cobertura antirrábica (▲ +4 pts, con sparkline)**, pero al pintarla el mapa dice **"Sin datos para esta capa en este alcance"** y el dock **"Total: 0 registros en 0 unidades · Sin datos por unidad para las capas activas en este alcance."** Para el funcionario es irreconciliable: *¿cómo hay 64,4% de cobertura si "no hay datos" de esta capa?* (Causa probable: el agregado se calcula sobre las 5 localidades juntas, pero por-localidad cada barrio cae bajo **k<5** y se suprime → agregado sí, detalle no. La lógica de privacidad es defendible; **la UI no la explica** y por eso lee como bug.)

> *Nota accesibilidad (menor):* las cards no exponen `aria-checked` correcto — quedan todas en `false` aunque una tenga el anillo azul. Un lector de pantalla no sabe cuál está activa.

---

## 2 · Rail derecho — recorrido panel por panel

Toqué los 7 íconos. De arriba a abajo:

| Ícono | Panel | Estado |
|---|---|---|
| Grilla | **Vista** (presets: Brotes, Síntomas, Cumplimiento, Bienestar, Control poblacional, Pérdidas) | 🟢 limpio, **sin** Simple/Detalle |
| Capas (badge nº) | **Capas del mapa** | 🟡 **conserva** el toggle **Simple/Detalle** |
| Calendario | **Período** | 🟢 limpio |
| Línea/gráfico | (atajo a la pestaña **Línea de tiempo** del dock) | 🟡 **conserva** Simple/Detalle en "Reproducción temporal" |
| Descarga | **Exportar** | 🟢 ver abajo |
| Refresh | recarga de datos | acción, sin panel |
| ⓘ | **Acerca** | 🟢 con nota honesta de "Datos de demostración" |

**🟡 Simple/Detalle inconsistente (foco pedido).** La consigna decía "paneles sin toggle Simple/Detalle". Confirmo que se sacó de **Vista** y **Período**, pero **sigue apareciendo en dos lugares**: en **"Capas del mapa"** y en **"Reproducción temporal"** (la pestaña Línea de tiempo). Si la intención era quitarlo en todos lados, quedó a mitad de camino. Si es intencional, el **mismo rótulo hace cosas distintas** en cada panel → conviene diferenciarlo o unificarlo.

**El ícono de línea/gráfico no abre un panel del riel: te lleva a la pestaña "Línea de tiempo" del dock de abajo.** Funciona, pero es redundante con la pestaña del dock y rompe un poco la expectativa de "cada ícono del riel = un panel flotante".

**Exportar — bien armado, con un hueco.** Ofrece **Copiar vista** ("enlace con la vista, el alcance y el período actuales"), **Vistas guardadas** ("tableros con nombre para volver rápido"), **Exportar PNG** ("con una nota de método al pie") y **Exportar CSV** (en el dock). Pero **"Informe de situación"** figura **"(en desarrollo)"** y está deshabilitado. Para un funcionario, el informe de situación es *justo* el artefacto que querría adjuntar a una decisión (las 3 misiones de la ronda 1 eran sobre justificar/exportar). Hoy solo puede exportar PNG + CSV + link.

**Acerca — muy bien.** Explica que las superficies de detalle viven como capas de la misma vista, y banderea "El dataset cargado es sintético (densidad ponderada por Censo 2022); no representa casos reales". Transparencia correcta.

---

## 3 · Tabla de Registros — ¿se entiende?

**No del todo — y es el punto que más confunde el dato.** Con capas `zoonosis + cobertura`, la pestaña **Registros** (contador **"0"**) mostró:

```
Total: 0 registros en 5 unidades
5 filas
UNIDAD          VALOR
Palermo          204%
Puerto Madero     13%
Recoleta         157%
Retiro            11%
San Nicolás       11%
```

Tres problemas encimados:

1. **"Total: 0 registros" ↔ 5 filas con valores.** El rótulo dice cero registros y abajo hay una tabla poblada. "Registros" (eventos) y "Valor por unidad" (métrica derivada) son dos conceptos distintos metidos bajo el mismo título. Si hay 0 registros, ¿de dónde salen los valores?
2. **Columna "Valor" sin nombre de métrica.** Con 2 capas activas, ¿"Valor" es zoonosis, cobertura, o una mezcla? No se dice. El encabezado debería nombrar la métrica y su unidad.
3. **Porcentajes > 100% y volátiles.** Palermo **204%** y Recoleta **157%** no se leen como ningún "porcentaje" intuitivo. Y al cambiar la capa de esterilización, **Palermo saltó a 251%** y Recoleta a 165% — el mismo "Valor" cambia según qué capas tengas prendidas, sin ninguna explicación. Un funcionario no puede saber qué mide "Palermo 251%".

**Idea:** rotular la columna con la métrica y unidad reales (p. ej. "Señales de zoonosis /10k hab." o "Índice de riesgo"), separar el conteo de *registros* del *valor por unidad* (dos vistas o dos columnas claras), y — si el valor puede pasar 100% — decir de qué es porcentaje o cambiar a una unidad absoluta.

---

## 4 · Estadísticas — "Peores 10 jurisdicciones"

**Para un funcionario de jurisdicción chica, el panel está vacío.** Como lucas (5 localidades) dice literalmente:

> **PEORES 10 JURISDICCIONES**
> Sin datos suficientes en este alcance.
> *Pasá el mouse por una fila para ubicarla en el mapa · click para ver el detalle.*

**🟡 Inconsistencia con Registros.** En el **mismo scope y período**, la pestaña **Registros** muestra 5 unidades **con** valores, pero **Estadísticas** dice **"sin datos suficientes"**. Dos pestañas pegadas del mismo dock se contradicen. (Causa probable: "Peores 10" rankea a nivel jurisdicción por una métrica k-suprimida a grano localidad; internamente coherente, pero al usuario le queda como contradicción.) Además, para un oficial de comuna/localidad, **este panel simplemente no le sirve**: nunca va a tener 10 jurisdicciones que rankear dentro de su alcance.

**Sobre "¿se entiende cada número?" (a escala nacional).** Como el panel solo se puebla a escala nacional, respondo con lo que **ya releví como admin en la ronda 1** (mismo entorno :3001), con una salvedad de build (ver Anexo):
- Cada fila es **"{Provincia} · {cobertura %} · {pts vs meta 80}"** → p. ej. **Salta 43,3% · −37 pts**, Chubut 49, La Rioja 51, Tucumán 52… Con ese contexto **el número se entiende** (cobertura vs una meta de 80).
- **PERO** (hallazgo H8 de la ronda 1): el encabezado **nunca nombra la métrica**, y el ranking es **siempre por cobertura** — no cambia con el preset ni al clickear otro KPI. En una vista de *Brotes* o *Bienestar*, "Peores 10 jurisdicciones" **sigue mostrando cobertura**, no brotes ni denuncias → invita a leer mal ("peores" = ¿peores en qué?). Debería rotular la métrica del ranking y, idealmente, seguir al preset activo.

*(Puedo confirmar esto en vivo sobre el build de hoy si me dejás logueado como `admin@dim.test` — es lo único de tu lista que no pude ejercer como funcionario, porque yo no tipeo contraseñas.)*

---

## 5 · Línea de tiempo, delta y "valor congelado"

**Reproducción temporal** (pestaña Línea de tiempo / ícono del riel): scrubber con play, ventana "última semana / mes / trimestre", y **BASE: "Cuándo ocurrió" vs "Según lo conocido al momento"** (bitemporal — potente, pero los rótulos pueden confundir a un funcionario; convendría un tooltip de "tiempo del evento vs tiempo de conocimiento").

**✅ Fix confirmado — el delta.** Ya no aparece el "+50% / +1.839%" de rondas anteriores: en la ventana por defecto el delta es **"▲ +4 pts"** (unidad correcta, magnitud creíble).

**🔴 Pero el delta se rompe al usar la línea de tiempo:**
- Moví el scrubber a fechas pasadas (12 jun → 12 jul). El **valor** del KPI se quedó **clavado en 64,4%** en todas las fechas, mientras el **delta saltó a "▲ +63 pts"**.
- Peor: al **volver el scrubber a "último evento"**, el delta **siguió en "+63 pts"** (no volvió al "+4 pts" original). Quedó **pegado**. El botón **"Ahora"** está deshabilitado en esa posición → **no hay forma de destrabarlo salvo recargar** la página. (Recargando, vuelve a "+4 pts" limpio — confirma que lo rompe el scrubbeo.)
- A **365 días** el delta es **"+63 pts"** también → parece que el cálculo de tendencia a ventana larga (o con `asOf` seteado) toma una referencia distinta y no se limpia.

**🔴 El valor del KPI no acompaña a la línea de tiempo ni al período.** Es la continuación del "hallazgo estrella" de la ronda 1 (H1): al scrubbear, **el mapa, el rótulo ("Situación al 12 de jun de 2026") y Registros cambian, pero el número grande del KPI no**. El mapa dice una cosa y el número, otra — para un funcionario que decide mirando el número, es engañoso. Lo mismo con el período: cambiar de 30 a 365 días mueve solo el delta, no el valor.

**↩️ Corrección honesta (retiro H4).** En la ronda 1 reporté que "el thumb del scrubber no responde al mouse". Inspeccionando el DOM: el `<input type=range>` tiene **`pointer-events:none`** y el **div padre** (con `cursor-pointer` y `touch-none`) maneja el drag con un handler de puntero propio. Mi automatización **no puede** disparar ese handler (ni click ni drag sintético movieron el valor), pero **está claramente construido para mouse/touch reales**. Así que **no puedo afirmar que esté roto para un humano** — retiro ese hallazgo como artefacto de mi herramienta. (Sí funciona por teclado y programáticamente.)

---

## 6 · Uso real como funcionario de CABA — ¿me deja hacer mi trabajo?

Simulé la pregunta típica: *"¿Dónde tengo la señal de zoonosis más alta y la cobertura antirrábica está acompañando?"*

- **La mitad sí:** el choropleth de zoonosis me muestra clarísimo que **Palermo** es el foco (el "Valor" más alto), seguido de **Recoleta**; el resto de mis barrios, bajo. Como mapa de calor, orienta bien.
- **La otra mitad no:** cuando quiero cruzar ese foco con **cobertura antirrábica por localidad**, el mapa se vacía ("Sin datos para esta capa en este alcance") porque a grano localidad todo cae bajo k<5. Así que **puedo ver el hotspot pero no puedo ver si la cobertura lo acompaña en Palermo específicamente**. El agregado (64,4%) existe, el detalle no → **callejón analítico para un oficial de jurisdicción chica**: las métricas clave viven a grano provincia, no por debajo. (Esto ya lo había visto como admin drilleando Salta → departamentos: mismo "sin datos". Es consistente, pero limita el uso local.)

**Otras fricciones de uso real:**
- El `layers` de la URL **se reescribe solo** al navegar (terminé con `layers=perdidas` sin haberlo pedido) → si compartís o guardás una vista, puede no ser la que creías (se conecta con E2 de la ronda 2: los links no reproducen exactamente lo que veías).
- La pantalla arranca en **Registros con "0"** aunque haya capas con datos → invita a pensar "no hay nada" cuando en realidad hay valores por unidad un scroll más abajo.

---

## Consistencia rótulo ↔ mapa ↔ números (lo crítico)

| Momento | Qué no coincide |
|---|---|
| **Card antirrábica** | Card "64,4% ▲ +4 pts" vs mapa "**Sin datos para esta capa en este alcance**" + Registros "0 en 0 unidades". |
| **Registros** | Encabezado "**Total: 0 registros**" vs tabla con **5 filas** de valores (Palermo 204%). |
| **"Valor" de Registros** | Rotulado solo "Valor", en **% > 100** (204% / 251%), y **cambia con las capas** sin explicación. |
| **Registros vs Estadísticas** | Registros: 5 unidades con datos. Estadísticas "Peores 10": "**Sin datos suficientes en este alcance**" (mismo scope). |
| **Línea de tiempo** | Mapa + rótulo + Registros cambian con la fecha; el **valor del KPI no** (queda en 64,4%). |
| **Delta scrubbeado** | Se pega en "**+63 pts**" y no vuelve a "+4 pts" ni en "último evento" (solo recargando). |

## Lo que funciona muy bien

- **Delta en "pts"** (fix del "+1.839%" de rondas 1–2). ✅
- **Rótulo de frescura** "Último evento en el alcance: 12/7, 03:48 a. m." — claro y honesto. ✅
- **Card activa** marcada con anillo azul + viñeta llena. ✅
- **Empty-states honestos** en todos lados ("Sin datos para esta capa en este alcance", "Sin datos suficientes en este alcance").
- **k-anon** ("k<5 protegido") presente en la leyenda.
- **Exportar** con Copiar vista / Vistas guardadas / PNG con nota de método — buen kit (salvo el Informe en desarrollo).
- **Acerca** con la nota de datos sintéticos — transparencia.

## Qué mejoraría (priorizado)

1. **Registros:** separar "registros" de "valor por unidad", **rotular la métrica y su unidad** en la columna "Valor", y resolver los **% > 100** (decir de qué es %, o usar absolutos). Es lo que más confunde el dato. *(P1)*
2. **Card ↔ mapa "sin datos":** cuando el agregado existe pero el detalle está k-suprimido, **decirlo** ("cobertura 64,4% — detalle por localidad protegido por k<5") en vez de "Sin datos para esta capa". *(P1)*
3. **Delta pegado al scrubbear:** que el delta se **recalcule/limpie** al volver a "último evento" y que "Ahora" siempre pueda resetear el estado temporal. *(P1)*
4. **Valor del KPI vs línea de tiempo:** o el número **acompaña** el `asOf` (bitemporal de verdad), o se rotula explícito que el número es "estado actual" y **no** cambia con la reproducción (hoy el mapa cambia y el número no, sin avisar). *(P2)*
5. **"Peores 10 jurisdicciones":** rotular la **métrica del ranking**, hacer que **siga al preset** (brotes → peores por brotes), y para scopes chicos ofrecer un fallback ("rankeo tus 5 localidades") en vez de "sin datos suficientes". *(P2)*
6. **Simple/Detalle:** unificar — sacarlo también de *Capas* y *Reproducción temporal*, o dejarlo consistente en todos. *(P3)*
7. **Cards como toggles:** aclarar el modelo (radio vs checkbox de capas) y que el tooltip no prometa "pintar" algo que va a dar "sin datos". *(P3)*
8. **`layers` que se reescribe solo** al navegar: preservar la vista del usuario. *(P3)*

## Ideas / faltantes (no-bugs)

- **Informe de situación** (hoy "en desarrollo"): es el entregable que un funcionario más necesita para justificar una decisión — priorizarlo.
- **Normalización per-cápita** en Registros/rankings (hoy el conteo crudo favorece a las jurisdicciones grandes; ya lo notaba en la ronda 1 con denuncias).
- **Cruce hotspot × cobertura** en una sola vista (bivariado) que funcione **por debajo de provincia** o que diga claramente por qué no puede.
- **Tooltip** en "Cuándo ocurrió / Según lo conocido al momento" (bitemporal) — concepto potente pero opaco para un no-analista.
- **Estado inicial**: abrir en Estadísticas o en el mapa, no en "Registros 0", para no dar sensación de vacío.

---

### Anexo — cobertura de esta sesión y salvedades honestas

- **Cuenta:** solo `lucas@dim.test` (funcionario, CABA/5 localidades). Recorrí: 4 cards, los 7 íconos del riel, Registros y Estadísticas (por DOM), Línea de tiempo (scrubbeo programático + intento de mouse), período 30/365 días, y verificación de fixes.
- **No pude, por diseño de mi rol:** tipear contraseñas → **no entré como `admin@dim.test`**, así que la lista **"Peores 10 jurisdicciones" a escala nacional en el build de hoy** no está verificada en vivo; usé mi captura de la ronda 1 (Salta 43,3% · −37 pts, etc.) con esa salvedad. Si me dejás logueado como admin, lo confirmo en 2 minutos.
- **No pude, por límite de la automatización:** mover el scrubber con mouse real (el control usa un handler de puntero propio). Por eso **retiro** el H4 de la ronda 1 en vez de repetirlo.
- **No creé datos.** Todas las acciones fueron navegación/lectura reversible.
- **Reproducibilidad de los bugs de dato:** Registros "Valor" 204%/251% → `layers=zoonosis,cobertura` y `zoonosis,esterilizacion` en scope CABA. Delta pegado → abrir Línea de tiempo, mover el scrubber, volver a "último evento". Card ↔ "sin datos" → click en la card "Cobertura antirrábica".
