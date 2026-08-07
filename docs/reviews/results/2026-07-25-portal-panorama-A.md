# Panorama — revisión en profundidad de 6 vistas (grupo A)

**Fecha:** 2026-07-25 · **Entorno:** `http://localhost:3000` (datos sintéticos, sesión SUPERADMIN · UNIVERSAL)
**Alcance:** `brotes-activos`, `sintomas`, `cumplimiento`, `registro-ppp`, `bienestar`, `control-poblacional`
**Método:** recorrido con navegador real (`scripts/qa-vis.ts`), lectura de capturas, verbo por verbo (EXPLORAR / ENTENDER / EXPORTAR), más lectura de `presets.ts`, `layers.ts`, `ranking.ts` y `PanoramaConsole.tsx` para respaldar cada hallazgo con código.
**Capturas:** `C:/Users/ignac/.claude/jobs/ef3dba5c/tmp/panA/panA-*.png`

---

## Resumen ejecutivo

Panorama funciona: dibuja, no rompe, no miente sobre el k-anonimato y exporta. Las tres vistas de tasa (`cumplimiento`, `registro-ppp`, `control-poblacional`) son producto vendible hoy. Pero hay **tres defectos estructurales** que atraviesan todas las vistas y que un funcionario provincial va a encontrar en los primeros diez minutos:

1. **Al bajar a departamento, una vista de cumplimiento se convierte en un mapa de conteos y el ranking se da vuelta.** "PEORES 10" pasa a listar a los que MÁS vacunaron. Evidencia: `panA-61-cumplimiento-salta.png` (Capital, 188 vacunaciones, encabeza "PEORES 10 · COBERTURA ANTIRRÁBICA (CONTEO)").
2. **Las escalas de 4 clases ancladas en la meta colapsan el rango real de los datos en 2 clases.** `control-poblacional` pinta el país entero de un solo azul: el rango nacional es 20,2%–48,0% y los cortes son <35 / 35–<53 / 53–<70 / ≥70.
3. **La vista `sintomas` está vacía en todos los alcances.** 0 registros a nivel nacional y 0 en Buenos Aires; la pestaña Referencias sale en blanco. Hoy es una vista rota en el menú.

Lo que sí está muy bien y hay que capitalizar en la narrativa comercial: la honestidad epistémica (`Sin señales no es lo mismo que sin problema`, `235 unidades suprimidas por k-anonimato`, el bivariado que se auto-desactiva porque quedaría todo tramado), el ranking con **brecha vs meta en puntos**, y el panel de exportación (enlace, CSV, PNG, informe imprimible, vistas guardadas).

---

## 1. Brotes activos (`?preset=brotes-activos`)

### El escenario

**Quién:** el/la director/a de Zoonosis de un ministerio de salud provincial, o su par nacional en la Dirección de Control de Enfermedades Transmisibles.
**Cuándo:** el lunes a la mañana, antes de la reunión semanal de vigilancia. La pregunta es "¿dónde se están juntando señales zoonóticas sobre territorios con poca vacunación antirrábica?" — es decir, dónde el fuego encuentra combustible.

### Qué le permite ver

Es la única vista que **cruza dos dominios**: pinta la cobertura antirrábica como fondo (coropleta provincial) y superpone las señales de zoonosis como círculos proporcionales a grano de **departamento**. Eso permite una lectura que ningún tablero por separado da: *Salta tiene 43,6% de cobertura (la peor del país) y además concentra 4 de las 8 unidades con señal medible* (General José de San Martín 13, Anta 9, Capital 8, Rosario de la Frontera 6). Esa coincidencia es el hallazgo, y se ve de un vistazo.

Los KPI están bien elegidos: 63,6% cobertura (ESTADO ACTUAL, +19 pts), 441 señales en el período (+4%), 1.507 mordeduras (12 meses fijos). El sufijo `activas hoy: 94 (rabia + mordeduras + 30d)` bajo el KPI de zoonosis es exactamente el tipo de nota que separa un dato de una interpretación.

La línea de tiempo funciona y avisa lo que corresponde: *"El indicador base (cobertura antirrábica) es un estado actual y no cambia con la fecha de corte"*. Reproducir 90 días y ver el brote formarse es demostrable en vivo.

### Los artefactos de mapa

| Elemento | Qué usa | ¿Es el correcto? |
|---|---|---|
| Base | Coropleta secuencial azul, 4 clases: <40% / 40–<60% / 60–<80% / ≥80% (meta) | Sí para "hueco de vacunación". Pero ninguna provincia llega a la clase alta → solo 2 clases pobladas |
| Señal | Círculos proporcionales, 1–13, grano departamento incluso en vista nacional (`NATIONAL_DEPARTMENT_GRAIN_IDS`) | Correcto conceptualmente (un punto por provincia escondería dónde se concentra), **pero destruye el 86% del dato por k-anonimato** |
| Supresión | Círculo gris apagado + chip `⊘ k<5 protegido`; leyenda "Datos insuficientes (privacidad)" | Honesto en la leyenda, **desastroso en el canvas** |
| Bivariado | Toggle "Intensidad de reporte (bivariado)" — **desactivado con explicación** | Excelente decisión |

### Dónde falla (adversarial)

