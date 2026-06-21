# Plan: Cobertura de datos del seed vs. las métricas propuestas

> **Para Claude Code.** Análisis de si el dataset (`seed:panorama`) genera **suficientes datos para que cada
> métrica propuesta se visualice y demuestre su utilidad** — y plan para tapar los huecos. Basado en evidencia:
> lectura de `scripts/seed-panorama.ts` + del catálogo de eventos (`db/schema.ts`) + observación en vivo de los KPIs.
> **Sin schema nuevo** — todos los event-types/tablas necesarios YA existen; el seed simplemente no los emite.

## Veredicto
**No, todavía no.** El seed cubre bien la mitad de las familias de métricas (las que salen de **eventos que loguea el dueño**: vacunación, muerte, microchip, denuncias, perdidas, mordeduras-como-conteo), pero deja **estructuralmente vacías** las que dependen de **eventos derivados/operativos** — y esas son justo las que justifican el pitch de salud pública / fiscalización: **vigilancia epidemiológica, esterilización, cumplimiento PPP, adopción y enforcement (decomisos/disputas).** En vivo eso se ve como una fila de KPIs en 0 y la Vigilancia "muerta".

## Matriz de cobertura (evidencia)

| Familia de métrica | Necesita (evento/tabla) | ¿Seed lo genera? | En vivo |
|---|---|---|---|
| Cobertura antirrábica | `vaccination_administered` | ✅ sí (por provincia) | 32% ✅ funciona |
| Mortalidad + mix de disposición (B1-B2,B5-B9) | `death_recorded` + `disposition_method` | ✅ sí (owner_burial/cremation/unknown) | 122 muertes ✅ |
| **Trazabilidad de disposición (B3)** | death + **método _y_ instalación** | ⚠️ falta el campo "instalación" | **0% (degenerado)** |
| Denuncias / maltrato | `welfare_reports` | ✅ sí (9 kinds) | ✅ |
| Perdidas / reunificación (D4) | eventos lost/found | ✅ lost; ⚠️ pocos "found" | parcial |
| Mordeduras (conteo) | bite events | ✅ sí (set-piece + random) | 189 reportes ✅ |
| **Vigilancia: brotes / rábicas / señales (A6-A12)** | `outbreak_signals`, `bite_rabies_observation`, `eno_processing_queue` | ❌ **no los crea** (hace bite *events*, no los registros derivados) | **Brotes 0 · Rábicas 0 · Señales 0** 🔴 |
| **Esterilizaciones / mes + ranking de vets** | `sterilization_performed` | ❌ no (existe el tipo) | **0** |
| **Registro PPP / cumplimiento (C7)** | `dangerous_breed_attested` | ❌ no (existe el tipo) | **— (sin PPP)** |
| **Tasa de adopción** | `adoption_finalized` | ❌ no (existe el tipo) | **0%** |
| Penetración de microchip (C1) | `microchip_implanted` | ⚠️ sí pero tasa ~0 | **0% (3 de 45.688)** |
| **Disputas de custodia / Decomisos (D5)** | `cases` (dispute/decomiso kinds) | ❌ no | **0** |
| Escaneos (movimiento) | `scan_events` | ❌ diferido (v2) | vacío |

## El hueco central
`seed-panorama.ts` emite: `vaccination_administered`, `microchip_implanted`, `death_recorded`, `welfare_reports`,
y bite *events* (incl. set-pieces de rabia con flags `during_rabies_observation`/`incident_type`). **Pero no emite
ningún** `sterilization_performed`, `dangerous_breed_attested`, `adoption_finalized`, ni los registros
**derivados** que la Vigilancia lee (`outbreak_signals`, `bite_rabies_observation`, `eno_processing_queue`). Por
eso los bite events existen pero **no hay una sola señal**: falta materializar la cadena mordedura→observación→señal.

## Plan de enriquecimiento (extiende `2026-06-21-panorama-demo-dataset.md`)

> Todos los tipos/tablas ya existen — solo agregar emisión en `scripts/seed-panorama.ts`. Tasas tunables.

1. **Vigilancia (lo más importante).** Materializar la cadena para los set-pieces + un baseline ralo:
   - Insertar `bite_rabies_observation` para una fracción de los bite events (los `during_rabies_observation`), con estados mezclados (en curso / cerrada-10d / vencida) → alimenta A8/A9 compliance.
   - Insertar `outbreak_signals` (rabia/lepto/hidatidosis) para los clústers (Salta + La Plata) → Brotes/Rábicas/Señales > 0.
   - Insertar filas en `eno_processing_queue` con SLA mixto → A7 ENO-notification SLA.
   - **Decisión:** insertar los registros **directo** (más simple que correr los processors en el seed); dejar nota de que correr el use-case bite→observation sería más fiel (v2).
2. **Esterilización.** Emitir `sterilization_performed` a una tasa por provincia (p. ej. 15–40%), algunos atribuidos a orgs/vets → Esterilizaciones/mes + ranking de vets > 0.
3. **PPP / C7.** Para los pets con `potentially_dangerous_breed=true`, emitir `dangerous_breed_attested` a una tasa parcial (p. ej. 30–60%) → Registro PPP muestra cobertura < 100% (la historia de cumplimiento).
4. **Adopción.** Emitir `adoption_finalized` para una fracción de los pets en custodia de refugios → Tasa de adopción > 0 + check-ins post-adopción.
5. **Microchip.** Subir la tasa sembrada (hoy ~0%) a algo realista por provincia (p. ej. 5–20%) → penetración con spread, no plano 0%.
6. **Disposición/Trazabilidad (B3).** En `death_recorded`, además de `disposition_method`, poblar el campo de **instalación/facility** para una fracción → B3 deja de ser 0% estructural y reconcilia con B4 (desconocida).
7. **Enforcement.** Crear unos pocos `cases` de **decomiso** (Ley 14.346) y **disputa de custodia** (los set-pieces que el dataset plan ya pedía) → Decomisos/Disputas > 0 + drawer del Panorama.
8. **Reunificación (D4).** Para una fracción de las perdidas, emitir el evento de "encontrada" → tasa de reunificación realista.

## Tests / aceptación
- Tras `seed:panorama`, **ningún KPI de la fila principal de `/gob` queda en 0** por falta de datos (esterilización, PPP, microchip, adopción, zoonosis).
- `/gob/vigilancia` muestra **≥1 brote y ≥1 señal**, y el clúster de Salta aparece.
- B3 (trazabilidad) > 0 y B3 + B4 + (resto) reconcilian a ~100%.
- Ranking de cobertura **y** de esterilización varían por provincia (no plano).
- `/gob/analytics` "Tasa de adopción" y Decomisos/Disputas > 0.
- Unit: por cada familia de métrica, un fixture mínimo que prueba que la proyección devuelve > 0 con datos sembrados.

## Por qué importa para el ejecutivo
Las métricas que hoy quedan vacías son **exactamente las que demuestran el valor de campo**: detectar un brote
de zoonosis, ver el cumplimiento de esterilización/PPP por jurisdicción, rastrear un decomiso. Con la cobertura
actual, un ejecutivo ve un sistema que registra mascotas pero **no** que *vigila y hace cumplir* — que es el pitch.
Cerrar esto convierte la demo de "lindo registro" en "centro de control sanitario".

> Depende de `seed:panorama` (extiende) + del paquete metrics-IA (las proyecciones que consumen estos eventos).
> Al cerrar, marcar en `docs/superpowers/README.md`.
