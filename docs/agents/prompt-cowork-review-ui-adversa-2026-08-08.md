# Cowork — revisión adversa de UI/UX, cobertura total

> Prompt para el agente Cowork con navegador. Objetivo: recorrer **todas** las
> pantallas y **todos** los flujos, desde **todos** los perfiles, buscando
> activamente lo que está mal.
>
> **Este documento ES el clickthrough.** Cowork corre en UN navegador y en
> serie, así que separar "siembra por clickthrough" de "revisión adversa"
> significaría caminar el producto dos veces. Se crea por los flujos reales y se
> revisa en el mismo paso — ver §8. De
> `cowork-full-cycle-seed-clickthrough.md` se conserva el inventario de flujos
> como checklist; lo que cambia es que el entregable ahora es el juicio, no el
> dato creado.
>
> **Creado 2026-08-08**, después de la corrida nocturna de Parte B. Ese informe
> tuvo excelente observación y diagnóstico flojo — la sección "Contrato de
> evidencia" existe por eso y es la parte más importante de este documento.

---

Sos revisor adverso de UI/UX de miMAR. Tu trabajo no es confirmar que funciona:
es encontrar dónde el producto miente, confunde, bloquea o se contradice. Un
informe sin hallazgos es un informe fallido — o no miraste lo suficiente.

Trabajás con paciencia. Esto no se hace en una noche. Preferimos **una pantalla
agotada** a veinte pantallas hojeadas.

---

## 1. Contrato de evidencia (leé esto dos veces)

La corrida anterior midió cosas reales, en el navegador real, con números
reales — eso estuvo muy bien y queremos más. Lo que falló fue el salto de la
observación a la causa. Cuatro ejemplos de esa misma corrida:

- Se reportó que los inputs usaban `:focus` y los botones `:focus-visible`. La
  medición era correcta; la causa no. Ese anillo con mouse **es** el
  comportamiento de `:focus-visible` según el spec (heurístico de text-entry en
  campos de texto). El fix propuesto habría sido un no-op sobre 92 controles.
- Se reportó "dos sistemas de input conviviendo". Los dos formularios ya usaban
  el mismo sistema; lo que faltaba era un piso de altura en una densidad.
- Se reportó el warning de Recharts con una causa que ya tenía fix aplicado. La
  causa real estaba una capa más abajo, en la librería.
- Se reportó un `200` en vez de `404` en una ruta. Eran diez rutas — y dos de
  ellas se habrían roto con el fix propuesto, porque reciben un código público,
  no un uuid.

**Regla que sale de ahí: separá siempre estos tres niveles, y etiquetalos.**

| Nivel | Qué es | Exigencia |
|---|---|---|
| **OBSERVACIÓN** | Lo que viste o mediste | Obligatoria. Con evidencia dura. |
| **HIPÓTESIS** | Por qué creés que pasa | Opcional. Marcala como hipótesis SIEMPRE. |
| **SUGERENCIA** | Qué harías | Opcional. Nunca como si estuviera verificada. |

- Una OBSERVACIÓN sin evidencia dura no se reporta. Evidencia dura =
  URL exacta + cuenta usada + hora ART + selector o texto literal + valor
  computado (`getComputedStyle`, `getBoundingClientRect`, `textContent`) +
  captura. "Se ve desalineado" no es evidencia; "el input mide 38px y el botón
  al lado 44px" sí.
- **No leas el código fuente para diagnosticar.** No tenés acceso y no lo
  necesitás. Tu valor es el navegador. Si escribís una causa, es hipótesis.
- **Si algo te sorprende, medí de nuevo antes de escribirlo.** Dos veces, y si
  podés en dos condiciones distintas (recargando, en otra cuenta, en otra hora).
- **Retractate en el mismo informe.** La corrida anterior retiró un hallazgo
  propio (N2) al identificar los elementos uno por uno. Eso subió la confianza
  en todo lo demás. Hacelo siempre que corresponda.
- **Decir "esto está limpio" también es entregable.** Una sección de lo
  verificado-y-sano vale tanto como los hallazgos: es lo que no hay que volver
  a mirar.

### Severidad — usá esta escala, no inventes otra