- **El mapa está dominado por ruido gris.** `panA-01-brotes-full.png`: se cuentan ~235 círculos grises (suprimidos) contra 8 marrones (con dato). El ojo lee "hay algo en todos lados". El KPI dice **441 señales**; el mapa y Registros dicen **61 en 8 unidades**. 380 señales (86%) no son localizables. No hay ninguna leyenda que diga "de las 441 señales del período, 61 son ubicables a nivel departamento; el resto está protegido". *Recomendación: mostrar los suprimidos como un contorno finísimo o retirarlos del canvas y contarlos en una nota, no como marcas de igual peso visual.*
- **El encabezado del ranking miente sobre el alcance.** Dice **"TUS 8 JURISDICCIONES · SEÑALES DE ZOONOSIS"** para un SUPERADMIN en alcance nacional con 243 departamentos. Causa raíz verificada en `PanoramaConsole.tsx:3419`: `rankingSmallScope = rankingAllInScope.length > 0 && < 10`, y `rankingAllInScope` excluye las unidades suprimidas. Es decir, **la supresión fuerte se disfraza de "alcance chico"**. Debería decir "8 unidades medibles de 243" y nunca "tus".
- **La tabla de Registros tiene unidades ambiguas.** `panA-04b-brotes-registros.png`: la columna UNIDAD lista `25 de Mayo` tres veces, `9 de Julio` dos veces, `Capital` varias — sin provincia. El ranking sí usa `Anta, Salta`. El CSV que baja el funcionario es inutilizable para cruzar con su propio padrón.
- **267 filas de las cuales ~235 dicen "Protegido (k<5)".** El CSV exportable es mayormente vacío. Vale la pena ofrecer "descargar solo lo medible" o incluir la columna `suprimido` explícita.
- **El bivariado, aunque bien desactivado, sigue siendo la promesa de la vista.** La descripción del preset dice "riesgo combinado (bivariado)" y el modo que se puede usar es "capas separadas". La vista promete un cruce que hoy la privacidad no permite en ningún alcance nacional.

### Mejoras futuras (por apalancamiento)

1. **Grano adaptativo por densidad de señal**: departamento donde k lo permita, provincia donde no — en vez de departamento a la fuerza y 235 tramas.
2. **Reconciliar el KPI con el mapa**: un renglón bajo el KPI de zoonosis del tipo "441 en total · 61 ubicables · 380 protegidas".
3. **Columna provincia en Registros y en el CSV** (defecto, no mejora).
4. **Corregir el encabezado "Tus N"** cuando el origen es supresión y no alcance.
5. Bivariado **a grano provincia** como alternativa viable (24 celdas pasan k sin problema) en lugar de desactivarlo del todo.

### Factores de administración NO cubiertos

- **Notificación obligatoria.** La rabia es de notificación obligatoria (Ley 15.465) y el sistema nacional de referencia es el **SNVS 2.0 / SISA**. Panorama muestra la señal y no ofrece ningún camino de notificación ni interoperabilidad con SNVS. El funcionario ve el brote acá y tiene que volver a cargarlo en otro sistema.
- **Handoff interjurisdiccional.** Una señal en General José de San Martín (Salta) involucra al municipio (zoonosis local), a Epidemiología provincial y, si hay especies productivas, a **SENASA**. No hay verbo "derivar", ni destinatario, ni acuse.
- **Bloqueo/foco de brote.** No existe el objeto "brote" con fecha de apertura, radio, casos vinculados y cierre. Hoy hay señales sueltas; la administración trabaja por foco.
- **Denominador poblacional real.** La cobertura se calcula sobre el padrón MiMAR (67.519 mascotas), no sobre la **población canina estimada** del territorio (los programas provinciales usan ratios habitante/perro). "63,6% de cobertura" no es lo mismo que "63,6% de los perros de Salta" y esa diferencia es toda la planificación de una campaña antirrábica.

---

## 2. Síntomas / vigilancia sindrómica (`?preset=sintomas`)

### El escenario

**Quién:** el equipo de vigilancia sindrómica temprana de una provincia.
**Cuándo:** revisión diaria/semanal buscando la señal previa al diagnóstico — el pico de síntomas que anticipa el brote.

### Qué le permite ver — hoy, nada

**La vista está vacía en todos los alcances probados.**

- Nacional (`panA-10-sintomas-full.png`): mapa gris sin coropleta, ~105 círculos grises suprimidos. Registros: **"Eventos en el período: 0 en 0 unidades (+105 protegidas por k-anonimato)"**. La tabla de Registros tiene columnas `UNIDAD | ZOONOSIS / SEÑALES (CONTEO)`: **la capa base `sintomas` no aporta una sola fila**.
- Ranking: *"PEORES 10 · SÍNTOMAS REPORTADOS — Sin señales en este alcance. Ninguna unidad del alcance reportó datos suficientes para medir. Sin señales no es lo mismo que sin problema."*
- Drill a Buenos Aires (`panA-80-sintomas-bsas.png`): idéntico. Registros = 0.
- **La pestaña "Referencias" sale completamente en blanco** — sin leyenda alguna. Es un bug, no una decisión.
- Los KPI son 125 zoonosis, 1.507 mordeduras, 287 denuncias: **ninguno es de síntomas**. La vista que se llama Síntomas no tiene ni un número de síntomas. Confirmado en `presets.ts`: `metrics: ["zoonosis","mordeduras","denuncias"]`.

### Los artefactos de mapa

Ninguno efectivo. La base declara `graduated-symbol` con supresión `muted`, pero al no haber datos no dibuja nada, y no hay estado de "capa base sin datos" en el lienzo — solo un chip de leyenda `Síntomas / vigilancia sindrómica` **sin escala ni muestra de color**.

Encima, la vista es *framing-less* por diseño (`sintomas` no declara `framing`), así que el país queda descentrado con medio panel en blanco a la derecha (visible en ambas capturas).

### Dónde falla

