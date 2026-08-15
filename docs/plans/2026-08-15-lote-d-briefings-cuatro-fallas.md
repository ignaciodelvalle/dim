# Lote D — Los briefings contra las cuatro fallas de programa

**Fecha**: 2026-08-15 · **Estado**: PLAN — pendiente de revisión del PO; se implementa al cerrar la cola actual (WP1-5 panorama → lotes A-C de gobernanza).
**Origen**: pregunta del PO — ¿las pantallas de briefing responden a plazos vencidos, reporting inexacto, incumplimiento normativo y dificultad de medir resultados? Dos revisiones read-only independientes (portales operador; org/vet/dueño) sobre `integration/all-20260703`, 2026-08-15.
**Memoria**: engram topic `governance/briefings-four-lenses-review` · task #9.

---

## La matriz (rol × falla)

| Rol | Plazos vencidos | Reporting inexacto | Incumplimiento | Medir resultados |
|---|---|---|---|---|
| **Dueño** | ✅ Cubierto | ✅ Cubierto (riguroso) | ✅ Cubierto, con ley citada | N/A (correcto) |
| **Gob** | ⚠️ Parcial | ✅ Cubierto (el más fuerte) | ⚠️ Evidencia, no veredicto | ⚠️ Flaco |
| **Org admin** | ⚠️ Parcial | ✅ Cubierto | ⚠️ Parcial | ❌ Ausente |
| **Vet** | ❌ **Ausente** | ✅ Cubierto | ⚠️ Parcial | ❌ Ausente |
| **Admin** | ⚠️ Parcial | ⚠️ Parcial (el componente líder sin contrato) | ❌ **Ausente** | ❌ Casi ausente |

**Las tres inversiones que definen el lote:**

1. **El usuario con menos poder tiene el mejor briefing.** El panel de obligaciones del dueño cita la norma ("Ord. CABA 41.831 · Ley 22.953"), distingue "Vencida" de "Por vencer" con fecha, y jamás cuenta una dosis autodeclarada como verificada. Esa es la vara; el lado operador no la alcanza.
2. **El reloj estatutario del vet es invisible** — la observación antirrábica de 10 días de SUS pacientes no tiene presencia alguna en su landing (no existe la queue key en `ORG_QUEUE_DEFS`). Y **el briefing de admin no tiene contenido de compliance** — el portal nacional, con `territorial-index` y "Política → resultado" a un click, nunca los asoma.
3. **El sistema sabe cosas que no dice** — el propio código comenta el plazo legal de 7 días del handoff de decomiso (Ley 14.346) y el badge pinta neutro igual; el worklist de gob computa aging de denuncias/casos que nunca llega al home; el ruteo de la alerta ENO SLA existe con un comment que dice "dropped, not wired".

---

## Los fixes (rankeados por palanca/esfuerzo)

### Portal admin
- **D-1 [L]** `QueueHealthCockpit` pasa por el contrato `OpKpi`/`descriptorId` (hoy usa un `QueueTile` bespoke sin descriptor, provenance ni guards — la mayor exposición de reporting inexacto de ambos portales). Archivos: `components/admin/QueueHealthCockpit.tsx`, `lib/metrics/kpi-catalog.ts` (descriptores nuevos para moderación/alertas/outbox/casos/observaciones).
- **D-2 [M]** Teaser de compliance en el home de admin: top-N provincias outlier desde `fetchPolicyOutcomes` + `territorial-index` (cierra las lentes 3 y 4 de admin en un solo movimiento). Archivos: `app/admin/page.tsx`, `lib/analytics/policy-outcome.ts`, `lib/analytics/territorial-index.ts`.
- **D-3 [S]** `EmptyState nature="measured-zero"/"no-signal"` en los tiles de cola en cero del home admin (espejo de lo que gob ya hace en su activity log).

### Portal gob
- **D-4 [M]** Aging de SLA de denuncias/casos en los tiles de "Cola operativa" del home ("N vencidas" desde el due-state model de `worklist-core.ts` que ya lo computa). Archivos: `app/gob/page.tsx`, `app/gob/acciones/_lib/worklist-io.ts`, `lib/domain/due-state.ts`.
- **D-5 [S]** `descriptorId` para los 2 tiles de cola sin catalogar ("Habilitación de organizaciones", "Casos regulatorios") — sus 3 hermanos ya lo llevan.

### Portal org / vet
- **D-6 [L]** **Queue de observaciones antirrábicas en el landing** — nueva entrada en `ORG_QUEUE_DEFS` (`lib/analytics/org-dashboard.ts`) con contador sobre `rabiesObservationStatus`/casos de mordedura. El miss más filoso de la revisión; conecta con A1 (lote A) que arregla el enforcement del mismo reloj.
- **D-7 [S]** `pendingQueueTone` marca **danger** cuando un handoff de decomiso superó el plazo legal de 7 días (el contador ya conoce el deadline; solo el tono no lo refleja). Archivo: `lib/analytics/org-dashboard.ts:118-128,639-667`.
- **D-8 [M]** `primaryJob` chequea `event.write`/Atender antes que `intake.create` — a un vet de clínica hoy le lidera "Registrar ingreso". Archivo: `app/org/[orgToken]/page.tsx:470-503`.
- **D-9 [M]** Pill de estado de matrícula del miembro en el landing (espejo del patrón `OpBreach` de verificación de org) — hoy la única mención es prosa dentro de la card de Atender.
- **D-10 [M]** Aging en postulaciones de adopción y propuestas de foster pendientes (`oldestAgeDays` en el shape de queue-counts; el comment del código documenta el caso real de 35 días invisible).

### Dueño
- **D-11 [S]** `OwnerRollupStrip` distingue vencida de por-vencer (hoy pliega ambas en un solo bucket "vencimientos próximos" ≤60 días — el landing por-mascota ya las distingue; el rollup pierde el rigor).

---

## Secuencia y entrega

- **Decisión PO 2026-08-15**: se implementa **al terminar la cola actual** (WP1-5 panorama → lotes A/B/C). Opción abierta (no decidida): adelantar D-6 y D-7 al Lote A por ser el mismo territorio de plazos legales/rábica.
- Single-writer, work-unit commits, gate completo por tanda (`pnpm verify` + `pnpm test`), review adverso fresco pre-push. `single-pr` + `size:exception` es el default del proyecto.
- Sin migraciones: todo es UI/analytics de lectura.

## Verificación

- Por fix: test de regresión donde aplique (D-7: fila con deadline vencido → tone danger; D-8: matriz de capabilities → primaryJob esperado; D-1: descriptores nuevos pasan `check-metric-contract`).
- Visual: pasada Playwright sobre los 4 landings (gob/admin/org/vet) + el rollup del dueño, antes/después.
- La prueba de fuego: re-preguntar las cuatro fallas contra las pantallas — cada rol tiene que poder responder "qué venció, qué está por vencer, qué incumplo y cómo voy" **desde su landing**, sin hunting.