| | Criterio |
|---|---|
| **BLOQUEANTE** | Un flujo no se puede completar. O se completa y produce un dato falso. |
| **ALTA** | El usuario toma una decisión equivocada por culpa de la interfaz. Incluye: consecuencia legal no divulgada, dato presentado como más firme de lo que es, pérdida de trabajo. |
| **MEDIA** | Fricción real, retrabajo, o inconsistencia que enseña algo falso sobre el sistema. |
| **BAJA** | Pulido. No cambia ninguna decisión. |
| **LUPA** | No pudiste verificarlo. Decí exactamente qué te faltó. |

---

## 2. Reglas duras del entorno (te ahorran horas)

1. **LA VENTANA TIENE QUE ESTAR AL FRENTE Y VISIBLE.** Con la pestaña
   minimizada o en segundo plano, Chrome no ejecuta los scripts inline de
   *reveal* del streaming SSR de React: la página queda congelada en "Cargando…"
   con el HTML ya recibido. La corrida anterior perdió medio informe
   diagnosticando eso como un bug de producto (era el entorno). Verificá
   `document.visibilityState === "visible"` antes de cada medición y decilo en
   el informe.
2. **Rate limits reales.** Login: **5/min por email**, 20/hora. Denuncia
   anónima: 1/min por IP. Activación de chapa: 5/min por IP + 3/min por serial.
   Logueá cada cuenta **una sola vez**, en su propio contexto/pestaña, y reusá
   la sesión toda la corrida. Si te bloquea, esperá 2 minutos. No insistas.
3. **No corras builds ni reinicies el servidor.** Un `build` mientras el server
   está vivo rompe los chunks de JS de la sesión en curso. Si la app empieza a
   tirar 400 en `/_next/static/...`, avisá y pará — no es un bug de producto.
4. **Mobile: no pelees con la ventana.** Chrome en Windows no baja de ~657px de
   ventana / 642px de viewport, y 642 está por ENCIMA del breakpoint `sm` (640),
   así que lo que verías es tablet, no teléfono. El layout &lt;640px ya tiene
   cobertura automatizada (`e2e/mobile-390.spec.ts`). Vos ocupate de **642px y
   zoom 200%/400%**, que sí podés, y no reportes "no pude ver mobile".
5. **Franja horaria ART/UTC.** Entre las 21:00 y las 00:00 ART la fecha UTC ya
   es la del día siguiente. Es la ventana donde se rompen las fechas. Hacé
   **una pasada entera de fechas dentro de esa franja** y decilo.
6. **Prefijo `CW-` en todo lo que crees.** No toques `DIM-DEMO-*`,
   `DIM-PAMP-0001` (Pampa), ni cuentas `cursor-*`. Si tomás o asignás algo de
   la semilla, **devolvelo al estado original** y verificalo.
7. **Solo UI.** Nada de SQL ni API directa. Si un flujo no se puede completar
   por la interfaz, **eso es un hallazgo**, no un motivo para buscar un atajo.

---

## 3. Los perfiles (todos, con `Test1234!`)

Cada uno ve un producto distinto. La corrida anterior usó dos.

| Cuenta | Rol | Lo que sólo se ve desde acá |
|---|---|---|
| *(anónimo)* | Ciudadano sin cuenta | Credencial pública, QR, `/t/[serial]`, denuncia anónima, adopción, perdidas |
| `owner@dim.test` | Dueño | Libreta, eventos propios, perdida/hallazgo, turnos, transferencia, chapas |
| `owner2@dim.test` | Segunda dueña | La otra punta de transferencia y de adopción. Aislamiento cross-tenant. |
| `vet@dim.test` | Veterinario matriculado | Firma profesional, atender walk-in, el contraste firmado/declarado |
| `orgadmin@dim.test` | Admin de refugio | Intake, roster, adopciones, import CSV, checklist de setup |
| `govt@dim.test` | Funcionario (Ushuaia + El Calafate) | Jurisdicción REMOTA — el caso de borde de alcance |
| `govt-local@dim.test` | Funcionario (La Plata + Palermo) | Jurisdicción LOCAL — donde están los datos |
| `admin@dim.test` | Admin plataforma | Moderación, chapas, reglas, outbox, usuarios, organizaciones |

> Los dos `govt` **no son intercambiables**: uno ve datos y el otro ve vacíos.
> Esa diferencia es material — usá ambos donde el alcance importe.

---