Todo. Y el problema no es la falta de datos sintéticos: es que **la vista no distingue "no hay síntomas cargados" de "hay síntomas y los protegí"**. El texto del ranking es impecable, pero está solo: el mapa, la leyenda inexistente y los KPI ajenos no lo acompañan. Un funcionario que abra esta vista en una demo concluye que el producto no funciona.

### Mejoras futuras

1. **Sacarla del menú o marcarla "sin datos en este entorno"** hasta que la capa cargue. Una vista vacía en la lista de 11 cuesta más credibilidad de la que aporta.
2. **Arreglar la pestaña Referencias vacía** (defecto puro).
3. **Agregar un KPI de síntomas** a `metrics` — la vista debe poder decir su propio número.
4. **Estado de lienzo explícito**: "la capa base no tiene registros en este alcance/período" sobre el mapa, no solo en el dock.
5. Encuadre nacional (`framing: national`) como el resto, para no abrir descentrado.

### Factores de administración NO cubiertos

- **Definición de caso y umbral de alarma.** La vigilancia sindrómica se define por *síndrome* (p. ej. síndrome neurológico compatible con rabia) y por un **umbral epidémico** (canal endémico, media móvil). Acá hay conteos crudos sin canal endémico, sin línea de base histórica y sin umbral: no se puede decir "esto está por encima de lo esperado".
- **Quién reporta y con qué obligación.** No hay noción de establecimiento notificador ni de completitud del reporte semanal ("18 de 34 veterinarias reportaron esta semana"). Sin eso, un cero es indistinguible de un silencio administrativo.
- **Cadena de verificación.** Una señal sindrómica se confirma con laboratorio (Instituto Pasteur / laboratorios de zoonosis provinciales). No hay estado "sospechoso / en estudio / confirmado / descartado".

---

## 3. Cumplimiento antirrábico (`?preset=cumplimiento`)

### El escenario

**Quién:** el/la subsecretario/a de Salud provincial o el equipo del programa nacional de zoonosis.
**Cuándo:** planificación de la campaña antirrábica anual, o rendición ante la mesa federal (COFESA). La pregunta es literalmente la del preset: "¿qué jurisdicciones están por debajo de la meta de cobertura antirrábica?" (Ley 22.953 · meta 80%).

### Qué le permite ver

Es **la mejor vista del grupo**. El ranking del dock hace el trabajo que el mapa no puede: 10 filas ordenadas por **brecha vs meta en puntos porcentuales**, con hover que muestra la ficha y "Clic para entrar".

```
Salta            44%   −36.4 pts
Chubut           49%   −31.0 pts
La Rioja         51%   −29.3 pts
Tucumán          51%   −29.2 pts
Neuquén          52%   −28.1 pts
Formosa          55%   −24.9 pts
Catamarca        57%   −23.5 pts
Chaco            61%   −18.9 pts
Buenos Aires     62%   −18.1 pts
Tierra del Fuego 62%   −18.1 pts
```

Esa columna de brecha es el activo comercial más fuerte de todo Panorama: convierte un mapa en una **lista de prioridades defendible**. Los 24 valores están completos, sin supresión, y bajan en CSV con un clic.

Los KPI acompañan la familia legal correcta: 63,6% antirrábica + 38,4% esterilización + 36,0% microchip (Ley Prov 14.107). Y el título de alcance dice honestamente "estado actual" (no "últimos 90 días").

### Los artefactos de mapa

Coropleta provincial secuencial, 4 clases con la meta como corte superior (<40 / 40–<60 / 60–<80 / **≥80 meta**). Conceptualmente es el encoding correcto: una tasa comparable entre unidades con un umbral legal.

### Dónde falla

- **El mapa casi no discrimina.** `panA-20-cumplimiento-full.png`: el rango real es 43,6%–75,7% y **ninguna provincia alcanza la clase de meta**, así que el país se reparte entre dos azules parecidos. Salta (43,6%) y Formosa (55,1%) caen en la misma clase pese a 11 puntos de diferencia. El mapa dice "todos mal parecido"; el ranking dice otra cosa. *El ranking está compensando una falla del mapa.*
- **Contradicción de ventana temporal.** La leyenda de la izquierda dice "estado actual", pero el pie del dock dice **"Nacional · todas las provincias · últimos 90 días · 1 capa"** y la tabla de Registros encabeza **"Datos del mapa por unidad — Nacional, últimos 90 días"**. La cobertura antirrábica es una ventana móvil de 12 meses (`temporal: false` en el registro de capas). Un funcionario que exporte ese CSV va a creer que son 90 días.
- **El chip `⊘ k<5 protegido` aparece con cero supresión.** 24 de 24 provincias tienen valor; no hay nada protegido. El chip como clase de leyenda permanente enseña a ignorarlo justo donde sí importa (brotes, síntomas).
- **"Actividad por día" queda muerto** en toda vista de tasa: *"Activá una capa con dimensión temporal…"*. Es la mitad superior de la pestaña Estadísticas ocupada por un vacío en 3 de las 6 vistas revisadas.
- **DEFECTO GRAVE — el drill invierte el significado.** Al entrar a Salta (`panA-61-cumplimiento-salta.png`):
  - El mapa deja de pintar la tasa y pinta **conteos de vacunaciones** por departamento (leyenda "Vacunaciones antirrábicas · conteos por departamento", clases <8 / 8–<11 / 11–<14 / 14–<19 / ≥19).
  - El ranking pasa a **"PEORES 10 · COBERTURA ANTIRRÁBICA (CONTEO)"** ordenado **descendente**: `Capital 188`, `General José de San Martín 101`, `Anta 23`…
  - **Capital es el departamento que MÁS vacunó y aparece primero en una lista rotulada "PEORES".**

  Causa raíz verificada: `PanoramaConsole.tsx:3377` — `rankLocalityRateCount` fuerza `kind: "density"` cuando una capa de tasa baja a grano localidad, y `ranking.ts:171` ordena density **descendente**. El sistema es honesto con la métrica (agrega "(conteo)") pero **no corrige el superlativo "PEORES"**. Además, un mapa de conteos sobre departamentos de área desigual (Rivadavia y Anta son enormes) es cartografía de población, no de cumplimiento: exactamente lo que la vista promete no hacer.

  Confirmado como **sistémico**: idéntico en `control-poblacional` drillado a Salta ("PEORES 10 · COBERTURA DE ESTERILIZACIÓN (CONTEO)", Capital 147 primero).

