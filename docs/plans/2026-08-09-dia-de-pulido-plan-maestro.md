# Día de pulido — plan maestro

**Fecha:** 2026-08-09 · **Rama:** `integration/all-20260703` · **Base:** `c678f0a4`
**Objetivo del PO:** que hoy salga un producto pulido y estable — que todo cargue, que todo sea consistente, y que **todas** las proyecciones (dashboards, listas, colas) corran sobre datos pseudo-reales, cargados a mano o por los pasos reales del producto.

---

## La tensión, dicha de frente

"Bug-free" no es un estado alcanzable en un día sobre **246 rutas** (`page.tsx`: 52 en gob, 46 en admin, 44 en org, 77 en `(app)`, 27 en `(public)`), y perseguirlo produce peor resultado que elegir bien. Lo que sí es alcanzable, y es lo que este plan persigue:

> **Toda ruta del camino del piloto carga con datos creíbles, y cada número coincide con el que tiene al lado.**

Eso es "pulido para la audiencia que tenés enfrente". El resto es deuda conocida y anotada, que es una posición honesta; "bug-free" declarado sin evidencia no lo es.

---

## La tesis: cargar a mano ES la review

No es preparación para la review. Es **la review de mayor rendimiento que tenemos**.

Todos los defectos que encontró la jornada de resiliencia vivieron *entre el formulario y la pantalla*: el pie de frescura que colgaba seis páginas ya certificadas, el degradado que se comía la barra de filtros, el gemelo admin sin cota, la credencial pública con `try/catch` sobre el eje equivocado. **Ningún seed llega ahí.** Un script prueba la consulta, el índice y el agregado; recorrer los pasos reales prueba el formulario, la validación, el evento emitido y la proyección que sale del otro lado.

Recorrer los flujos genera los datos **como efecto secundario** y encuentra la fricción **como producto principal**. Por eso "datos" no es el ítem 1 de una lista: es el eje del día.

Corolario operativo: **script sólo donde la mano no llega.** Nadie marca 3.000 mascotas como perdidas a mano, y ahí sólo importa la proyección — ese es el único lugar donde el script es la herramienta correcta.

---

## Los tres huecos que bloquean, medidos hoy

Contra la base local, `docker exec supabase_db_DIM psql`:

```
future_slots=0     govt_rules=0     lost_pets=41 / 32.430     appointments_future=0
```

| Hueco | Qué rompe | ¿Se puede a mano? |
|---|---|---|
| `time_slots` futuros = 0 | `/turnos/buscar` **no puede devolver nada, nunca**. La agenda del vet está vacía por construcción. Bloquea el piloto veterinario. | **Sí** — `AgendaRuleForm` + `MaterializeNowButton` en `/org/[orgToken]/servicios/[offeringToken]/agenda` |
| `govt_business_rules` = 0 | `/gob/reglas` muestra 10 defaults hardcodeados con la columna "origen" idéntica, y hace 30-150 consultas para mostrarlos: sin filas, la cascada localidad→provincia→país no tiene dónde cortocircuitar | **Sí** — `/gob/reglas/[country]/[province]/[locality]/nueva`, seis formularios por tipo de regla |
| `lost_pets` = 41 sobre 32.430 (0,13%) | `/perdidas` público estadísticamente vacío; la tasa de reunificación se calcula sobre 41 filas | **No** — acá el script es correcto |

Que los dos primeros tengan camino de UI real es lo que hace posible este plan. Si no lo tuvieran, el día sería otro.

---

## Orden de ejecución

### Fase 0 — piso honesto
`scripts/qa-up.ps1` (con `powershell.exe`, no `pwsh`: PowerShell 7 no está instalado en esta máquina). Verifica contenedores, frescura del build contra HEAD, levanta el servidor de producción en :3000, smoke de rutas clave y cuentas semilla.

> **Trampa conocida:** un `pnpm build` mientras :3000 está vivo rompe la app en curso (chunks JS en 400). Construir y reiniciar, en ese orden, siempre.

### Fase 1 — recorrido del veterinario *(desbloquea turnos)*
`/org/[orgToken]/servicios/nuevo` (3 pasos) → `/servicios/[offeringToken]/agenda`: regla de disponibilidad → **Materializar ahora** → como `owner@`, `/turnos/buscar` → `[offeringToken]` → `reservar/[slotId]` → `/mis-turnos` → de vuelta como vet, `/org/[orgToken]/agenda/turnos/[appointmentToken]` → atender → evento firmado.

