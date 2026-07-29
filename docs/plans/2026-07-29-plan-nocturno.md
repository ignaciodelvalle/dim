# Plan de ejecución nocturno — 2026-07-29

> **Este archivo es el estado, no mi contexto.** En una corrida larga me compacto;
> todo lo que haga falta para retomar en frío tiene que estar acá. Cada unidad se
> cierra sola: `pnpm verify` + suite + commit propio. Una unidad que falla NO
> bloquea las siguientes — se marca abajo y se sigue.

## La restricción que manda: el costo del gate

Medido en esta sesión, no estimado:

| Paso | Duración |
|---|---|
| `pnpm verify` (typecheck + 45 lints + build) | 5–8 min |
| Suite completo (12.4k tests) | 15–18 min |
| **Ciclo mínimo para dejar una unidad commiteada** | **~25 min** |

En 8 horas eso da **~19 ciclos teóricos**. Con implementación y lectura de código
en el medio, el ritmo real de esta sesión fue **~40 min por unidad landeada**
(8 commits). Presupuesto honesto: **10–12 unidades**, no 18.

**Regla de eficiencia**: correr el suite completo UNA vez por unidad, al final.
Durante la implementación, sólo los archivos afectados. El gate completo es lo
caro; los tests dirigidos cuestan segundos.

## Orden, y por qué

### Bloque 0 — arreglar el instrumento (primero, sí o sí)

**SC-5 — `rederivePetCache` no deriva el tatuaje del spine.**
Hace toda la sesión que el suite cierra en "1 rojo" y ese rojo es siempre el
mismo. Un suite permanentemente rojo **no distingue una rotura nueva de la
vieja** — cada corrida me obliga a leer el nombre del test para saber si rompí
algo. Es un instrumento roto, y se arregla antes de medir con él.
Falla sólo local (en CI pasa), lo que apunta a deriva del seed local más que a
un bug de la función. Empezar por reproducir con una mascota concreta.

### Bloque 1 — lo barato y bien especificado (alto rendimiento por hora)

| # | Unidad | Por qué es autónoma |
|---|---|---|
| 1 | **#32 fuga de `create-pet`** | Un test deja mascotas sin foto en `owner@dim.test` y rompe `crisis-owner-lost-flow`. Higiene de fixture, sin decisión. |
| 2 | **#31 crisis-seams (b)** | La firma de vacuna en Atender no encuentra su botón. Selector, acotado. |
| 3 | **C.3 — frame nacional → `AR_BBOX`** | El plan nombra la solución ya aplicada en `SituationalMap.tsx:1036-1044`. Es replicarla en el path de presets. Además destraba el pin de composición que dejé en `presets.test.ts` (hoy `bbox: 0`). |
| 4 | **C.4 — affordance de drill** | **Probablemente ya esté**: el revisor de panorama confirmó `<select>` reales y etiquetados, y se retractó de su primer hallazgo. Verificar y, si está, lo que falta es el TEST ("y testeable" es parte del enunciado). Si el test ya existe, cerrar la unidad como verificada. |
| 5 | **D.6 — credencial 390px + fallback de foto + OSM** | Tres cosas medidas: el header se pisa a sí mismo exactamente en 390px (`clientWidth 2px` vs `scrollWidth 58px`), falta `onError` en la foto, falta atribución OSM visible (esto último es licencia, no cosmética). |
| 6 | **D.5 — suelo perceptual del mapa** | Los ΔE ya están medidos: clase-1 vs sin-datos = 4,62; sin-datos vs fondo = **2,61**; entre clases adyacentes = 10,77. Separar lienzo/tierra/clase-1/sin-dato hasta que el piso supere el umbral. |
| 7 | **H.1 restante** | La decisión D6 ya está tomada: `grain` faltante **tira**. Más los 6 throw-paths sin test y las ramas admin de `describeViewScope` / `isNarrowedBelowMandate`. |
| 8 | **H.2 — contrato del seed demo** | Ampliado a SC-3. La fence de nombres de vacuna que escribí es el precedente del patrón. |
| 9 | **#38 lista de "recuperadas" por evento** | La definición ya existe y está documentada (`dashboards/perdidas.ts:217`, la que usa el KPI `recoveredMonth`). Falta la query de LISTA equivalente. |

### Bloque 2 — las grandes, de a una, cada una con su commit