### Mejoras futuras

1. **Arreglar el drill de las vistas de tasa** — es el hallazgo #1 de todo el informe. Opciones, en orden de preferencia: (a) calcular la tasa por departamento con k-anonimato sobre numerador y denominador; (b) si no se puede, **no rankear** y mostrar solo la tabla con una nota; (c) mínimo indispensable: renombrar el encabezado a "Mayores conteos" y eliminar la palabra "PEORES".
2. **Reescalar la coropleta al rango observado** manteniendo la meta como marca de referencia (una línea en la leyenda), en vez de clases fijas que dejan 2 de 4 vacías.
3. **Unificar la etiqueta temporal**: si la capa es `temporal: false`, el dock y Registros no deben decir "últimos 90 días".
4. Mostrar el chip de k-anonimato **solo cuando hay supresión efectiva**.
5. Reemplazar el "Actividad por día" muerto por algo útil en vistas de estado (p. ej. evolución trimestral de la tasa).

### Factores de administración NO cubiertos

- **La campaña.** La antirrábica se ejecuta por **operativos y jornadas** (puestos fijos, vacunatorios móviles, casa por casa). No existe la capa "operativo programado / ejecutado", ni el antes/después de una jornada, ni la planificación territorial del próximo operativo. Entre "Salta está a −36,4 pts" y "¿dónde pongo el camión el sábado?" no hay nada.
- **Capacidad instalada** (que no es costo): vacunatorios habilitados, dosis disponibles y cadena de frío, veterinarios matriculados por departamento. Sin eso no se puede distinguir "baja cobertura por falta de demanda" de "baja cobertura por falta de oferta" — y la respuesta de política es opuesta.
- **Meta comprometida vs meta genérica.** El 80% es el objetivo legal nacional; en la práctica cada jurisdicción firma **convenios y POA con metas y plazos propios**. No hay "meta comprometida por jurisdicción y período", ni responsable, ni vencimiento.
- **Acto administrativo.** Nada de esto entra a un expediente. Bajo Ley 19.549 y el ecosistema **GDE/TAD**, una intimación a un municipio incumplidor nace de un expediente con número. Panorama produce un PDF que vive fuera del sistema de expedientes.

---

## 4. Registro PPP (`?preset=registro-ppp`)

### El escenario

**Quién:** el área de fiscalización provincial responsable del registro de perros potencialmente peligrosos (Ley Prov 14.107 y ordenanzas municipales homólogas), o un asesor legislativo evaluando el cumplimiento de la norma.
**Cuándo:** tras un incidente mediático de mordedura grave — el momento en que alguien pregunta "¿cuántos PPP hay registrados y dónde no se está registrando nada?".

### Qué le permite ver

Ranking provincial de adopción del registro con brecha vs benchmark 80%:

```
La Pampa          17%  −63.3 pts
Tierra del Fuego  20%  −60.0 pts
Salta             23%  −56.9 pts
San Luis          27%  −52.7 pts
Jujuy             33%  −46.7 pts
```

La vista existe porque `cumplimiento` no puede tener dos bases (regla F2, una base por preset), y ese hogar propio es correcto. La pareja de KPI (44,9% PPP + 36,0% microchip) mantiene la familia legal de la 14.107.

### Los artefactos de mapa

Coropleta provincial, mismas 4 clases ancladas en 80%. Acá el rango sí se abre (16,7%–100%) y aparecen las cuatro clases, de modo que la coropleta **discrimina mejor que en cumplimiento**.

### Dónde falla

- **El artefacto de denominador chico envenena la vista.** `panA-20-registro-ppp-full.png`: **La Rioja aparece con 100%** y es la **única** provincia en la clase "≥80% (meta)" — el único punto oscuro del mapa. Nadie muestra el denominador: ni el ranking, ni el hover, ni Registros, ni el CSV. Un 100% que sale de 1 sobre 1 pinta idéntico a un 100% real. Y ese mismo mecanismo empuja hacia arriba a Chubut (66,7%), Santa Cruz (60%) y Catamarca (58,8%): **las provincias con menos perros registrados son las que "mejor cumplen"**.
- **Nada de k-anonimato ni de piso de denominador en capas de tasa.** El régimen k=5 se aplica a conteos de eventos, pero una tasa provincial con denominador diminuto se publica sin reserva. Es una asimetría de honestidad epistémica: se protege un conteo de 4 mordeduras y se publica un 100% que puede venir de 1 caso.
- **"< 40%" y "Sin datos" son visualmente casi el mismo gris claro.** Tierra del Fuego (20%) y las áreas sin dato se confunden a simple vista.
- **El benchmark 80% no es legal y la UI no lo aclara.** El comentario en `layers.ts` es explícito ("Ley Prov 14.107 sets no universal % target… 80 is the program benchmark, not a legal mandate"), pero en pantalla la columna dice "Brecha vs meta" con el mismo tono que la antirrábica, que **sí** tiene mandato legal. Presentar un benchmark interno como meta ante un funcionario es exactamente el tipo de sobre-afirmación que Panorama declara evitar.
- Misma contradicción "estado actual" vs "últimos 90 días" que en cumplimiento.