Llena `time_slots` futuros **y** `appointments`, y ejercita la cadena completa oferta → regla → materialización → reserva → atención → evento.

### Fase 2 — recorrido del funcionario *(desbloquea reglas)*
Como `govt-local@` (CABA/Palermo): cargar reglas reales por los seis formularios. Llena `govt_business_rules`, apaga la amplificación de consultas y hace que la columna "origen" diga algo distinto de sí misma.

### Fase 3 — volumen donde la mano no llega · ~~perdidas~~ **DESCARTADA POR EL PO**

> **DECISIÓN (PO, 2026-08-09): no se tocan las perdidas hoy.** Quedan 41 sobre 32.430. El tiempo va al barrido de carga y a consistencia, que tocan más pantallas.
>
> **Consecuencia a manejar en la demo:** la tasa de reunificación se calcula sobre 41 episodios. **No citarla.**

Si en algún momento se hace, la forma correcta está identificada y **no es SQL**: `setPetLostWriter` (`src/modules/events/application/lifecycle/set-pet-lost-use-case.ts:108`) está exportado justamente para llamarse fuera del contexto de Next. Un `UPDATE pets SET status='lost'` crearía la fila de caché **sin** su evento `pet_lost`, violando el invariante #3 y haciendo que la tasa de reunificación corra sobre una población falsa. El writer además necesita un `broadcastLostPet` no-op, o serían miles de notificaciones.

### Fase 4 — barrido de carga por rol
Que **todo** cargue. El manifiesto cubre 50 rutas y arrastra 42 en baseline; el universo real es 246. Mecánico, automatizable, y queda como red permanente en vez de como un chequeo de una tarde.

### Fase 5 — consistencia
Los números que aparecen dos veces deben coincidir. Acá vive **P3**, ya diagnosticado: seis formatos de fecha, `Sábado, 8 De Agosto` (que es `capitalize` sobre texto correcto, capitalizando preposiciones), el `·` que pierde el espacio en tres componentes. La hora **no** se toca: 24h verificado en los cuatro portales.

---

## Qué NO toca hoy, y por qué

| Review | Por qué se corre de lugar |
|---|---|
| **Auditoría de flakes** | No la ve un funcionario. Es salud del gate, no del producto. Y ya sabemos que el flake de `PanoramaConsole` es contención de runner (3544 líneas, 59 `waitFor`, proyecto `unit` que corre en paralelo), **no** la ventana de minuto de calendario que el handoff le atribuía: arreglarlo no cambia nada de lo que se ve mañana |
| **Cablear el veredicto de la suite en CI** | Mismo argumento. Real y anotado (`test:coverage` no corre `check-suite-coverage`), pero no urgente para hoy |
| **Promover `demo/04` y `demo/05` a CI** | Se vuelve **trivial después** de las fases 1 y 2: vamos a haber recorrido los flujos y vamos a saber qué asertar. Hacerlo antes es escribir aserciones sobre datos que todavía no existen — trabajo tirado |
| **Review adversa de los 14 degradados** | Es sobre código que ya pasó el gate y que no se ve salvo que la base se degrade. Ítem de cierre si sobra tiempo |

Tres de los cuatro ítems del batch elegido más temprano se corren de lugar. No porque estuvieran mal elegidos: cambiaron de prioridad cuando se confirmó que la carga a mano era posible por UI real.

---

## Criterio de aceptación

Al cierre del día, para el camino del piloto:

1. Ninguna pantalla del recorrido de vet o funcionario aparece vacía **estando bien**, ni muestra ceros o defaults **como si fueran hallazgos** — que es el error peligroso de los dos.
2. `/turnos/buscar` devuelve turnos reservables y `/gob/reglas` muestra procedencias reales.
3. Cada fricción encontrada está anotada con severidad y `file:line`, y las ALTAS están arregladas o tienen decisión explícita del PO.
4. `pnpm verify` + `pnpm test:verified` en verde, con el veredicto real pegado como evidencia — no el código de salida de vitest, que miente en las dos direcciones.

---

## Registro de hallazgos

`docs/reviews/2026-08-09-pulido-recorrido.md`, a medida que salen.