## 4. Las doce lentes adversas

Esto es lo que todavía **no** revisamos, y es donde está el valor que queda.
Cada pantalla se mira con todas las lentes que apliquen. No es una lista de
pantallas: es una lista de **preguntas**.

### L1 · Consistencia cross-perfil del mismo objeto
Tomá **una** mascota, **un** caso y **una** denuncia. Abrí cada uno desde los 8
perfiles. ¿Se llama igual? ¿El estado se dice con las mismas palabras? ¿La
fecha se formatea igual? ¿El que no puede verlo recibe un 404 o un "sin
permiso"? Un sistema federado se cae acá primero. **Nunca lo miramos.**

### L2 · Divulgación de consecuencia antes del click
Acciones irreversibles: decomiso (Ley 14.346), finalizar adopción, revocar
organización o usuario, transferir, dar de baja. Antes de confirmar, ¿la
pantalla dice **qué pasa**, **a quién le llega**, **con qué fundamento legal** y
**que no se puede deshacer**? ¿O eso aparece recién en el modal, o nunca?

### L3 · Honestidad de la procedencia
Invariante del proyecto: los cachés se declaran. Por cada número que veas:
¿dice de dónde sale, cuándo se calculó y si es un caché? Los tableros tienen
procedencia; ¿la tienen las pantallas operativas? ¿Hay algún número que se
presente como más firme de lo que es? Un KPI sin fecha de cálculo es un hallazgo.

### L4 · Los siete estados de cada pantalla
Casi siempre revisamos uno. Por pantalla: **vacío absoluto**, **vacío por
filtro**, **cargando**, **error**, **sin permiso**, **offline**, **datos
viejos**. ¿Existen los siete? ¿El vacío por filtro ofrece limpiar el filtro? ¿El
error ofrece reintentar? ¿El "sin permiso" filtra información por diferencia?

### L5 · Callejones sin salida
Desde cada pantalla: ¿se puede volver? ¿El error ofrece una acción siguiente o
sólo un código? ¿Qué pasa si recargás en el paso 3 de un wizard? ¿Y si apretás
"atrás" del navegador en medio de un flujo? ¿Y si abrís un deep-link viejo?

### L6 · Primera vez vs experto
Cuenta nueva, cero datos. ¿La app explica qué hacer? El checklist de setup de
org estaba bloqueado por no haber alta de organizaciones — **probá igual la
primera vez del DUEÑO**, que no está bloqueada: registrate, no cargues nada, y
mirá qué te muestra cada pantalla vacía.

### L7 · Teclado solo, de punta a punta
Guardá el mouse. Completá un flujo entero — denuncia, o alta de mascota, o
decomiso — sólo con teclado. ¿El orden de foco sigue al orden visual? ¿Los
modales atrapan el foco y lo devuelven al cerrar? ¿Hay trampas? ¿Los cambios
asíncronos se anuncian? ¿Se puede llegar a todo?

### L8 · Codificación por color y contraste
Buscá información que se transmita **sólo** por color (severidad, estado,
prioridad). Verificalo en escala de grises. Verificá contraste de texto sobre
sus fondos reales. ¿Sobrevive impreso en blanco y negro?

### L9 · Voz y registro del copy
Tres registros conviven: ciudadano, operador y legal. ¿Se mezclan? ¿Hay
vocabulario de debug filtrado ("filas", "items", "payload")? ¿El voseo es
consistente? ¿Los términos de estado se dicen igual en toda la app? Armá un
**glosario de estados** con dónde aparece cada variante.

### L10 · Superficies documento (impresión y PDF)
La credencial **es** un documento. Imprimí a PDF: credencial pública, libreta
sanitaria, expediente de caso, informe, contrato de adopción, plantilla y export
CSV. ¿Se corta? ¿Sobrevive el QR? ¿Sale el chrome de la app? ¿Hay
encabezado/pie? ¿Se entiende sin la pantalla al lado?

### L11 · Valores extremos y densidad
El nombre más largo, la localidad más larga, la descripción más larga, 0 filas,
muchas filas, un número de 7 dígitos, un texto sin espacios. ¿Rompe la grilla?
¿Se trunca sin `title`? ¿Los stat-cards con texto largo desalinean la fila?

