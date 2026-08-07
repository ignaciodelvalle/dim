# Roadmap arquitectura: de 7.5 a 10 — "honesto y performante por construcción"

> **Framing.** El sistema se hizo honesto A MANO (sesión 2026-07-19: filtros
> deshonestos, admin-scope bypasseado, "Recuperados" contando mal, período sobre
> stocks…). El 10 es que sea **imposible de romper y barato de leer**: lo que hoy
> cuidamos con disciplina, ahí lo cuida la arquitectura.
>
> Tasks: Fase 1 = #57 · Fase 2 = #58 · Fase 3 = #59 · Fase 4 = #60. Dependencia
> lineal 1→2→3→4. Va DESPUÉS de cerrar la ola de filtros actual.

## Principios fuertes que ya tenemos (los cimientos, ~7.5/10)
1. **Event sourcing → honestidad por construcción.** `pet_events` append-only; correcciones = eventos nuevos. Trazabilidad legal. Las "views" son proyecciones, nunca fuente de verdad.
2. **Una máquina de scope: `ProjectionContext`** `(actor, jurisdictions, period, {adminProvince, adminLocality}) → ctx → predicados`, compartida por ~17 dashboards + Panorama.
3. **RLS en la BASE** (no solo app) — defense in depth.
4. **k-anonimato en el choke point** (k=5, `redactSmallSubregionCells`).
5. **Mascota-es-credencial** — token único QR-verificable, federable (Mi Argentina).

## Debilidades que nos frenan del 10
- El invariante `(events, filters) → view` **no está machine-checked** → la deshonestidad era invisible hasta auditar a mano.
- El motor de scope **se bypasseó** (9 helpers hardcodeaban admin=sin-restricción). La fortaleza vale lo que su disciplina.
- **No modelamos stock vs flujo** → casi todos los bugs de estado salieron de aplicar período a un stock o trend a un snapshot.
- **Performance:** ~40-48 queries por-request por dashboard (recomputamos en vez de mantener read models — sub-aprovechamos el event sourcing).
- **Dos idiomas de proyección** (server hard-nav vs cube-cliente de Panorama) sin unificar.

---

## Fase 1 — Enforzar honestidad de proyección · #57 *(barato, alto leverage, PRIMERO)*
- **Fence de disciplina de scope:** prohibir predicados de jurisdicción crudos fuera de `lib/analytics/dashboards/_scope.ts`.
- **Contract-test de filtro-vivo** (runtime, por pantalla): "cambiar el filtro X cambia el resultado". Mata "filtro muerto".
- **Tests de paridad KPI↔lista** (el bug que mordió 2×).
- **Harness de paridad número-por-número** reusable (transversal — base de Fases 2 y 4).
- *Entregable:* las regresiones de honestidad fallan CI. Riesgo bajo (aditivo). Absorbe #22.

## Fase 2 — Métricas stock vs flujo (`MetricDescriptor`) · #58 *(el linchpin)*
`{ id, label, kind: stock|flow|rate, aplicaPeríodo, deltaable, query, filtrosQueHonra }`.
- Proyección + `OpKpi` leen el descriptor → saben si aplica período/delta. Se acaban por construcción "período sobre stock" / "trend sobre snapshot".
- **Conexión con filtros:** `OpFilterBar` deriva del descriptor qué filtros son útiles por pantalla — deja de decidirse a mano.
- Riesgo medio (toca cada KPI) → paridad obligatoria. blockedBy #57.

## Fase 3 — Catálogo métricas+filtros → pantallas declarativas · #59 *(consolida 1+2)*
Cada métrica y eje de filtro declarado UNA vez (label, kind, filtros, query, enum). Las pantallas declaran "muestro [A,B,C] con filtros [X,Y]" y el catálogo maneja queries + OpFilterBar + exports + deltas. La mitad-datos de lo que OpFilterBar empezó en UI. "Regalos olvidados" → imposibles de olvidar. Esfuerzo grande. blockedBy #58.

## Fase 4 — Read models incrementales (cubes) · #60 *(performance, endgame, ÚLTIMO)*
Fan-out por-request → proyecciones mantenidas en el append del evento (cubes everywhere, como Panorama). Es PF1 (#45) bien hecho, apoyado en el catálogo (define QUÉ materializar). Unifica los 2 idiomas → dashboards server sin reload. Riesgo ALTO (mueve números a escala) → con harness de paridad. Absorbe #45. blockedBy #59.

---

## El 10 al final
Honestidad **enforzada** (no regresa) · métricas que **saben su naturaleza** · pantallas **declarativas** · lecturas **baratas** · un solo idioma de proyección.
