// The one owner-side appointment command, and the translation of its refusals.
//
// THERE IS NO PET-ACCESS GUARD IN THIS FILE, AND ITS ABSENCE IS THE DESIGN
// ---------------------------------------------------------------------------
// `/pets/{token}/lost` and `/pets/{token}/shares` open by resolving pet access
// and refusing `kind === "none"`. Doing that here would be wrong in BOTH
// directions at once, which is unusual enough to write down:
//
//   · TOO NARROW — `bookSlotAction` accepts any active ownership role, so a
//     foster or a co-owner legitimately holds appointments. A guard demanding
//     the titular would refuse the person who made the booking.
//   · TOO WIDE — the appointment belongs to whoever BOOKED it, not to whoever
//     holds the animal. `cancelAppointmentByOwner` matches
//     `appointments.owner_user_id` against the caller and nothing else, so a
//     co-owner may not cancel a turno the other co-owner booked. A pet guard
//     would admit exactly that.
//
// The rule is the writer's, it is the row's own `owner_user_id`, and this file
// neither re-implements it nor loosens it.
//
// TRANSLATING PROSE INTO CODES
// ---------------------------------------------------------------------------
// `cancelAppointmentByOwner` answers `{ error: string }` carrying es-AR prose
// written for a web form. The prose cannot go on the wire — it is not the
// vocabulary a native client switches on — so the table below maps each sentence
// to a code from the contract's closed set.
//
// EVERY SENTENCE LIVES IN THE USE-CASE BODY, so unlike the transfers table there
// is nothing to import and ask. The literals are therefore duplicated here, and
// `__tests__/api-v1-me-appointments-route.test.ts` pins every one of them against
// the writer's source. The failure mode is stated rather than hidden: a reworded
// sentence falls through to `appointment_failed`, which is a 500 for something
// that is not a server failure. It never widens access — an unmapped refusal is
// still a refusal — and the test is what makes it loud.

import { apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import { DbBudgetExceededError, withDbBudgetOrThrow } from "@/lib/infra/db-budget";
import { cancelAppointmentByOwner } from "@/src/modules/events/application/booking/cancel-appointment-by-owner";
import { listAppointmentsForUser } from "@/src/modules/events/application/booking/list-appointments-for-user";
import type { ApiV1ErrorCode, AppointmentCommandAckV1 } from "@dim/contract/api";
import type { AppointmentCommandInput } from "@dim/contract/input";

const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

/**
 * The LIST read, budgeted — and it is the ONLY thing on this surface that is.
 *
 * The WRITE is deliberately unbudgeted, for the reason `shares/commands.ts` and
 * `transfers/commands.ts` both record: `withDbBudgetOrThrow` races a promise
 * against a timer and rejects, which does not abort a Postgres transaction.
 * Wrapping the cancel would produce a 503 for a mutation that then COMMITS — and
 * this mutation frees a place in somebody's campaign, so the client would show a
 * turno the clinic no longer holds, and the person would not show up to a slot
 * that is now open to somebody else.
 */
const READ_BUDGET_MS = 8_000;

/** The 503 this endpoint answers for every degraded read. */
export function unavailable() {
  return apiV1Error("temporarily_unavailable", 503, {
    "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
  });
}

export type AppointmentCommandContext = {
  userId: string;
  input: AppointmentCommandInput;
};

function ack(body: AppointmentCommandAckV1) {
  return apiV1Json(body, { status: 200 });
}

type Rule = { code: ApiV1ErrorCode; status: number; sentence: string };

/**
 * The refusal table, in the order it is tested.
 *
 * Order is NOT load-bearing here — no two sentences share a prefix and every
 * match is exact — but the table is kept in the writer's own order so a reader
 * comparing the two files reads them in the same sequence.
 */
const RULES: readonly Rule[] = [
  // Nothing with that token. 404. The token is a server-minted random string,
  // so answering this distinctly from "not yours" is not an oracle — it is what
  // the web says in the same two cases.
  { code: "not_found", status: 404, sentence: "Turno no encontrado." },
  // The turno exists and is somebody else's. See the header for why this is the
  // row's `owner_user_id` and not a pet guard.
  { code: "appointment_forbidden", status: 403, sentence: "Este turno no te pertenece." },
  // Somebody already answered — this caller's own retry, or the clinic. The code
  // is deliberately ambiguous between the two; naming which would report the
  // provider's action as the caller's.
  { code: "appointment_already_resolved", status: 409, sentence: "El turno ya fue procesado." },
  // The clock passed the start. A DIFFERENT client move from the one above: the
  // row did not change, and it is still worth looking at.
  {
    code: "appointment_past",
    status: 409,
    sentence: "No podés cancelar un turno que ya pasó.",
  },
];

/** Exported for the route test, which pins every literal the writer can return. */
export const APPOINTMENT_REFUSAL_RULES = RULES;

/**
 * One use-case refusal, as a response.
 *
 * The fall-through is `appointment_failed` / 500, which is the honest answer for
 * a sentence this file does not recognise: it means the mapping is out of step
 * with the writer, which IS a server defect. It is also the safe direction — an
 * unmapped refusal is still a refusal, and nothing is granted by it.
 */
export function appointmentRefusal(error: string) {
  for (const rule of RULES) {
    if (rule.sentence === error) return apiV1Error(rule.code, rule.status);
  }
  return apiV1Error("appointment_failed", 500);
}

export async function runAppointmentCommand(ctx: AppointmentCommandContext) {
  try {
    switch (ctx.input.command) {
      case "cancel": {
        const result = await cancelAppointmentByOwner(ctx.input.appointmentToken, ctx.userId);
        if ("error" in result) return appointmentRefusal(result.error);

        // `changed` is always true on this arm: the writer's UPDATE is
        // conditional on `status = 'confirmed'`, so a call that matched zero
        // rows came back as a refusal above rather than as a silent no-op.
        return ack({
          command: "cancel",
          changed: true,
          appointmentToken: ctx.input.appointmentToken,
        });
      }
    }
  } catch (err) {
    // DEFENSIVE, AND UNREACHABLE TODAY — said out loud so nobody reads it as
    // evidence that this path is bounded. The cancel runs outside any budget (see
    // `READ_BUDGET_MS`) and the one budgeted call the POST makes —
    // `requireLiveUser` — is caught in the route, before control reaches here. It
    // stays because the day a pre-read in this file IS bounded, 503 is the right
    // answer and a rethrow would turn a timeout into a 500.
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }
}

/**
 * The list read, budgeted. Exported so the route reads nothing itself.
 *
 * STATICALLY IMPORTED, deliberately. A per-call `await import()` of a module the
 * suite mocks silently drops one of two concurrent callers in vitest — a defect
 * this repo has already paid for once — and there is nothing here a lazy import
 * would buy.
 */
export async function readAppointments(args: { userId: string; now: Date }) {
  return withDbBudgetOrThrow(
    listAppointmentsForUser(args),
    READ_BUDGET_MS,
    "api-v1-me-appointments-list",
  );
}