### L12 · Tiempo, zona y notificaciones
Toda superficie con fecha, revisada dentro de la franja 21:00–00:00 ART. ¿Hay
mezcla de formatos (numérico vs largo) sin regla? ¿Algún "hace X" que no
coincida con el timestamp? Y del lado de las notificaciones: ¿qué le llega
efectivamente al usuario cuando pasa algo? Revisá el outbox contra lo que la
pantalla prometió.

---

## 5. Matriz de cobertura (obligatoria)

El entregable incluye una tabla **pantalla × perfil** con uno de: `OK`,
`HALLAZGO #n`, `NO APLICA` (con motivo), `BLOQUEADO` (con qué lo bloqueó).
**No se acepta una celda vacía.** Si no llegaste, va `BLOQUEADO`.

Superficies mínimas, agrupadas. Marcá las que descubras y no estén acá.

**Público / anónimo**
`/` · `/adoptar` · `/adoptar/[token]` · `/perdidas` · `/p/[token]` (normal, perdida, fallecida) · `/t/[serial]` (inexistente, sin activar, activado) · `/denuncias/nueva` (wizard completo) · `/denuncias/codigo/[code]` · `/denuncias/buscar` · `/iniciar-sesion` · `/registro` · recuperar contraseña · 404 y error boundary

**Dueño**
`/mis-mascotas` · detalle · `/mis-mascotas/nueva` · editar · libreta sanitaria · eventos (uno de **cada** tipo, incluido tatuaje y peso) · enmendar evento · marcar perdida / encontrada · `/mis-mascotas/reclamar` · transferencia (proponer y aceptar) · turnos (buscar, reservar, mis turnos) · `/cuenta/editar` · chapas (activar, panel) · privacidad "qué se muestra"

**Veterinario**
Atender walk-in · firmar evento · contraste firmado vs declarado en la libreta · su vista del roster de la org

**Organización**
Panel · checklist de setup · intake individual · intake por CSV (plantilla, válido, con errores, CSV de errores, re-subida) · roster · export · mascota en custodia · adopciones (listar, postulación, aprobar, rechazar, finalizar, contrato) · configuración

**Gobierno** (con `govt@` y `govt-local@`)
`/gob` briefing · denuncias (cola, filtros, detalle, tomar, revisar, derivar) · maltrato (cola, detalle, inspector) · moderación · decomisos (nuevo, listado, reasignar) · casos · vigilancia + investigaciones · programa · padrón · panorama/mapa · reglas (listado, nueva, editar) · outbox · organizaciones · usuarios · disputas

**Admin**
`/admin` · casos · moderación · outbox (lista y detalle) · chapas (emitir, lote, CSV) · reglas · suscripciones · usuarios · admins · govts · organizaciones

---

## 6. Definition of Done

La revisión está cerrada cuando **todo** esto es cierto:

1. **Cobertura**: la matriz pantalla × perfil está completa, sin celdas vacías,
   y cada `BLOQUEADO` nombra qué lo bloqueó y qué haría falta para destrabarlo.
2. **Profundidad**: cada flujo se recorrió **paso a paso**, no por deep-link.
   Para cada flujo multi-paso hay constancia de qué se vio en cada paso, y de
   qué pasa al recargar y al ir "atrás" en medio.
3. **Perfiles**: los 8 perfiles se usaron. Al menos **tres objetos** (una
   mascota, un caso, una denuncia) se miraron desde todos los perfiles que
   puedan verlos (L1).
4. **Lentes**: las 12 lentes se aplicaron, cada una con al menos una constancia
   escrita — hallazgo o "verificado limpio, así lo comprobé".
5. **Evidencia**: cada hallazgo tiene URL, cuenta, hora ART, valor medido y
   captura. Los de severidad ALTA o BLOQUEANTE, además, tienen **pasos de
   reproducción numerados** que un tercero pueda seguir.
6. **Estados**: los siete estados (L4) se buscaron en cada superficie de listado
   y de detalle. Los que no se pudieron disparar van como LUPA con el motivo.
7. **Accesibilidad**: al menos un flujo completo hecho **sólo con teclado**, y
   una pasada de color-only + contraste + zoom 200%.
8. **Documentos**: todas las superficies imprimibles impresas a PDF y revisadas.
9. **Fechas**: una pasada completa dentro de la franja 21:00–00:00 ART.
10. **Limpieza**: tabla de todo lo creado con prefijo `CW-`, y constancia de que
    todo lo que se tomó de la semilla volvió a su estado original.
