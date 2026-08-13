# Triage del clickthrough de territorio nuevo — qué es real, por qué, y qué hacemos

Informe de origen: `2026-08-13-clickthrough-territorio-nuevo-fac92e19.md` (corrida TN0813).
Verificación: código en `fac92e19` + consultas **read-only** a la base de staging
(`ref=agnwyifsdxxoznodutgq`), 2026-08-13.

> **La regla que este triage aplica.** Un agente sin código reporta SÍNTOMAS. El
> síntoma es un dato honesto; la causa que le atribuye es conjetura, y el informe
> lo dice. Nuestro trabajo no es creerle ni descartarlo: es ir a buscar la causa.
> De 6 "rutas rotas", 1 era un bug real y más grave que el reportado, 4 eran
> guards correctos probados con la cuenta o el momento equivocado, y 1 era
> imposible. Y de los 3 hallazgos ALTO restantes, 2 resultaron ciertos con OTRA
> causa y 1 era falso. Eso no le baja el precio a la pasada — sin ella nadie
> hubiera mirado el buscador de turnos.

---

## Veredicto por hallazgo

### Real, y peor de lo reportado

| # | Reportado | Lo que hay realmente |
|---|---|---|
| B2·1 | "El buscador no encuentra un servicio aprobado en su propia localidad" | **Dos defectos apilados.** Ver RAÍZ A. |
| B2·2 | "Doble reserva silenciosa" | **La invariante no existe.** Ver RAÍZ B. Tres pares duplicados en staging, **dos generados por el seed** — no es el doble click. |
| B1·1 | "La propuesta de tránsito NO notifica" | **La notificación existe** (`foster_proposal_received`, 03:58:24). Es `severity: "info"` = último rango, y el inbox ordena por severidad. Ver RAÍZ C. |
| B4·2 | "El recordatorio sigue vivo pese a la promesa de cancelarlo" | El código **conserva a propósito** las dosis vencidas ("they record missed doses"). El defecto es que la libreta las titula **"PRÓXIMO"** con botón "Marcar dada". Ver RAÍZ D. |
| B5·1 / B4·4 | "Matching de razas PPP por string exacto" | Cierto, y es **la misma enfermedad que B2·1**. Ver RAÍZ A. |

### Cierto el síntoma, falsa la causa

| # | Reportado | Medido |
|---|---|---|
| B2·3 | "El cron de materialización no corre en staging" | **Corre todos los días y devuelve `ok`** — 41 corridas, la última 13-ago 04:15:44Z. Pero insertó **0 slots el 12-ago** (y el 4, 5 y 6), y **no corrió el 7 ni el 8**. El horizonte avanza de a un día y se atrasa. Ver RAÍZ E. |
| B7·2 | "Nadie cierra casos (584 abiertos)" | **813 cerrados**, 499 abiertos, 88 escalados. El 58% se cierra. La inferencia salió de un caso QA viejo. |

### No es bug — guard correcto, probado mal

| # | 404 reportado | Por qué |
|---|---|---|
| B3·1 | `eventos/nuevo/checkin` | `if (!adoption \|\| adopterId !== user.id) notFound()`. Es la página del **adoptante**; se probó con owner@ sobre mascota propia. **Pero su observación de fondo sigue en pie: no encontró ningún link que lleve ahí.** |
| B4·1 | `buscar-hogar` | `ownerships.role = "foster"`. Es foster-only; el dueño no debería llegar nunca. |
| B8·2 | `admin/observaciones/[token]` | Exige `rabiesObservationStatus = "in_progress"`, y **el propio agente cerró esa observación un rato antes**, en el Bloque 8. Autoinfligido. |
| B7·1 | `/cuenta/renunciar`, `/desactivar` | Role-gated: renunciar exige `role="vet" && accountType="personal"`. Se probaron con alejo@ (admin de orgs). `/cuenta/transitos` sí es un redirect de compatibilidad, y está documentado como tal. |
| B8·1 | `/gob/servicios/[t]` 404 vs `/admin/servicios/[t]` OK | **Imposible.** `app/admin/servicios/[offeringToken]/page.tsx` es `export { default } from "@/app/gob/servicios/[offeringToken]/page"`. Un archivo, dos rutas. |
| B3·7 | Formato de fecha mm/dd vs dd/mm entre formularios | Los 16 formularios usan `<input type="date">` nativo. El navegador decide, y decide igual para todos. Probable artefacto del harness. |

---

## Las causas raíz

### RAÍZ A — Comparamos texto crudo donde tenemos canonicalización escrita y sin usar

Medido en staging:

| | provincia | localidad |
|---|---|---|
| la **oferta** (lo que el buscador filtra) | CABA | **Ciudad Autónoma de Buenos Aires** ← toda CABA |
| la **organización** (lo que la pantalla muestra) | CABA | **Recoleta** |

Dos defectos, uno arriba del otro:

1. `turnos/buscar/[offeringToken]/page.tsx:119` muestra `org.jurisdictionLocality`
   mientras `turnos/buscar/page.tsx:102` filtra `serviceOfferings.jurisdictionLocality`.
   **La etiqueta miente sobre lo que es buscable.** El agente leyó "Recoleta",
   buscó "Recoleta", y el servicio estaba tageado en otro lado.
