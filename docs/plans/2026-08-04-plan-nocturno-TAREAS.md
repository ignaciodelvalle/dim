# Plan nocturno — LISTA DE TAREAS (para validar antes de ejecutar)

> Complemento de `2026-08-04-plan-nocturno.md` (que tiene el diagnóstico y la
> evidencia). Esto es la **secuencia ejecutable**. Las decisiones del PO del
> 04/08 ya están incorporadas — no se re-preguntan.

## Regla de oro de esta corrida (decisión del PO)

**Cada tarea se termina al 100% antes de empezar la siguiente.** "Terminada"
significa: implementada + `pnpm verify` + `pnpm test` verdes + evidencia pegada
+ commiteada. Una tarea a medias se revierte, no se deja abierta. Si algo se
traba, se salta a la siguiente y se anota por qué — nunca se avanza dejando dos
cosas a medio hacer.

**Honestidad de alcance**: son 59 tareas. NO entran en una noche. El orden está
pensado para que lo que se complete quede completo, y para que cortar en
cualquier punto deje el repo en un estado mejor y coherente.

---

## FASE 0 — Limpieza de registros (primero: hace legible todo lo demás)

| # | Tarea | Terminada cuando |
|---|---|---|
| T1 | Migrar A1 (chapa física) y A5 (dual-routing del found-form) desde la cola vieja a `PENDIENTES.md` **con su evidencia**, y recién entonces archivar `2026-06-24-CONSOLIDATED-pending-backlog.md` con nota de destino | Existe UNA cola; la vieja está en `archive/` con encabezado que dice a dónde fue cada fila |
| T2 | Cerrar las 13 PRs absorbidas, cada una comentando en qué rama quedó | `gh pr list` muestra sólo #760 y #762 |
| T3 | Cerrar en `PENDIENTES.md` el bloque e2e completo con la evidencia del run `30873868074`, y mover a "decidido" las decisiones del 04/08 | Ninguna fila de e2e figura abierta |
| T4 | Corregir las 8 descripciones vencidas (son 10 políticas sin `TO`, no 8; el fence N3 tiene 4 globs y ~12 `redirect()`; quedan 2 copias de `stripComments`; 59 `waitFor`; ~25 sitios de nav; 3 self-skips de axe; RA-7 F8 mal caracterizado; **RA-2 F4 cuyas citas apuntan al arreglo, no al defecto**) | Cada ítem cita el archivo:línea correcto, verificado hoy |
| T5 | RA-4 F6: reescribir con evidencia o cerrar por inverificable | Decidido y registrado |
| T6 | Archivar los ~12 planes shippeados; **corregir antes** los encabezados invertidos de `lib-bucketize-plan` y `strangler-finish-plan` ("PLANNED — not started" sobre trabajo hecho) | `plans/` sólo contiene planes vivos |
| T7 | Marcar las 3 entradas de `spec-later-tracker` como "esperando a terceros" (PPP CABA, perro guía, documentos de viaje) | Nadie las puede confundir con tarea propia |
| T8 | Borrar las 66 ramas remotas ya mergeadas a HEAD y los 46 worktrees de agentes en `.claude/worktrees/` | `git branch -r` vuelve a ser señal |
| T9 | Clasificar los 37 TODO/FIXME: los reales entran a la cola, los muertos se borran | Cero TODO sin dueño |
| T10 | Barrido de **afirmaciones sin cita** sobre garantías de DB/seguridad/privacidad en AGENTS/README/CLAUDE, y verificar cada una | Toda garantía apunta a su enforcement o se reescribe como intención |

## FASE 1 — Lo que le miente al usuario

