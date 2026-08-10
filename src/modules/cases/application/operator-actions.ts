// operator-actions.ts — las dos acciones que el detalle de caso le devuelve al
// operador (#41).
//
// CONTEXTO. `components/casos/CaseDetailView.tsx` tuvo CERO controles desde que
// existe, mientras la cola de `/gob/casos` ordena por urgencia en SQL y manda al
// funcionario derecho al expediente más urgente de su jurisdicción. Abierto
// desde 2026-08-07, bloqueado por una decisión de alcance que el PO tomó el
// 2026-08-10: nota para todos, cierre manual sólo donde el ciclo de vida lo
// declara.
//
// EL ORDEN IMPORTA, Y ES AL REVÉS DEL INTUITIVO.
//
// Primero la MUTACIÓN, después el evento — y el evento sólo si la mutación ganó.
// El instinto es "asentá el evento y después cambiá el estado", y es justamente
// el que rompe: `case_events` es **append-only por trigger** en Postgres
// (`case_events_no_update`, `case_events_no_delete`). Un cierre que pierde la
// carrera con otro cierre concurrente y ya insertó su evento deja un segundo
// `case_closed` con otro motivo y otro actor, imposible de borrar o corregir,
// mientras `closed_by_user_id` guarda sólo al primero. El expediente terminaría
// contando dos cierres de un caso que se cerró una vez — en un sistema cuyo
// invariante es que el registro no miente.
//
// Por eso el cierre usa `closeCaseOwned`, que dice si ESTE llamador fue el que
// cerró, y no `closeCase`, que devuelve lo mismo al ganador y al perdedor.

import { and, eq } from "drizzle-orm";

import { caseEvents, cases, db } from "@/db";
import { availableCaseActions, canPerformCaseAction } from "../domain/available-actions";
import type { CaseKind } from "../domain/case-kinds";
import type { CaseStatus } from "../domain/lifecycles/types";
import { CasesRepository } from "../infrastructure/cases-repository";

export type OperatorActionResult = { ok: true } | { ok: false; error: string };

/** Mínimo para que una nota sea una nota y no un enter accidental. */
export const NOTE_MIN_LENGTH = 10;
export const NOTE_MAX_LENGTH = 2000;

/** Mínimo del motivo de cierre — proporcional a lo que un cierre significa. */
export const CLOSE_REASON_MIN_LENGTH = 20;
export const CLOSE_REASON_MAX_LENGTH = 500;

type CaseRow = { id: string; caseKind: CaseKind; status: CaseStatus };

async function loadCase(publicCode: string): Promise<CaseRow | null> {
  const [row] = await db
    .select({ id: cases.id, caseKind: cases.caseKind, status: cases.status })
    .from(cases)
    .where(eq(cases.publicCode, publicCode))
    .limit(1);
  return (row as CaseRow | undefined) ?? null;
}

/**
 * Asienta una nota de operador en el expediente.
 *
 * No toca el estado, así que es legítima para los doce kinds — y es la única
 * acción que sirve al 100% de la cola real (`custody_episode` 215,
 * `lost_pet_episode` 41, `adoption_listing` 1, medido 2026-08-10).
 */
export async function addOperatorNote(input: {
  publicCode: string;
  actorUserId: string;
  text: string;
}): Promise<OperatorActionResult> {
  const text = input.text.trim();
  if (text.length < NOTE_MIN_LENGTH) {
    return {
      ok: false,
      error: `La nota tiene que decir algo: al menos ${NOTE_MIN_LENGTH} caracteres.`,
    };
  }
  if (text.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `La nota no puede pasar los ${NOTE_MAX_LENGTH} caracteres.` };
  }

  const row = await loadCase(input.publicCode);
  if (!row) return { ok: false, error: "Expediente no encontrado." };

  // El permiso sale del dominio, no de un if acá. Si el ciclo de vida cambia,
  // la respuesta cambia sola.
  if (!canPerformCaseAction(row.caseKind, row.status, "note")) {
    return { ok: false, error: "Este expediente ya no admite notas." };
  }

  await db.insert(caseEvents).values({
    caseId: row.id,
    entryType: "operator_note",
    notes: text,
    recordedByUserId: input.actorUserId,
    payload: {},
  });

  return { ok: true };
}