11. **Honestidad**: hay una sección de "verificado y limpio", una de
    retractaciones (si las hubo) y una de "no pude verificar" con el motivo
    exacto. Un informe sin la tercera sección es sospechoso.
12. **Sin prescripciones disfrazadas**: ninguna causa aparece afirmada sin
    evidencia de navegador. Todo lo demás dice "hipótesis".

---

## 7. Formato del entregable

Un documento por **sesión** (S1…S8), más un índice. Por hallazgo:

```
### [SEVERIDAD] Nn · Título en una línea

**Dónde**: URL exacta · cuenta · hora ART
**Observación**: qué viste. Valores medidos. Selector o texto literal.
**Evidencia**: captura, y el valor computado si aplica.
**Reproducción** (obligatoria en ALTA/BLOQUEANTE):
  1. …
  2. …
**Impacto**: qué decisión equivocada toma el usuario por esto.
**Hipótesis** (opcional, marcada como tal): …
**Sugerencia** (opcional, marcada como tal): …
```

Y al final del informe, sí o sí:

- Matriz de cobertura completa
- Sección "verificado y limpio"
- Sección "retractaciones"
- Sección "no pude verificar y por qué"
- Glosario de estados observados (L9)
- Tabla de datos `CW-` creados y de lo restaurado

---

## 8. Esto ES el clickthrough — no hay dos pasadas

Cowork es **un** navegador y trabaja en **serie**. Con esa restricción, separar
"siembra por clickthrough" de "revisión adversa" significa caminar el producto
dos veces, y la segunda vuelta no descubre nada que la primera no pudiera haber
visto.

Entonces: **creás los datos por los flujos reales Y revisás adversamente en el
mismo paso.** No podés revisar "finalizar adopción" sin finalizar una adopción.

De `cowork-full-cycle-seed-clickthrough.md` se conserva:

- el inventario de flujos (es el más completo que tenemos — usalo como
  checklist de que no te salteaste ninguno),
- el prefijo `CW-` y la regla de no tocar el elenco demo,
- la tabla final de lo creado.

Lo que cambia es el **entregable**: ahí el objetivo era que el flujo se
completara; acá el objetivo es el juicio sobre cómo se siente completarlo.

---

## 9. Plan de ejecución en sesiones (serial)

Ocho sesiones, en este orden. El orden **no** es temático: está armado para que
cada sesión deje servida a la siguiente, y para que ninguna quede bloqueada
esperando datos que otra tenía que crear.

| # | Sesión | Cuentas | Crea | Necesita |
|---|---|---|---|---|
| **S1** | Público, anónimo y denuncia | *(ninguna)* | Denuncias `CW-` | — |
| **S2** | Dueño: ciclo completo de la mascota | `owner@`, `owner2@` | Mascotas, eventos, perdida/hallazgo, turnos, transferencia | — |
| **S3** | Veterinario y organización | `vet@`, `orgadmin@` | Intake, CSV, adopciones, firmas | S2 (mascotas) |
| **S4** | Admin y plataforma | `admin@` | Chapas, reglas, moderación | S1 (denuncias) |
| **S5** | Gobierno, las dos jurisdicciones | `govt-local@`, `govt@` | Decomisos, derivaciones | S1, S4 |
| **S6** | Cross-perfil — los 3 objetos, los 8 roles | *todas, lectura* | Nada | S1–S5 |
| **S7** | Teclado, color, zoom | *lectura* | Nada | — |
| **S8** | Documentos impresos y fechas ART | *lectura* | Nada | S1–S5 |

### Lo que acelera de verdad a un agente serial

No hay paralelismo que ganar, así que la velocidad sale de **no repetir trabajo**:

1. **Una sesión de navegador para toda la corrida.** Logueá cada cuenta UNA vez
   y no cierres el contexto entre sesiones. Cada re-login es tiempo muerto y
   además arriesga el 5/min por email.
2. **Handoff al final de cada sesión** — un bloque corto y estructurado:
   entidades creadas con su token/código público, en qué estado quedaron, qué
   quedó pendiente y por qué. La sesión siguiente arranca leyendo eso en vez de
   redescubrir tokens navegando.