| # | Tarea | Terminada cuando |
|---|---|---|
| T11 | **Contacto/voluntariado de refugios**: notificación in-app a los admins de la org al recibir un mensaje | Un mensaje nuevo genera notificación, verificado con test |
| T12 | Bandeja mínima en el portal de la org que lista `org_contact_messages` (incluye los ya acumulados) | La org lee todos los mensajes históricos |
| T13 | Revisar la copy de ambas sheets para que describa lo que ahora sí pasa | Copy y comportamiento coinciden |
| T14 | **Outbox**: píldora `v1 — no se envía` por fila + corregir la copy del reintento ("próxima corrida diaria") + aviso en la cabecera de la consola | Ningún texto promete entrega ni 5 minutos |
| T15 | **Ventana antirrábica**: `report-bite.ts` y `report-bite-from-org.ts` resuelven `rabies_observation_window` por la jurisdicción de la mascota | Una regla de 14 días produce vencimiento a 14 días, con test |
| T16 | Que el barrido de auto-cierre use la misma resolución (hoy cae al default) | Cierre y vencimiento usan la misma fuente |
| T17 | **Waitlist de chapita**: lista legible de interesados para ops, o marcar honestamente que nadie la lee | La promesa "te avisamos" es verdad, o no se hace |
| T18 | **`share_telemetry`**: VALIDAR si el lector tiene sentido (producto). Si no lo tiene → dejar de recolectar + plan de borrado de lo acumulado | Decisión registrada con su porqué |

## FASE 2 — Cablear lo construido (alto valor por hora)

| # | Tarea | Terminada cuando |
|---|---|---|
| T19 | Enlazar `/cuenta/desactivar` desde la cuenta de gobierno | Una cuenta govt puede darse de baja desde la UI |
| T20 | Enlazar el reemplazo de microchip admin desde la ficha de observación | Igual que su gemelo del lado org |
| T21 | `/cuenta/renunciar` → redirect al sheet que funciona | Un solo camino al mismo formulario |
| T22 | **Diagnóstico del vet**: entrada en Atender para `recordDiseaseDiagnosisAction` | Un vet con matrícula registra un diagnóstico end-to-end |
| T23 | Botón de cancelar propuesta de devolución al dueño | El proponente puede retirarla |
| T24 | Editar regla de agenda (la acción existe, falta el afordance) | CRUD completo de verdad |
| T25 | **Nudges**: agregar `lost` como estado en el ranking de urgencia existente | Una mascota perdida figura como pendiente en el agregado |
| T26 | Canal saliente: que `NEXT_PUBLIC_PUSH_ENABLED` deje de exigir deploy | Un admin puede habilitar push |

## FASE 3 — Viaje (3 corredores)

| # | Tarea | Terminada cuando |
|---|---|---|
| T27 | Formulario en `/viaje`: selector de corredor (Uruguay / UE-España / USA) + fecha, emitiendo `transport_recorded` vía el writer existente | Se registra un viaje y queda el evento |
| T28 | Chile y Brasil visibles como "datos regulatorios en verificación" — nunca como "sin requisitos" | Ningún viajero puede leer ausencia como permiso |
| T29 | Recablear `TravelSemaforo` + `TravelObligationsPanel` + `TravelExportButton` | El semáforo y el export funcionan sobre un evento real |
| T30 | Sacar el `disabled` de la fila "Viaje y movilidad" en "Más" | La entrada deja de decir "Próximamente" |
| T31 | Redactar el disclaimer legal es-AR (yo redacto → **Ignacio revisa antes de publicar**) | Texto aprobado por el PO |
| T32 | ADR: los requisitos de corredor viven en código **o** en `travel_corridor_requirements` — elegir uno y ejecutar | Deja de existir capacidad reservada sin dueño |

## FASE 4 — Configuración por jurisdicción

| # | Tarea | Terminada cuando |
|---|---|---|
| T33 | Promover `welfare_sla_tiers` (crítico/alto/medio/bajo) a tipo de regla | Un municipio declara sus tiempos sin deploy |
| T34 | Anclar la escalada de casos rancios de maltrato (90d) al mismo tipo | Un solo lugar define el SLA |
| T35 | Promover `stale_case_windows` (perdidas 365/60, disputas 365, decomiso 7) | Los casos de uso ya aceptan el parámetro: sólo cambia el origen del default |
| T36 | `reminder_windows`: o rechaza overrides por provincia/localidad en el form, o el barrido los resuelve | Deja de aceptar configuración que ignora |
| T37 | `long_stay_days`: la etiqueta interpola el valor resuelto, no la constante | Con override de 90 el chip dice 90 |

