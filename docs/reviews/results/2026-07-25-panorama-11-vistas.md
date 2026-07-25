# Panorama — pasada vista por vista (qué le damos hoy a un funcionario)

> Pedido de PO (2026-07-25): ir una por una preguntando **qué necesita un
> funcionario para entender la situación en territorio, ver comparativas claras
> y útiles, y decidir más rápido y más seguro**. Esto NO es un barrido de QA.
>
> **Método**: las 11 vistas abiertas en el build de producción, admin,
> alcance nacional, período por defecto de cada preset, 1600×1000. Capturas en
> el scratchpad. Cuatro las inspeccioné a fondo visualmente (brotes-activos,
> síntomas, riesgo-ppp, pérdidas-reunificación, cumplimiento); del resto tengo
> captura y números de dock. Lo digo porque cambia cuánto pesa cada afirmación.

## Lo primero: la vista insignia no muestra nada

**"Brotes activos" pinta el país ENTERO rayado.** Las 24 provincias en el patrón
de supresión k<5. No hay un solo dato legible en el mapa.

El motivo es estructural, no un bug: la vista cruza *cobertura × zoonosis* en
bivariado, y las señales de zoonosis son tan ralas que **cada celda del cruce
cae bajo k=5**. La supresión funciona perfecto; el problema es que la vista está
construida sobre un cruce que, con los datos que hay, no puede sobrevivir a su
propia protección de privacidad.

El contraste lo prueba: **"Riesgo PPP" usa el MISMO encoding bivariado y se
pinta entera** (979 registros, las 24 provincias con color) — porque cruza
registro PPP × mordeduras, dos ejes densos.

Un ministro que abre la vista llamada "Brotes activos" ve un país rayado y
concluye, razonablemente, que el sistema no sabe nada. **Esa es la peor primera
impresión posible del producto**, y está en la vista que el plan llama el héroe.

## Los otros cuatro defectos que bloquean la comprensión

### 1. "Síntomas" dibuja ~150 puntos que no codifican nada

Todos del mismo tamaño y del mismo gris. Sin magnitud, sin severidad, sin
jerarquía. Y el dock dice **"Registros 0"** mientras el KPI de la misma pantalla
dice **119 señales**. El mapa, el número y la etiqueta no coinciden — contra el
canon del propio proyecto ("label = número = mapa").

Un funcionario no puede responder ni la pregunta más básica: *¿dónde hay más?*

### 2. "Registros 1.394,7" — un conteo de filas con decimales

En "Pérdidas y reunificación". Un conteo de registros no puede tener coma. Está
sumando la capa de pérdidas (conteos) con la de reunificación (una TASA), como
si fueran la misma unidad. El número del dock es aritmética sin sentido.

### 3. La leyenda del bivariado nombra los ejes de otra vista

"Riesgo PPP" cruza *Registro PPP × Mordeduras*, y su leyenda dice
**"cobertura × señal"** — el vocabulario de "Brotes activos". A un ministro que
lee "riesgo" se le está diciendo que los ejes son otros. El registro de presets
ya tiene un `bivariatePair` con el vocabulario correcto por vista; la leyenda no
lo está usando.

### 4. El dock le pone período a una vista de estado actual

"Cumplimiento antirrábico" se describe **"estado actual"**, sus tres KPIs dicen
**ESTADO ACTUAL**, y el dock cierra con **"últimos 90 días"**. Es el mismo
"mentir por cercanía" que ya arreglamos en los KPIs (`periodInvariant` derivado
del contrato) — el dock quedó afuera de ese arreglo.

## Veredicto por vista

| Vista | ¿Se entiende la situación? | Nota |
|---|---|---|
| Brotes activos | ❌ | País entero suprimido. Inutilizable hoy |
| Síntomas | ❌ | Puntos sin codificación + Registros 0 vs KPI 119 |
| Cumplimiento antirrábico | ⚠️ | Legible, pero poca discriminación de color y período falso |
| Registro PPP | ⚠️ | Sin inspección visual profunda |
| Bienestar y fiscalización | ✅ | La default; se lee bien (938 registros) |
| Control poblacional | ⚠️ | Sin inspección visual profunda |
| Mortalidad | ⚠️ | 154 registros; sin inspección profunda |
| Pérdidas y reunificación | ❌ | Registros con decimales |
| Desierto veterinario | ⚠️ | 2.138 registros; sin inspección profunda |
| Tendencia | ⚠️ | Sin inspección visual profunda |
| Riesgo PPP | ✅ | La mejor: bivariado pintado, 979 registros |

## Lo que un funcionario necesita y hoy NO tiene

Más allá de los defectos, falta capacidad. Ordenado por lo que más aceleraría
una decisión:

**1. Comparación contra un par, no contra el vacío.** Hoy una provincia se pinta
contra una escala nacional. Un funcionario provincial necesita *¿cómo estoy
respecto de provincias parecidas a la mía?* — no respecto de CABA. Sin un grupo
de comparación, el color no le dice si tiene un problema o si su realidad es la
normal para su tamaño y densidad.

**2. Qué cambió desde la última vez que miré.** Hoy toda vista es una foto. La
pregunta operativa real es *¿qué se movió esta semana?*. "Tendencia" existe como
vista aparte, lo que obliga a elegir entre ver el estado o ver el cambio —
cuando la decisión necesita las dos.

**3. Un ranking que ordene por lo que importa, no por el valor crudo.** El
ranking muestra las peores por métrica. Para decidir dónde ir, lo que importa es
**brecha × población**: 10 puntos de brecha en Buenos Aires no es lo mismo que
10 puntos en Tierra del Fuego. El plan maestro ya nombra ese criterio
(gap × población × tendencia) para el briefing; el ranking del mapa no lo usa.

**4. Saber cuánto de lo que veo está suprimido.** El dock informa el conteo de
unidades suprimidas, pero el mapa no distingue "acá no pasa nada" de "acá no
puedo mostrarte". En "Brotes activos" esa diferencia es TODA la pantalla.

**5. Poder llevarse la comparación, no solo la vista.** El informe exporta el
cuadro actual. Para justificar una decisión hace falta el antes/después, o esta
jurisdicción contra sus pares.

## Propuestas, por apalancamiento

1. **Rescatar "Brotes activos"** — es lo más urgente. Tres caminos, ordenados
   por costo: (a) que la vista caiga automáticamente a grano provincial simple
   (zoonosis sola, sin cruce) cuando el bivariado suprime más del X% de las
   celdas, y lo DIGA; (b) subir el cruce a una ventana más larga para que las
   celdas superen k=5; (c) reemplazar el cruce por la señal sola. **(a) es la
   única que preserva la intención de la vista y además es honesta.**
2. **Arreglar los tres números que mienten**: Registros con decimales, Registros
   0 con KPI 119, y el período sobre una vista de estado actual.
3. **Que la leyenda del bivariado use el `bivariatePair` de la vista.**
4. **Codificar los puntos de "Síntomas"** por magnitud y severidad; hoy son
   decorativos.
5. **Ranking por brecha × población** (criterio que el plan maestro ya fijó).
6. **Grupo de comparación por pares** — la capacidad ausente de mayor impacto,
   y la más cara. Propuesta antes de código.

## Lo que esta pasada NO cubrió

Las siete vistas marcadas ⚠️ tienen captura pero no inspección profunda: no
abrí su dock, ni su ranking, ni probé drill. Cuatro de los cinco defectos de
arriba aparecieron mirando cuatro vistas — es razonable esperar más en las
otras siete.