3. **Ledger de hallazgos append-only**, una línea por hallazgo
   (`sesión · severidad · pantalla · título`). Antes de escribir uno, mirá si ya
   está. Si el mismo problema aparece en tres pantallas, es **un** hallazgo
   sistémico, no tres.
4. **No vuelvas atrás a "chequear una cosita".** Anotala como pendiente para la
   sesión transversal que corresponda (S6, S7 u S8). Volver cuesta más que
   anotar.
5. **S6, S7 y S8 barren muchas pantallas por hora** porque son de sólo lectura
   y no esperan mutaciones. Son las más baratas y las que nunca hicimos.
6. **La pasada de fechas (L12) se hace UNA vez**, en S8, dentro de la franja
   21:00–00:00 ART. Las otras sesiones no la repiten — sólo anotan si ven algo
   raro con una fecha.

### Si querés señal antes de terminar todo

`S1 → S2` es el camino del ciudadano: escanear un QR, ver la credencial,
registrar una mascota, perderla y recuperarla. Es la premisa del producto y es
donde un problema duele más. Si sólo hay tiempo para dos sesiones, son esas.

`S6` es la de mayor rendimiento por hora, y su mitad sobre **datos de semilla**
(Pampa, denuncias y casos ya sembrados) no depende de S1–S5: se puede correr

---

## 10. Corrida desatendida — contrato por sesión

> Aplica cuando las 8 sesiones corren de corrido, sin nadie mirando. El riesgo
> específico de este modo: **una sesión temprana falla a medias, y las que
> siguen corren sobre datos que no existen y producen un informe verde que no
> significa nada.** Todo lo de acá abajo existe para que eso sea imposible.

### 10.0 — Precondición global (antes de S1, una sola vez)

Staging tiene que estar sirviendo el commit `2b3bc9b2` o posterior. Verificalo
así, y **si no coincide, PARÁ y reportá — no arranques**:

- Abrí `/gob/decomisos/nuevo` (con `govt-local@`). El selector de adjuntos debe
  decir **"Elegir archivos"**, no "Choose Files".
- En `/gob`, ningún porcentaje debe tener punto decimal. Todos con coma.
- `/org/{token}/adopciones/cualquier-cosa-invalida` debe dar la pantalla de
  **"No encontramos esta página"**, no "Algo salió mal".

Si alguna de las tres falla, staging todavía sirve el build viejo: esperá 5
minutos y reintentá. A los 3 intentos fallidos, pará y dejá el reporte.

### 10.1 — Puerta de entrada de cada sesión

Antes de revisar nada, cada sesión **verifica que sus insumos existen**. Si no
existen, la sesión **NO se ejecuta**: escribe un handoff de tipo `ABORTADA` con
el motivo y pasa a la siguiente.

| Sesión | Antes de empezar, comprobá que… | Si falta |
|---|---|---|
| S1 | La precondición 10.0 pasó | PARÁ TODO |
| S2 | Podés loguear `owner@` y ves `/mis-mascotas` | ABORTADA |
| S3 | Existe al menos una mascota `CW-` creada por S2 | ABORTADA |
| S4 | Existe al menos una denuncia `CW-` creada por S1 | ABORTADA |
| S5 | S4 dejó al menos una denuncia moderada, y `/gob/denuncias` lista algo | ABORTADA |
| S6 | Tenés los 3 objetos del handoff (mascota, caso, denuncia) con sus tokens | Corré la mitad de SEMILLA igual, y anotá que la mitad `CW-` quedó pendiente |
| S7 | — (sólo lectura, sin dependencias) | Nunca aborta |
| S8 | — (sólo lectura); para la pasada de fechas, que sean 21:00–00:00 ART | Hacé impresión igual, dejá fechas pendiente |

**Una sesión ABORTADA no es un fracaso de la corrida** — es el sistema
funcionando. Un informe que dice "no pude hacer S5 porque S4 no dejó denuncias
moderadas" vale mucho más que uno que dice "S5 limpio, 0 hallazgos" sobre una
cola vacía.

### 10.2 — Formato del handoff (obligatorio al cierre de cada sesión)

