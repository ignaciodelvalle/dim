// The es-AR copy for the TWO rabies counters /gob/vigilancia publishes on the
// same screen, kept together (and pure) so they can be read — and tested —
// against each other instead of drifting apart in two distant JSX blocks.
//
// ---------------------------------------------------------------------------
// THE DEFECT THIS MODULE EXISTS TO PREVENT (demo review 2026-08-01, finding #5)
// ---------------------------------------------------------------------------
// The screen showed "RÁBICAS ACTIVAS 12" with a Peligro badge and, a few tiles
// away, "vs 1 observaciones rábicas abiertas". Under a CABA scope the same pair
// read 0 and 1. Two near-identical rabies labels, two different numbers, and
// nothing on the page saying they were not the same counter — with this
// audience, rabies is THE number, so a contradiction there costs the demo.
//
// They are genuinely different populations:
//
//   CASES  — `cases` rows with case_kind='rabies_observation' AND status='open'
//            (lib/analytics/dashboards/surveillance.ts, rabiesActiveCount).
//            The unit is an EXPEDIENTE.
//   PETS   — `pets.rabies_observation_status = 'in_progress'`
//            (lib/analytics/govt-home-kpis.ts, fetchOpenRabiesObservations).
//            The unit is an ANIMAL under observation right now.
//
// So the fix is not to reconcile the numbers in the UI (they answer different
// questions and the catalog defines both) — it is to make each label name the
// thing it counts, so a reader can tell at a glance that "12 expedientes" and
// "1 mascota" are not two answers to one question. That the two drift as far
// apart as 12 vs 1 on live data is a DATA issue reported separately; this
// module's job is that the screen stops presenting them as one contradicted
// figure.
//
// English identifiers, es-AR user copy (project invariant #4).

import { KPI_CATALOG } from "@/lib/metrics/kpi-catalog";
import { pluralizeEs } from "@/lib/utils/format";

/**
 * KPI-tile label for the CASE-record counter. Taken from the catalog rather
 * than hand-written on the screen: the catalog already says "Casos de
 * observación rábica abiertos" (it names the unit), while the tile had
 * hard-coded the vague "Rábicas activas" — which names neither the unit nor
 * the fact that it is a stock of open files.
 */
export const RABIES_CASES_KPI_LABEL = KPI_CATALOG.rabies_observation_cases_open.label;

/**
 * The disambiguating caveat carried by the CASE counter's info popover. Points
 * at the other two rabies figures on the same screen and says what each one is
 * for, so the operator never has to guess which number a question is about.
 */
export const RABIES_CASES_KPI_CAVEAT =
  "Cuenta EXPEDIENTES abiertos, no animales. El tile «Brecha de escalamiento» de esta misma pantalla cuenta MASCOTAS con una observación en curso hoy (otra fuente, otra población): los dos números pueden no coincidir y ninguno es el veredicto de plazo legal — ese vive en «Cumplimiento observación 10d».";

/**
 * Sub-line for the bite-escalation tile, naming the PET population so it cannot
 * be read as a second, contradictory count of the case tile above it.
 *
 * Keeps the epistemic clause the tile has always carried: an empty observation
 * queue reads as "controlado" when it may mean "sin escalar" (red-team #6).
 */
export function biteEscalationSub(openObservations: number): string {
  const noun = pluralizeEs(openObservations, "mascota");
  return `vs ${openObservations} ${noun} en observación rábica hoy — la ausencia de escalamiento no implica ausencia de riesgo`;
}