### Mejoras futuras

1. **Mostrar numerador/denominador** en el hover, en la tabla y en el CSV (`23 de 100`, no `23%`).
2. **Piso de denominador**: por debajo de N (p. ej. 20), suprimir la tasa o marcarla "estimación inestable" en vez de pintarla.
3. **Distinguir meta legal de benchmark programático** en la UI (icono/nota), no solo en el código.
4. Aumentar el contraste entre "< 40%" y "Sin datos".
5. Considerar un intervalo de confianza en el ranking; con denominadores de dos dígitos, el orden entre puestos 4 y 8 no es estadísticamente distinguible.

### Factores de administración NO cubiertos

- **El registro PPP es un trámite, no un indicador.** Falta todo el ciclo administrativo: solicitud, evaluación de aptitud del tenedor, seguro de responsabilidad civil obligatorio, certificado de adiestramiento, vencimiento y renovación. Panorama mide el stock; la administración gestiona el flujo.
- **Fiscalización y sanción.** No hay acta de infracción, ni intimación, ni régimen sancionatorio, ni seguimiento de infractores. Un 17% en La Pampa no dispara nada.
- **Articulación con el municipio.** El registro PPP se ejecuta en la mayoría de las provincias a nivel **municipal**. El selector de alcance llega a provincia/localidad y el mapa a departamento/partido; no hay identidad municipal ni comparación "mi municipio vs municipios comparables", que es la unidad donde vive la responsabilidad.
- **Conexión con mordeduras.** La vista hermana `riesgo-ppp` cruza mordeduras × registro, pero desde `registro-ppp` no hay ningún puente hacia el evento que justifica la norma. Un funcionario que ve 17% quiere saber inmediatamente si allí muerden más.
- **Debido proceso y datos personales.** Registrar un perro como PPP tiene consecuencias jurídicas para su tenedor. No se ve el circuito de notificación al titular, ni de descargo, ni de rectificación (Ley 25.326 de Protección de Datos Personales).

---

## 5. Bienestar y fiscalización (`?preset=bienestar`)

### El escenario

**Quién:** la dirección de bienestar animal / protección animal de un municipio grande o de una provincia; también el área que instruye los decomisos.
**Cuándo:** revisión mensual de carga de denuncias y de despliegue de fiscalización. Es el preset por defecto de la consola (`DEFAULT_PANORAMA_PRESET_ID`), o sea: es la primera impresión del producto.

### Qué le permite ver

Es la vista con **más dato real**: 944 denuncias en el período, en las 24 provincias, **sin una sola unidad suprimida**. Y tiene el artefacto más valioso de todo Panorama: el **toggle Per cápita**.

- Modo conteos (`panA-20-bienestar-full.png`): un círculo enorme sobre Buenos Aires (189), Córdoba (114), Santa Fe (66). El clásico mapa de población disfrazado de mapa de denuncias.
- Modo per cápita (`panA-43-bienestar-percapita.png`): el globo bonaerense se desinfla y **crecen La Pampa, Santa Cruz, Chubut y Tierra del Fuego** (rango 0,2–1,13 por 10.000 hab.).

Ese giro de 180 grados es la mejor demostración en vivo que tiene el producto: *"el mapa de conteos te dice Buenos Aires; el mapa per cápita te dice La Pampa"*. Es literalmente el verbo ENTENDER en acción.

La honestidad sobre la capa de referencia también está bien: *"Decomisos se muestra solo en el mapa (capa de referencia); no se tabula en Registros."*

### Los artefactos de mapa

Círculos proporcionales (denuncias, violeta `#b07aa1`) + pines agrupados de decomisos (teal `#76b7b2`) sobre basemap gris sin relleno. Correcto para una densidad de eventos: una coropleta de conteos sobre provincias de área tan desigual sería peor.

### Dónde falla

- **DEFECTO GRAVE — el ranking contradice al mapa cuando se activa per cápita.** Con el toggle activo, la nota dice: *"El mapa pinta tasas por 10.000 hab.; este ranking ordena por conteos."* Y el ranking sigue encabezado por **Buenos Aires 189**. Es honesto y **es peor que estar callado**: el funcionario cambió de modo justo para escapar del artefacto poblacional, y la tabla que tiene debajo sigue diciéndole que el peor es Buenos Aires. **Dos artefactos en la misma pantalla dan respuestas opuestas a la misma pregunta.** Es el hallazgo #2 del informe.
- **"PEORES 10" por conteo crudo es un ranking de población.** En modo conteos, el orden BA / Córdoba / Santa Fe / CABA es prácticamente el orden de población del país. No informa nada que el funcionario no supiera.
- **Denuncias y decomisos comparten forma.** Ambos son círculos de tamaño similar; el color es el único diferenciador, y semánticamente son cosas distintas (uno es magnitud agregada, el otro es un cúmulo de expedientes puntuales). Conviene forma distinta, no solo color.
- **Decomisos no se puede exportar.** Es una capa de referencia y queda fuera de Registros y del CSV. Para una consola cuyo tercer verbo declarado es EXPORTAR, que una capa visible no sea exportable es una brecha del contrato.
- **El chip `⊘ k<5 protegido` aparece otra vez sin supresión alguna** (944 en 24 unidades, 0 protegidas).
- **Centroides provinciales.** El círculo de Buenos Aires cae en el centro geométrico de la provincia, lejos del conurbano donde presumiblemente están las denuncias. A nivel nacional es aceptable; conviene decirlo en la leyenda.

