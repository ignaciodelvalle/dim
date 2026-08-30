// `appointmentCommandInputSchema` — what a client may send to
// `POST /me/appointments`.
//
// THE POINT OF TESTING A SCHEMA THE SERVER ALSO ENFORCES: this is the copy the
// CLIENT runs, before the network, to put a message under the right field. A rule
// only the server knows is a rule the app can only discover from a 400 with no
// field detail.
//
// The case a reviewer should read first is `refuses the three provider commands`.
// It is the scope of this whole slice expressed as an assertion: the booking
// feature has four writes, three of them belong to the clinic's own agenda
// screen, and shipping any of them on a citizen's phone would be a wallet acting
// on somebody else's turno.

import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_COMMAND_INPUT_CODES,
  appointmentCommandInputSchema,
  firstAppointmentCommandInputCode,
} from "../appointment.ts";

/** The first input code for a body, or `null` when the body parses. */
function codeFor(body: unknown): string | null {
  const parsed = appointmentCommandInputSchema.safeParse(body);
  return parsed.success ? null : firstAppointmentCommandInputCode(parsed.error);
}

const TOKEN = "APT-7K2M-9QX4";

describe("appointmentCommandInputSchema — the command discriminator", () => {
  it("accepts the one command the owner's browser offers", () => {
    expect(codeFor({ command: "cancel", appointmentToken: TOKEN })).toBe(null);
  });

  it("names a missing command rather than falling through to null", () => {
    // A `null` here would mean the parse failed on something the vocabulary does
    // not cover, and the app's copy for that says "hay un campo que no pudimos
    // interpretar" — useless for a body with no command at all.
    expect(codeFor({})).toBe("COMMAND_REQUIRED");
    expect(codeFor({ appointmentToken: TOKEN })).toBe("COMMAND_REQUIRED");
    expect(codeFor(null)).toBe("COMMAND_REQUIRED");
  });

  it("refuses the three provider commands — none is reachable from an owner's browser", () => {
    // `markAppointmentAttended`, `markAppointmentNoShow` and
    // `cancelAppointmentByOrg` all live behind `/org/{token}/agenda` and are
    // guarded against org membership. Accepting any of them here would give a
    // citizen wallet a power no owner's browser has, over a turno that is only
    // half theirs.
    expect(codeFor({ command: "attend", appointmentToken: TOKEN })).toBe("COMMAND_REQUIRED");
    expect(codeFor({ command: "no_show", appointmentToken: TOKEN })).toBe("COMMAND_REQUIRED");
    expect(codeFor({ command: "cancel_by_org", appointmentToken: TOKEN })).toBe("COMMAND_REQUIRED");
  });

  it("refuses `book` too, and that one is scope rather than a rule", () => {
    // Booking IS an owner capability on the web. It is not in this union because
    // it needs a slot id the search screen produces, and that screen is a
    // different work unit. The assertion exists so that adding it later is a
    // deliberate edit here rather than something that quietly starts parsing.
    expect(codeFor({ command: "book", slotId: "…", petPublicToken: "…" })).toBe("COMMAND_REQUIRED");
  });
});

describe("appointmentCommandInputSchema — the token", () => {
  it("refuses an absent, empty or whitespace-only token", () => {
    expect(codeFor({ command: "cancel" })).toBe("APPOINTMENT_TOKEN_REQUIRED");
    expect(codeFor({ command: "cancel", appointmentToken: "" })).toBe("APPOINTMENT_TOKEN_REQUIRED");
    expect(codeFor({ command: "cancel", appointmentToken: "   " })).toBe(
      "APPOINTMENT_TOKEN_REQUIRED",
    );
    expect(codeFor({ command: "cancel", appointmentToken: 42 })).toBe("APPOINTMENT_TOKEN_REQUIRED");
  });

  it("trims, so a token pasted with a trailing space still reaches the server clean", () => {
    const parsed = appointmentCommandInputSchema.safeParse({
      command: "cancel",
      appointmentToken: `  ${TOKEN}\n`,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.appointmentToken).toBe(TOKEN);
  });

  it("checks SHAPE and never format — a server-minted token is not the client's to validate", () => {
    // Pinning `APT-XXXX-XXXX` here would make the contract refuse a token the
    // server legitimately minted the day `generateAppointmentToken` changes. The
    // only honest pre-flight check is "non-empty".
    expect(codeFor({ command: "cancel", appointmentToken: "not-a-token-shape" })).toBe(null);
  });
});

describe("firstAppointmentCommandInputCode", () => {
  it("returns null when the body parses", () => {
    const parsed = appointmentCommandInputSchema.safeParse({
      command: "cancel",
      appointmentToken: TOKEN,
    });
    expect(parsed.success).toBe(true);
  });

  it("only ever returns a code the vocabulary declares", () => {
    // The app's copy switch is exhaustive over this array with no `default`, so a
    // code outside it renders as a blank line under a "no se pudo" heading.
    for (const body of [{}, { command: "cancel" }, { command: "attend" }]) {
      const code = codeFor(body);
      expect(code === null || APPOINTMENT_COMMAND_INPUT_CODES.includes(code as never)).toBe(true);
    }
  });
});