2. Ese filtro es `eq()` — igualdad exacta. `lib/domain/jurisdiction-canonical.ts`
   ya resuelve subsunción (`jurisdictionScopeContains`: una oferta de provincia
   entera cubre un barrio) y **lo usa el scope check de gobierno en el archivo de
   al lado**. El buscador no. En CABA eso no es un caso borde: el propio módulo
   documenta CABA como el caso canónico de dos niveles (INDEC tiene UNA entrada
   "Ciudad Autónoma de Buenos Aires"; los 48 barrios son un overlay).
   **Toda oferta de provincia entera es inalcanzable desde cualquier búsqueda por barrio.**

La misma enfermedad, otra cara: "Pitbull" no matchea "Pit Bull Terrier" del
catálogo PPP. Igualdad exacta sin normalizar. Un dueño que tipea una variante
queda fuera del régimen **en silencio**.

### RAÍZ B — Invariantes que viven en la cabeza y no en la base

`book-slot.ts` protege la **capacidad** con lock consultivo + `CHECK
slot_bookings_within_capacity`. No protege la **identidad**: nada impide que la
misma mascota tome dos veces el mismo turno. Con capacidad 6, dos reservas entran
sin ruido. Los datos lo confirman — y dos de los tres pares duplicados **los creó
el seed**, así que no alcanza con un guard de UI.

### RAÍZ C — La severidad no expresa urgencia, y el inbox ordena por severidad

`sortNotificationsForDisplay` (urgent → warning → success → info) es intencional,
está documentado y testeado. **No lo toquemos.** El defecto está en la
clasificación: `foster_proposal_received` —que **exige una acción y expira a los
7 días**— nace `info`, el último rango, mientras `foster_proposal_accepted_org`
—que no exige nada— nace `success` y va más arriba. La severidad está asignada
por tono, no por urgencia. Hay que revisar todos los tipos con vencimiento.

### RAÍZ D — Etiquetas que contradicen el dato que muestran

No es una familia de bugs, es una familia de textos. La libreta llama "PRÓXIMO"
(con botón "Marcar dada") a una dosis vencida que el sistema conserva a propósito
como dosis perdida. El formulario de maltrato exige "Mínimo 1 archivo" arriba y
rotula el campo "opcional". El antiparasitario muestra "Vía Oral" sin haberla
preguntado nunca. El historial dice "Información clínica · pregnancy". El portal
GOB se encabeza "ADMIN · VIGILANCIA".

### RAÍZ E — El horizonte de materialización se atrasa sin avisar

El cron corre y devuelve `ok` con `slotsInserted: 0`. Un `ok` que no produjo nada
es indistinguible de un `ok` que sí, y nadie mira. Días sin inserción: 4, 5, 6 y
12 de agosto; sin corrida: 7 y 8.

---

## Plan

Orden por daño, no por esfuerzo.

### Ola 1 — lo que hace invisible un servicio o duplica un turno

1. **A1 · Subsunción en el buscador de turnos.** Reemplazar la igualdad exacta de
   localidad por matching subsumption-aware, reusando `jurisdiction-canonical`.
   Fence: una oferta de provincia entera tiene que aparecer buscando por un barrio
   de esa provincia.
2. **A2 · La etiqueta tiene que decir la jurisdicción de la OFERTA.** Es el campo
   por el que se busca. Si además queremos mostrar la de la org, que se vea que
   son dos cosas.
3. **B1 · Índice único parcial** `(pet_id, slot_id)` sobre turnos vivos + guard en
   `book-slot`. Migración forward-only. **Antes hay que decidir qué hacemos con
   los 3 pares que ya existen** (dos son del seed).
4. **A3 · Normalizar razas antes de comparar** (case, espacios, acentos), o forzar
   selección del catálogo. Silencioso es lo peor que puede ser este bug.

### Ola 2 — lo que hace que alguien no se entere

5. **C1 · Reclasificar severidades por urgencia, no por tono.** Empezar por
   `foster_proposal_received` → `warning`. Auditar todo tipo con vencimiento.
6. **E1 · Que el cron de materialización avise cuando no materializa nada**, y
   revisar el horizonte para que un día perdido no deje una campaña sin turnos.
7. **Link del adoptante al check-in.** La página existe y es correcta; nadie llega.

### Ola 3 — textos que mienten

8. **D1** "PRÓXIMO/Marcar dada" sobre dosis vencidas → separar vencida de próxima.
9. **D2–D5** evidencia "opcional", "pregnancy", "Vía Oral" no preguntada,
   "ADMIN · VIGILANCIA" en portal GOB, "tendra"/"enviara"/"no clasificadAS".

### Sin tocar código

10. Documentar en el brief de la próxima pasada: probar cada guard **con el rol
    que la página espera**, y no visitar una ruta de estado después de haber
    cambiado ese estado uno mismo. Los cinco falsos positivos de esta corrida
    salen de ahí.

---

## Todavía sin verificar (honesto)

No los toqué y no sé si son reales:

- `/admin/outbox/[id]`: "Entregado" + "pendiente" + "0 intentos" + reintento en
  fecha pasada, todo junto.
- `/admin/cola/[publicToken]` → 404.
- Badge "Voluntarios" que contaría propuestas pendientes en vez de voluntarios.
- Timeline 15 vs "16 asientos" vs filtros que suman 12.
- `/mis-turnos` sin entrada desde ninguna navegación.
- "PRÓXIMOS CONFIRMADOS 1" con "OCUPACIÓN 0%".
- Si la propuesta de tránsito sale por email/push además de in-app.
- La vacuna que registró la clínica y queda "pendiente de confirmación del
  profesional": ¿de qué profesional?