### Mejoras futuras

1. **Que el ranking siga al modo del mapa** (per cápita → ordenar por tasa). Si no se puede, mostrar **ambas columnas** (conteo y tasa) y ordenar por la activa.
2. **Exportar decomisos** (aunque sea como capa aparte del CSV).
3. Diferenciar decomisos por **forma**, no solo por color.
4. Per cápita sobre **población canina estimada** además de habitantes — es la denominación que usa el sector.
5. Poner "per cápita" como modo **por defecto** de esta vista: es el que responde la pregunta del preset.

### Factores de administración NO cubiertos

- **El ciclo de vida de la denuncia.** Este es el hueco más grande de la vista. Una denuncia de bienestar tiene estados: recibida → asignada a inspector → inspección realizada → acta → medida (decomiso / intimación / archivo) → resolución. Panorama muestra **el volumen de entrada** y nada del proceso. Un director de bienestar necesita ver **backlog, antigüedad promedio y denuncias sin asignar**, no el total del trimestre.
- **Tiempos de respuesta y compromiso de servicio.** No hay "días desde la denuncia hasta la primera inspección" — el indicador que efectivamente se le reclama a la administración.
- **Destino del animal decomisado.** Un decomiso genera guarda, tránsito, refugio, tratamiento veterinario y eventual adopción o restitución judicial. La capa `refugios` existe en el catálogo pero esta vista no la cruza con decomisos: **no se puede ver si se decomisa donde hay capacidad de alojamiento**.
- **Vía penal.** La Ley 14.346 de Malos Tratos y Actos de Crueldad Animal es **penal**. Una denuncia fundada deriva en fiscalía. No hay estado "denunciado penalmente", ni número de IPP/causa, ni articulación con el Ministerio Público.
- **Trazabilidad del denunciante y protección de la identidad.** La capa está bien marcada `privacy: coarse` (centroide de localidad, nunca la coordenada exacta), lo cual es correcto. Falta el otro lado: gestión de denuncias anónimas, denuncias reiteradas sobre el mismo domicilio y prevención de uso persecutorio del canal.
- **Comunicación al ciudadano.** Nadie que denunció puede saber qué pasó con su denuncia. En la práctica es el principal reclamo ciudadano en esta materia.

---

## 6. Control poblacional (`?preset=control-poblacional`)

### El escenario

**Quién:** el/la responsable del programa de control poblacional / esterilización quirúrgica gratuita — típicamente una dirección de zoonosis provincial o municipal.
**Cuándo:** planificación anual del programa de castraciones y defensa del presupuesto ante la línea política. Pregunta del preset: "¿Estamos conteniendo la población? Cobertura de esterilización vs meta (70%)".

### Qué le permite ver

Ranking con brecha vs la meta programática del 70%:

```
Salta                20%  −49.8 pts
Corrientes           29%  −41.1 pts
Chaco                29%  −40.9 pts
Formosa              32%  −38.4 pts
San Juan             33%  −37.1 pts
Santiago del Estero  34%  −36.3 pts
```

El mensaje macro es contundente y correcto: **ninguna provincia del país llega al 70%; la mejor (Tierra del Fuego) está en 48%, el promedio nacional en 38,4%**. Como argumento de política pública ("el país entero está a 22 puntos de la meta de contención"), es potente.

### Los artefactos de mapa

Coropleta provincial divergente/secuencial anclada en la meta: <35% / 35–<53% / 53–<70% / **≥70% (meta)**.

### Dónde falla

- **DEFECTO GRAVE — el mapa es un lavado monocromático.** `panA-50-control-full.png`: el rango observado es **20,2%–48,0%** y los cortes son 35 / 53 / 70. Resultado: **las 24 provincias caen en las dos clases más bajas**, que además son dos azules pálidos casi idénticos. El mapa no responde la pregunta de la vista. Salta (20,2%) y Buenos Aires (42,1%) — 22 puntos de diferencia, la mitad del rango nacional — se ven prácticamente iguales. **Todo el trabajo analítico lo hace la tabla; el mapa es decorativo.** Es el hallazgo #3 del informe.
- **Un KPI que no pertenece.** El segundo indicador es **"116 Pérdidas activas"**. En una vista de contención poblacional, las mascotas perdidas no son ni causa, ni consecuencia, ni proxy de la esterilización. Drillado a Salta el número es "5", que no sostiene ninguna lectura. Los indicadores naturales serían: esterilizaciones del período (flujo, no stock), tasa por 1.000 mascotas, o el propio dato de mortalidad/abandono.
- **La cobertura es un stock sin flujo.** `esterilizacion` es `temporal: false` — mide "mascotas activas con esterilización registrada". No se puede ver **cuántas castraciones se hicieron este trimestre**, que es la única variable que el programa efectivamente controla. La vista mide el resultado acumulado y esconde el esfuerzo.
- **"Actividad por día" muerto** otra vez ("Activá una capa con dimensión temporal…").
- **Drill invertido**, idéntico a cumplimiento: en Salta el mapa pasa a "Esterilizaciones (conteo)" 6–147 y el ranking a **"PEORES 10 · COBERTURA DE ESTERILIZACIÓN (CONTEO)"** con **Capital (147) primero** — el departamento que más castró, rotulado como el peor.
- Misma contradicción "estado actual" / "últimos 90 días" y mismo chip k<5 sin supresión.