## FASE 5 — Hub de control

| # | Tarea | Terminada cuando |
|---|---|---|
| T38 | Acción admin auditada para re-correr un job en proceso (patrón ya probado por el despachador) | Un admin re-dispara un cron sin tocar Vercel |
| T39 | Modo mantenimiento accionable por admin (fuera de la variable de entorno) | Apagar la plataforma no exige deploy |
| T40 | Sumar a Sistema: salud de base, estado de rate limits, cola de notificaciones muertas | Un ticket de "no me llegan notificaciones" es diagnosticable |

## FASE 6 — Los gates que mienten

| # | Tarea | Terminada cuando |
|---|---|---|
| T41 | Glob de los 3 linters de authz: incluir los 10 `"use server"` invisibles (incl. 8 escrituras médicas en atender) | Ningún archivo de acción queda fuera |
| T42 | `check-authz-scoping`: stripear comentarios antes de buscar el marcador | La palabra en un comentario deja de contar como prueba |
| T43 | `check-rls-coverage`: inspeccionar contenido (roles, `TO`, `USING`), no sólo existencia | Una política vacía deja de pasar |
| T44 | Las 10 políticas sin cláusula `TO` (en 8 tablas) | Ninguna cae a `PUBLIC` por omisión |
| T45 | `lint:nav`: cubrir `push`/`replace` como dice su docblock (~25 sitios) | Fence y doctrina coinciden |
| T46 | Fence N3: incluir los módulos de caso de uso (~12 `redirect()` en 10 archivos) | Deja de reportar cero falsamente |
| T47 | Unificar las 2 copias restantes de `stripComments` | Una sola implementación |
| T48 | RA-4 F8 y F9: los dos tests que **nunca ejecutan una aserción** | Ambos asertan de verdad, o se borran |
| T49 | `PanoramaConsole`: presupuesto explícito para los 59 `waitFor` | Sin esperas sin techo |
| T50 | RA-9: los 3 self-skips de axe (incluye el momento héroe, Ley 26.653) + `qa-panorama-a11y` sin invocador | O corren, o se declara la no-cobertura |
| T51 | `cube-parity`: la mitad nacional que saltea toda celda suprimida | Deja de ser vacua |

## FASE 7 — Issues reales (7 de 10)

| # | Tarea |
|---|---|
| T52 | Cerrar #758 (ya arreglado) y re-scopear #141 (ops) y #756 (sólo la feature) |
| T53 | #754 drop de `pet_achievement_views` — migración destructiva con review propio |
| T54 | #753 endurecer provenance de `dangerous_breed_attested` |
| T55 | #755 badges del hero a 320px |
| T56 | #751 helpers compartidos de pet-list/reminders |
| T57 | #757 guiar al vet al canal profesional |
| T58 | #759 writer de eventos de vigilancia (parcialmente cubierto por T22) |
| T59 | #752 rediseño de credencial pública + cartel |

## FASE 8 — P3 / P4 (deuda declarada)

Denominadores anidados en datos abiertos, leyendas que describen estados
ausentes, edad de denuncia no vencida en el triage; 21 pesos tipográficos
inertes, 19 tamaños bajo el piso del ratchet, libreta que clipea a 390px,
`role="img"` tragando subárboles, `?chip=a&chip=b` → 500.

## FASE R — Reviews finales (read-only, en paralelo, al final)

R1 arranque en frío · R2 afirmaciones sin cita · R3 superficie de riesgo ·
R4 ruido del repo · R5 qué garantizan los gates · R6 nombres e idioma ·
R7 navegabilidad de docs · R8 trazabilidad · R9 adversarial (billed, con OK).

## Reglas no negociables

- Verde de CI protegido: `verify` + `test` + e2e por tarea.
- Escritores en paralelo sólo en worktrees con territorio disjunto.
- Todo hijo en background se pollea dentro del mismo turno.
- Migraciones forward-only e inmutables; aplicarlas a una DB remota es decisión
  de Ignacio.
- Para e2e, la DB de dev miente: el juez es CI.
