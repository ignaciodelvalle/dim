// What a client may SEND to `POST /api/v1/me/appointments`.
//
// ONE COMMAND, AND THE THREE THAT ARE MISSING ARE THE POINT
// ---------------------------------------------------------------------------
// The web's booking surface has four writes. Three of them —
// `markAppointmentAttended`, `markAppointmentNoShow`, `cancelAppointmentByOrg` —
// are the PROVIDER'S, reached from `/org/{token}/agenda`, and they belong to an
// org member acting on somebody else's turno. A citizen wallet has no operator
// surface, so putting any of them here would be the phone doing something the
// owner's browser cannot.
//
// The fourth is `bookSlotAction`, and its absence is a SCOPE line rather than a
// rule: booking needs a search and a slot picker, which is a different work unit
// (see the note on `POST` in the route). When it lands it joins this union as a
// second member, which is why this is a discriminated union over `command` and
// not a bare object with a token — a schema shaped for one command has to be
// rewritten to admit a second, and rewriting a wire schema is a version bump.
//
// WHAT CANCELLING ACTUALLY MUTATES, SAID PLAINLY
// ---------------------------------------------------------------------------
// `appointments.status` → `cancelled_by_owner`, `cancelled_at`,
// `cancelled_by_user_id`, and a DECREMENT of `time_slots.bookings_count` that
// frees the place for somebody else. Nothing on the event spine: an appointment
// is not an asiento, and a turno nobody attended produced no fact about the
// animal. Invariant #2 is untouched rather than bent.
//
// It does append a NOTIFICATION to each member of the provider org, which is a
// consequence and not a fact — see the writer.
//
// NO IDEMPOTENCY KEY, AND THE ENDPOINT ASKS FOR NONE
// ---------------------------------------------------------------------------
// `cancelAppointmentByOwner` takes no `clientIdempotencyKey`. What it has instead
// is an UPDATE conditional on `status = 'confirmed'` — the TOCTOU guard that
// stops two concurrent cancels from each decrementing `bookings_count` and
// double-freeing a place. That REFUSES a replay rather than absorbing one, which
// is a different promise and must not be sold as the same: after a timeout,
// `appointment_already_resolved` may mean the first attempt landed, OR that the
// clinic cancelled it from their side in the meantime. A caller must re-read.

import { z } from "zod";

import type { AppointmentCommandAckV1 } from "../api/my-appointments.ts";

/**
 * The per-field codes a client can act on locally.
 *
 * SCREAMING_SNAKE, like every other input module here, and deliberately NOT the
 * `lowercase_snake` of `@dim/contract/api`'s error vocabulary: these are refusals
 * a client computes for ITSELF before any round trip, and the two casings are how
 * a reader tells "the server said no" from "the form did".
 */
export const APPOINTMENT_COMMAND_INPUT_CODES = [
  "COMMAND_REQUIRED",
  "APPOINTMENT_TOKEN_REQUIRED",
] as const;

export type AppointmentCommandInputCode = (typeof APPOINTMENT_COMMAND_INPUT_CODES)[number];

/**
 * One appointment token, as the endpoint receives it.
 *
 * SHAPE ONLY, NEVER EXISTENCE, and never the `APT-XXXX-XXXX` pattern either. The
 * token format is generated server-side (`generateAppointmentToken`) and pinning
 * it here would make the contract refuse a token the server legitimately minted
 * the day that generator changes — a client validating its own server's output.
 * A non-empty string is all a client can honestly check before the round trip.
 */
const appointmentToken = z
  .string({ error: "APPOINTMENT_TOKEN_REQUIRED" })
  .trim()
  .min(1, { error: "APPOINTMENT_TOKEN_REQUIRED" });

/** CANCELAR UN TURNO PROPIO. The owner's side; the provider's cancel is not here. */
const cancel = z.object({ command: z.literal("cancel"), appointmentToken });

export const appointmentCommandInputSchema = z.discriminatedUnion("command", [cancel]);

export type AppointmentCommandInput = z.infer<typeof appointmentCommandInputSchema>;
export type AppointmentCommand = AppointmentCommandInput["command"];

/**
 * A COMPILE-TIME proof that the schema's command union and the command the ack
 * type names are the same set, in both directions.
 *
 * The api entry point has to name the command on `AppointmentCommandAckV1`
 * without pulling zod in, so the vocabulary exists twice — once as a literal type
 * over there and once as a discriminated union here. This is what stops the pair
 * from drifting: a second command added to one and forgotten in the other is a
 * type error HERE, in the package, rather than an ack nothing can produce.
 *
 * It costs nothing at runtime (the assignment erases with the types) and it is
 * strictly better than a test, because it cannot be forgotten in a file nobody
 * opens while adding a command. Same instrument `notification.ts` uses.
 */
type CommandsAgree = [AppointmentCommand] extends [AppointmentCommandAckV1["command"]]
  ? [AppointmentCommandAckV1["command"]] extends [AppointmentCommand]
    ? true
    : never
  : never;
const _commandsAgree: CommandsAgree = true;
void _commandsAgree;

/**
 * The FIRST input code in a failed parse, for a client that wants to show one
 * message. Mirrors `firstTransferCommandInputCode` — same shape, same reason.
 */
export function firstAppointmentCommandInputCode(
  error: z.ZodError<unknown>,
): AppointmentCommandInputCode | null {
  for (const issue of error.issues) {
    const code = issue.message;
    if ((APPOINTMENT_COMMAND_INPUT_CODES as readonly string[]).includes(code)) {
      return code as AppointmentCommandInputCode;
    }
  }
  for (const issue of error.issues) {
    if (issue.code === "invalid_union" || issue.path.length === 0 || issue.path[0] === "command") {
      return "COMMAND_REQUIRED";
    }
  }
  return null;
}