| # | Unidad | Riesgo |
|---|---|---|
| 10 | **#40 k-anon por provincia** (decisión PO tomada) | `ProvinceChoroplethCell` (`build-features.ts:581`) NO tiene `suppressed`. Hay que agregarlo y enhebrarlo por `buildProvinceChoroplethFeatures` → `ProvinceChoroplethProps` → fill del `SituationalMap`, para que salga **rayada** (convención del grano departamental), no desaparecida. **Trampa**: en capas de TASA el umbral aplica al DENOMINADOR, no al `value` — Santa Cruz publica 100% sobre 11 mascotas y el `value` es 100, no 11. |
| 11 | **D.3 — una gramática de confirmación** | Seis gramáticas + dos caminos sin confirmación. La asimetría está al revés: reasignar un decomiso pide modal + "no se puede deshacer", y **cerrar una denuncia Ley 14.346** recibe un "Confirmar" genérico inline. Canon propuesto: el botón lleva el VERBO del acto. |
| 12 | **D.4 — anatomía única de chips** | Cinco anatomías en seis colas (4 ubicaciones de conteo, 4 formatos de fecha, 4 tratamientos de estado, 4 de código). Elegir la dominante y aplicarla. |
| 13 | **D.1 — codemod de radios + escala h1** | Mecánico pero toca muchos archivos; el riesgo es el volumen del diff, no la lógica. |
| 14 | **SC-6 — urgencia ordena la cola, no la página** | Medido: el server trae `openedAt DESC LIMIT 50` y la urgencia es un sort de cliente SOBRE esa página. Están invertidos (pág. 1 máx 76, pág. 12 máx 184, disputas de 650 días puntúan 1300). Necesita rework del cursor keyset. |
| 15 | **C.1 — libreta del dueño a la vista owner** | Peor de lo descrito: no hay chips de filtro (tres tiles, dos deshabilitados) y `/libreta` `/vacunas` `/historial` son **byte-idénticas** (md5 verificado). |
| 16 | **C.2 — transferencia saliente en la IA** | El link a `/transferencias` está gateado en un conteo **sólo de entrantes** con `hideWhenZero`: con 0 entrantes la ruta queda huérfana. Y `TransferSenderForm.tsx:117` promete "podés cancelarla". |
| 17 | **#41 detalle de caso** (decisión PO tomada) | La más grande. Sumar parte + cerrar con motivo, sobre la gramática de D.3 — **por eso va después de D.3**. |
| 18 | **D.8 — las tres partes que faltan** | Cerré sólo el verbo. Faltan: loop de "Asentar" con 0 mascotas, vacío que vende la credencial, éxito con descarga/impresión del QR. |

## Lo que NO puedo hacer solo

| Qué | Por qué |
|---|---|
| **D1 — remediación RLS en staging** | Requiere correr contra staging. Ignacio-gated por CLAUDE.md. |
| **D7 — fecha de cutover** | Decisión de negocio. |
| **Aplicar migraciones a una DB remota** | Escribir el archivo es trabajo mío; aplicarlo es Ignacio-gated. |
| **`"Inscripto/a"` → `"Registrado/a"` en la credencial** | Copy de la credencial pública insignia. El acto ya dice "Registrar"; si el estado debe seguirlo es decisión del PO. |
| **E2E rojo en CI** | `failed to start docker container "supabase_db_DIM"` — colisión de puertos en el runner de GitHub. Infra, no código. No lo persigo. |

## Reglas de la corrida

1. **Una unidad = un commit.** Nada de commits que mezclan dos unidades: si una
   hay que revertirla, tiene que salir sola.
2. **Probar por mutación, y verificar que la mutación se aplicó.** Tres
   mutaciones quedaron en no-op en la sesión anterior (reformateo de biome, regex
   con 0 reemplazos, cascada CSS). Un verde sobre mutación no aplicada es
   indistinguible de un test vacuo. `grep -c` el token mutado antes de leer el
   resultado.
3. **Nadie corre `build` mientras haya algo usando `:3000`** — y ANTES de correr
   cualquier e2e local, rebuildear y reiniciar. Un `verify` deja el servidor
   sirviendo chunks viejos (400, MIME `text/html`), la página no hidrata y TODO
   e2e falla por la razón equivocada. Mordió 4 veces en una sesión, la última
   costó un diagnóstico entero que hubo que retractar.