```
## HANDOFF S{n} — {ABORTADA | PARCIAL | COMPLETA}

Inicio: {hora ART} · Fin: {hora ART}
Precondición: {qué comprobaste y qué viste}

### Entidades creadas
| Tipo | Nombre / token público | Estado en que quedó | Cuenta |
|---|---|---|---|

### Semilla tocada y restaurada
| Qué | Cómo estaba | Cómo lo dejé | ¿Verificado? |
|---|---|---|---|

### Pantallas cubiertas
{n} de {total} previstas. Las no cubiertas, con motivo.

### Hallazgos
S{n}-01 … (sólo los títulos; el detalle va en el informe)

### Pendiente para otra sesión
- {qué} → {a qué sesión se lo pasás} → {por qué no lo hiciste acá}
```

### 10.3 — Cuándo parar y cuándo seguir

- **BLOQUEANTE** → reportalo de inmediato, dejá de mutar en esa área,
  **seguí** con el resto de la sesión. No cortes la corrida.
- **La app deja de cargar en todas partes, o hay 400 en `/_next/static/…`** →
  PARÁ TODO. Es infraestructura, no producto. Dejá el reporte y no sigas.
- **Un rate limit te bloquea** → esperá 2 minutos, una sola vez. Si vuelve a
  bloquear, marcá esa parte como `BLOQUEADO` y seguí con lo que no necesita esa
  cuenta.
- **Un flujo no se puede completar por la UI** → es un hallazgo, y la sesión
  sigue. Nunca busques un atajo por URL directa para "destrabar".
- **Te quedaste sin saber si algo es bug tuyo o del producto** → LUPA, con la
  duda escrita. No adivines.

### 10.4 — Presupuesto de tiempo

Ocho sesiones en una noche significa que ninguna puede comerse el presupuesto.
Orientativo, no rígido:

| Sesión | Presupuesto | Si te pasás |
|---|---|---|
| S1, S2 | ~90 min c/u | Cerrá con handoff `PARCIAL` y lo no cubierto listado |
| S3, S4, S5 | ~75 min c/u | Ídem |
| S6 | ~60 min | Ídem |
| S7, S8 | ~45 min c/u | Ídem |

**Preferimos 8 handoffs `PARCIAL` honestos a 3 `COMPLETA` y 5 sesiones que
nunca corrieron.** Si una sesión se está yendo de tiempo, cerrala bien y pasá a
la siguiente: la puerta de entrada de 10.1 se encarga de que la siguiente sepa
qué le falta.

### 10.5 — DoD por sesión (checklist antes de escribir el handoff)

Ninguna sesión se cierra sin poder responder que sí a todo esto:

1. ¿Comprobé mi precondición (10.1) y lo escribí?
2. ¿Recorrí los flujos **paso a paso**, sin deep-links para saltear pasos?
3. ¿Probé, en al menos un flujo multi-paso, qué pasa al **recargar** en el
   medio y al apretar **atrás** del navegador?
4. ¿Busqué los siete estados (L4) en cada listado y cada detalle que toqué?
5. ¿Cada hallazgo tiene URL, cuenta, hora ART, valor medido y captura? ¿Los
   ALTA/BLOQUEANTE tienen pasos numerados de reproducción?
6. ¿Separé OBSERVACIÓN de HIPÓTESIS de SUGERENCIA en todos?
7. ¿Escribí la sección de **verificado y limpio**?
8. ¿Escribí la sección de **no pude verificar**, con el motivo exacto?
9. ¿Devolví a su estado original todo lo que tomé de la semilla, y lo
   **verifiqué** volviendo a mirarlo?
10. ¿El handoff tiene el formato de 10.2, con los tokens públicos escritos?

### 10.6 — Al final de la corrida

Un documento de cierre, además de los 8 informes:

- Tabla de las 8 sesiones con su estado (`COMPLETA` / `PARCIAL` / `ABORTADA`) y
  una línea de por qué.
- **Matriz de cobertura consolidada** pantalla × perfil, sin celdas vacías.
- Ledger completo de hallazgos ordenado por severidad.
- **Hallazgos sistémicos**: los que aparecieron en 3 o más pantallas. Estos son
  los más valiosos y los más fáciles de perder entre 8 informes separados.
- Las 12 lentes con su constancia: hallazgo, o "verificado limpio, así lo
  comprobé", o "no llegué".
- Todo lo `CW-` creado, para poder limpiarlo.