### Mejoras futuras

1. **Reescalar la coropleta al rango observado** con la meta marcada como línea de referencia en la leyenda. Sin esto, el mapa de esta vista no sirve.
2. **Arreglar el drill** (ver hallazgo transversal #1).
3. **Reemplazar "Pérdidas activas"** por un KPI de flujo: esterilizaciones del período y/o tasa por 1.000 mascotas activas.
4. **Serie temporal de la cobertura** (evolución trimestral) para poder decir "subimos 4 puntos en el año", que es el único enunciado que la línea política escucha.
5. Cruce con `mortalidad` y con `perdidas-reunificacion` como capas de contexto de la dinámica poblacional.

### Factores de administración NO cubiertos

- **El quirófano.** El programa de control poblacional se ejecuta con **quirófanos fijos y móviles, turnos y agenda**. No hay capacidad instalada, ni turnos otorgados vs realizados, ni ausentismo, ni cobertura territorial del móvil. Entre "Salta 20,2%" y "¿dónde mando el quirófano móvil?" no hay nada.
- **Población objetivo real.** El denominador es el padrón MiMAR, no la **población canina y felina estimada** del territorio. Un programa de castración se dimensiona sobre la población estimada (y sobre la población en situación de calle, que por definición no está en ningún padrón). El indicador de esta vista **no puede** responder "¿estamos conteniendo la población?" — responde "¿qué porcentaje de las mascotas que ya conocemos está esterilizado?". Es una pregunta distinta, y el título de la vista promete la primera.
- **Machos vs hembras, y edad.** El impacto poblacional de castrar hembras jóvenes es de otro orden de magnitud. Sin desagregación por sexo y edad, la cifra no orienta la estrategia.
- **Animales sin dueño.** El grueso del problema poblacional está en animales comunitarios o en situación de calle. Ninguna vista los alcanza, y la administración no puede planificar contención sin ellos.
- **Convenios y ejecutores.** Buena parte de las castraciones las ejecutan ONG, colegios de veterinarios y clínicas privadas bajo convenio. No hay noción de ejecutor, de convenio, ni de rendición por ejecutor.
- **Obligación de reporte y transparencia activa.** Los programas provinciales reportan metas anuales; y la Ley 27.275 de Acceso a la Información Pública obliga a publicación activa. No hay dataset abierto ni extracto versionado y fechado con el que responder un pedido de información.

---

## Hallazgos transversales (ordenados por gravedad)

### T1 — El drill de las vistas de tasa invierte el significado del ranking
Al bajar a departamento, `cumplimiento`, `control-poblacional` (y por construcción `registro-ppp`) dejan de pintar la tasa y pintan **conteos**; el ranking se coacciona a `kind: "density"` (orden descendente) pero **conserva el rótulo "PEORES N"**. Resultado: el departamento que más vacunó/castró encabeza la lista de los peores.
Evidencia: `panA-61-cumplimiento-salta.png`, `panA-81-control-salta.png`; código `PanoramaConsole.tsx:3377-3384` + `ranking.ts:171`.
**Es el defecto más peligroso del producto**: aparece exactamente en el alcance donde trabaja un funcionario provincial.

### T2 — El mapa y la tabla pueden contradecirse en la misma pantalla
Con "Per cápita" activo en `bienestar`, el mapa pinta tasas y el ranking ordena conteos, con una nota que lo admite. Dos respuestas opuestas a "¿quién está peor?", simultáneas y visibles.
Evidencia: `panA-43-bienestar-percapita.png` + `panA-44-bienestar-percapita-stats.png`.

### T3 — Las escalas de 4 clases ancladas en la meta colapsan el rango real
`control-poblacional` (rango 20–48%, cortes 35/53/70) es el caso extremo: mapa de un solo tono. `cumplimiento` (43–76%, cortes 40/60/80) usa 2 de 4 clases. Cuando ninguna jurisdicción se acerca a la meta, la escala anclada en la meta deja de discriminar y el mapa se vuelve decorativo. Hace falta escala al rango observado **con la meta como marca**, no como corte.

### T4 — La supresión k=5 a grano departamento destruye el dato sin decirlo en el lienzo
En `brotes-activos`, 235 de 243 departamentos quedan suprimidos: el KPI dice 441 señales, el mapa muestra 61. Los ~235 círculos grises pesan visualmente igual que los 8 con dato. Y la supresión fuerte activa por error el modo "alcance chico" del ranking (`rankingSmallScope` ignora que las unidades excluidas fueron suprimidas), produciendo el encabezado **"TUS 8 JURISDICCIONES"** para un superadmin nacional.

### T5 — Etiquetas temporales y de privacidad que no corresponden al dato
(a) Las vistas de estado actual muestran "últimos 90 días" en el pie del dock y en el encabezado de Registros, contradiciendo su propia leyenda ("estado actual"). (b) El chip `⊘ k<5 protegido` aparece en vistas con **cero** unidades suprimidas (cumplimiento, ppp, control, bienestar), enseñando a ignorarlo justo donde importa. (c) En Registros/CSV la columna UNIDAD no lleva provincia: "25 de Mayo" aparece tres veces sin distinción.

**Bonus (defecto puro):** la pestaña **Referencias sale vacía** en la vista `sintomas`.

---

## Brechas de administración pública (transversales, ordenadas por impacto)

### G1 — No hay puente al expediente electrónico
Nada de lo que se ve en Panorama produce un **acto administrativo**. Bajo Ley 19.549 y el ecosistema GDE/TAD, una intimación, una derivación o una resolución nace de un expediente con número. Hoy el máximo output es un PDF ("Informe de situación") que vive fuera del circuito. Sin ese puente, Panorama es un instrumento de lectura que termina en un mail.

### G2 — No hay handoff interjurisdiccional ni interoperabilidad sanitaria
La rabia es de **notificación obligatoria** (Ley 15.465) y el sistema de referencia nacional es **SNVS 2.0 / SISA**; en especies productivas interviene **SENASA**. Panorama muestra la señal y no ofrece derivación, destinatario, acuse ni integración. El funcionario tiene que recargar el mismo hecho en otro sistema — con lo cual, o no lo hace, o el dato se bifurca.

### G3 — El denominador es el padrón, no el territorio
Todas las tasas dividen por las 67.519 mascotas registradas en MiMAR, no por la **población animal estimada** de la jurisdicción. "Cobertura antirrábica 63,6%" significa "63,6% de lo que ya conocemos". Para dimensionar una campaña, para contener una población y para rendir cuentas, el denominador correcto es la estimación poblacional. El panel "Acerca" nombra el denominador pero **no advierte su sesgo**, y ese sesgo premia sistemáticamente a las jurisdicciones con menos registro (visible en La Rioja 100% de PPP).

### G4 — Falta toda la capa de ejecución: operativo, capacidad y agenda
Ninguna vista toca el objeto que la administración realmente gestiona: **el operativo** (jornada de vacunación, quirófano móvil, inspección programada), su capacidad (vacunatorios, dosis y cadena de frío, quirófanos, inspectores, matriculados por departamento) ni su calendario. Panorama responde "dónde estamos mal" y se detiene justo antes de "dónde y con qué actuamos" — que es donde empieza el trabajo del funcionario. No es pedirle que sea un escritorio de decisión: es pedirle que muestre la oferta al lado de la demanda.

### G5 — No hay gestión del caso ni ciclo de vida del trámite
Denuncias de bienestar, decomisos, registros PPP y brotes son todos **procesos con estados, plazos, responsables y cierre**. Panorama los cuenta como eventos. Falta backlog, antigüedad, asignación, tiempo de respuesta y resolución — los indicadores por los que efectivamente se evalúa a un área. Y falta la articulación con la vía penal (Ley 14.346 → fiscalía, número de causa).

### G6 — No hay calidad del dato ni completitud del reporte
El sistema no distingue "no pasa nada" de "nadie carga". La vista `sintomas` vacía es el caso testigo: el texto dice bien *"Sin señales no es lo mismo que sin problema"*, pero no hay ninguna métrica de **completitud** (qué proporción de establecimientos/municipios reportó esta semana, quién carga, hace cuánto). Sin eso, todo mapa de MiMAR es simultáneamente un mapa del fenómeno y un mapa de quién usa MiMAR, y no se pueden separar.

### G7 — No hay rendición de cuentas ni transparencia activa
Falta la meta comprometida por jurisdicción y período (convenios, POA) con responsable y vencimiento; falta el historial de lo reportado y a quién; y falta el contrapeso ciudadano: la Ley 27.275 y la política de datos abiertos obligan a publicación activa, y no existe ni un dataset abierto ni un extracto versionado y fechado con el cual responder un pedido de acceso a la información. Tampoco se ve auditoría de consultas y descargas — indispensable en un organismo público que maneja datos con supresión por privacidad.

### G8 — El municipio, que es quien ejecuta, no tiene lugar propio
El selector llega a provincia/localidad y el mapa a departamento/partido, pero la unidad ejecutora de zoonosis, bienestar y registro PPP es en general el **municipio**. No hay identidad municipal, ni "mi municipio vs municipios comparables", ni una vista que un intendente pueda usar para su propia gestión. Es, además, la mayor oportunidad comercial desaprovechada: son cientos de compradores potenciales.

---

## Ranking de intervenciones sugeridas (por apalancamiento)

| # | Intervención | Vistas | Impacto |
|---|---|---|---|
| 1 | Arreglar el drill de vistas de tasa (tasa por departamento, o quitar el rótulo "PEORES" del ranking de conteos) | cumplimiento, control-poblacional, registro-ppp | Elimina una lectura invertida en el alcance donde trabaja el usuario real |
| 2 | Que el ranking siga el modo del mapa (per cápita) | bienestar | Elimina la contradicción en pantalla |
| 3 | Escala al rango observado con la meta como marca | control-poblacional, cumplimiento | Devuelve función analítica al mapa |
| 4 | Arreglar o retirar la vista `sintomas` (+ pestaña Referencias vacía) | sintomas | Quita un cero de la demo |
| 5 | Mostrar numerador/denominador y piso de denominador en tasas | registro-ppp, cumplimiento, control-poblacional | Mata el artefacto "La Rioja 100%" |
| 6 | Corregir etiquetas temporales, chip k<5 sin supresión y columna provincia en Registros/CSV | todas | Higiene de credibilidad; barato |
| 7 | Tratar visualmente distinto a lo suprimido (contorno, no marca) + reconciliar KPI vs mapa | brotes-activos, sintomas | Devuelve legibilidad al mapa nacional |
| 8 | Capa de completitud del reporte ("quién carga y hace cuánto") | todas | Separa el fenómeno del uso del sistema — habilita G6 |

---

*Revisión realizada en modo lectura sobre el servidor de producción local; no se modificó código, ni build, ni base de datos.*