4. **Buscar case-insensitive cuando el selector lo es.** Un `rg 'Crear mascota'`
   no encuentra `/crear mascota/i` — 25 selectores invisibles hasta correr tests.
5. **Si `lint:spine` marca una mascota huérfana** creada por la propia corrida:
   es residuo de test, se borra con
   `SET LOCAL app.allow_event_mutation='true'` + `app.allow_event_mutation_actor`
   vía psql (el cascade a `pet_events` lo bloquea el trigger append-only).
6. **Al terminar cada unidad, actualizar la tabla de estado de abajo.** Ese es el
   punto de retome en frío.

## Hallazgo sistémico abierto — fixtures que dejan mascotas sin spine

`lint:spine` atrapó TRES veces en una sesión mascotas sin `pet_registered`
creadas por fixtures de test: `TRNS-TEST-0001`, `DDXTEST-RABIES-…` y las de
`create-pet`. No son tres accidentes: son fixtures que insertan mascotas
directo, salteando el circuito de alta, y no limpian. Cada una obliga a un
borrado manual con el GUC antes de poder commitear.

El arreglo sistémico va en **H.2** (contrato de seed/fixture): o pasan por el
circuito real, o llevan `seed_tag` (que la fence exime por diseño), o limpian
en su `afterAll`. Elegir una y aplicarla a todas.

## #31 crisis-seams (b) — RETRACTACIÓN + estado real

**Retracto el diagnóstico anterior de este archivo.** Lo escribí contra un
servidor `:3000` con `.next` clobbereado: los chunks devolvían 400 con MIME
`text/html`, la página nunca hidrataba y ningún handler de submit se enganchaba.
Cualquier conclusión sacada ahí no valía. **Cuarta vez que esta trampa muerde en
la sesión** — ver la regla 3, que ahora incluye correr e2e locales.

**Verificado contra un servidor FRESCO** (build + `qa-up.ps1` antes de medir):
el flujo de firma de vacuna **funciona**. Guionado a mano sobre
`DIM-PAMP-0001` en la clínica del primer org: el botón está visible y
habilitado, el submit navega a `?firmado=1`, cero errores de consola, cero
mensajes de validación. No hay defecto de producto en la firma.

**Lo que sigue fallando** es el spec, y ahora falla en otro lugar:
`locator.evaluate` agota 20s esperando
`getByRole('button', { name: /registrar vacuna/i })` — dentro de `submitAndWait`.
El input `vaccineName` YA pasó su propia aserción de visibilidad, así que el
formulario renderiza y el botón no está adjunto cuando se lo evalúa. Es la clase
de hidratación/clickthrough que el repo ya documentó (#39), no la lógica de
firma.

**Diferencia entre mi corrida a mano y el spec** (por acá va el próximo paso):
yo usé el primer org y `DIM-PAMP-0001`; el spec resuelve
`/Clínica Veterinaria Recoleta/i` y usa `ROCCO_TOKEN`, y corre DESPUÉS del test
(a), que marca esa misma mascota perdida y luego encontrada. Probar el spec (b)
AISLADO (`--grep "(b) clinic signs"`) separa "estado dejado por (a)" de
"timing de hidratación" en un solo intento.

## Estado (se actualiza durante la corrida)

| Unidad | Estado | Commit |
|---|---|---|
| SC-5 | **hecha** — suite verde de punta a punta por primera vez | `88dce3ba` |
| #32 create-pet | **hecha** — fuga cerrada + login por helper compartido. El spec sigue ROJO por un 3er problema aparte (cascada provincia→localidad), ya rojo antes | `05f4d43d` |
| #31 crisis-seams (b) | **en curso** — diagnóstico abajo, sin arreglo aún | |
| C.3 | pendiente | |
| C.4 | pendiente | |
| D.6 | pendiente | |
| D.5 | pendiente | |
| H.1 restante | pendiente | |
| H.2 | pendiente | |
| #38 recuperadas | pendiente | |
| #40 k-anon provincia | pendiente | |
| D.3 | pendiente | |
| D.4 | pendiente | |
| D.1 | pendiente | |
| SC-6 | pendiente | |
| C.1 | pendiente | |
| C.2 | pendiente | |
| #41 detalle de caso | pendiente | |
| D.8 (resto) | pendiente | |