/**
 * Cierra un expediente a mano.
 *
 * Sólo donde el ciclo de vida declara `manualCloseAllowed`. Hoy es un solo kind
 * (`custody_episode`, por autoridad DC del spec de decomiso) — y ese uno se
 * verifica leyendo la declaración, no una lista escrita acá.
 */
export async function closeCaseManually(input: {
  publicCode: string;
  actorUserId: string;
  reason: string;
}): Promise<OperatorActionResult> {
  const reason = input.reason.trim();
  if (reason.length < CLOSE_REASON_MIN_LENGTH) {
    return {
      ok: false,
      error: `Cerrar un expediente necesita un motivo de al menos ${CLOSE_REASON_MIN_LENGTH} caracteres — queda en el registro.`,
    };
  }
  if (reason.length > CLOSE_REASON_MAX_LENGTH) {
    return {
      ok: false,
      error: `El motivo no puede pasar los ${CLOSE_REASON_MAX_LENGTH} caracteres.`,
    };
  }

  const row = await loadCase(input.publicCode);
  if (!row) return { ok: false, error: "Expediente no encontrado." };

  // El motivo del dominio, no uno genérico. `canPerformCaseAction` devuelve
  // false por DOS razones muy distintas —"este kind no admite cierre manual" y
  // "ya está cerrado"— y confundirlas es un defecto real: el perdedor de una
  // carrera de cierre leería "no se puede cerrar a mano" y concluiría que el
  // producto no soporta la acción, cuando en verdad acaba de perderla por un
  // segundo. Es exactamente el error que este módulo existe para no cometer.
  const close = availableCaseActions(row.caseKind, row.status).find((a) => a.action === "close");
  if (!close?.available) {
    return { ok: false, error: close?.unavailableReason ?? "Este expediente no se puede cerrar." };
  }

  const repo = new CasesRepository();

  return db.transaction(async (tx) => {
    // 1. MUTACIÓN primero. `closeCaseOwned` dice si ganamos la carrera.
    //
    // `cases.closed_reason` es una CATEGORÍA de tres valores, no texto libre —
    // así lo declara CloseCaseInput. Un cierre manual de operador es
    // `cancelled`: la autoridad da por terminado el expediente, que es distinto
    // de `resolved` (el hecho que lo cerraba ocurrió) y de `auto_expired` (lo
    // cerró un cron). La prosa del operador va al evento, donde se lee.
    const outcome = await repo.closeCaseOwned(
      { caseId: row.id, reason: "cancelled", closedByUserId: input.actorUserId },
      tx,
    );

    // 2. Si perdimos, NO escribimos el evento. Ese es el punto entero de este
    //    orden: el `case_closed` del perdedor sería permanente.
    if (!outcome.won) {
      return {
        ok: false as const,
        error:
          "Alguien más cerró este expediente mientras lo estabas cerrando. Recargá para ver quién y con qué motivo.",
      };
    }

    // 3. Recién ahora el evento, dentro de la misma transacción.
    await tx.insert(caseEvents).values({
      caseId: row.id,
      entryType: "case_closed",
      notes: reason,
      recordedByUserId: input.actorUserId,
      payload: { closed_manually: true },
    });

    return { ok: true as const };
  });
}

/** Sólo para tests: confirma que el caso quedó cerrado una vez y no dos. */
export async function countCloseEvents(caseId: string): Promise<number> {
  const rows = await db
    .select({ id: caseEvents.id })
    .from(caseEvents)
    .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.entryType, "case_closed")));
  return rows.length;
}
