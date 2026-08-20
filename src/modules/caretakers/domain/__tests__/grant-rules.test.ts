// Domain rules for designating a temporary caretaker — pure, no DB, no Next.
//
// The FIRST test written for custodia-temporal's module layer (design §J):
// self-designation. Everything else in this file was added after watching that
// one go red for the right reason (validateDesignation did not exist).

import { describe, expect, it } from "vitest";

import { MAX_GRANT_DURATION_DAYS, validateDesignation } from "../grant-rules";

const NOW = new Date("2026-08-20T12:00:00Z");

function input(overrides: Partial<Parameters<typeof validateDesignation>[0]> = {}) {
  return {
    titularUserId: "u1",
    inviteeUserId: "u2" as string | null,
    inviteeEmail: "ana@example.com" as string | null,
    startsAt: new Date("2026-09-01T00:00:00Z"),
    endsAt: new Date("2026-09-30T00:00:00Z"),
    now: NOW,
    maxDurationDays: MAX_GRANT_DURATION_DAYS,
    ...overrides,
  };
}

describe("validateDesignation", () => {
  it("rejects designating yourself as your own caretaker", () => {
    const result = validateDesignation(input({ titularUserId: "u1", inviteeUserId: "u1" }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("self-designation");
  });

  it("accepts a well-formed designation", () => {
    expect(validateDesignation(input())).toEqual({ ok: true });
  });

  it("accepts an email-only invitee (the invitee may have no account yet)", () => {
    expect(validateDesignation(input({ inviteeUserId: null }))).toEqual({ ok: true });
  });

  it("rejects a designation with no invitee at all", () => {
    const result = validateDesignation(input({ inviteeUserId: null, inviteeEmail: null }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("missing-invitee");
  });

  it("rejects a blank invitee email as if it were absent", () => {
    const result = validateDesignation(input({ inviteeUserId: null, inviteeEmail: "   " }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("missing-invitee");
  });

  it("rejects endsAt equal to startsAt", () => {
    const sameInstant = new Date("2026-09-01T00:00:00Z");
    const result = validateDesignation(input({ startsAt: sameInstant, endsAt: sameInstant }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("invalid-period");
  });

  it("rejects endsAt before startsAt", () => {
    const result = validateDesignation(
      input({ startsAt: new Date("2026-09-30T00:00:00Z"), endsAt: new Date("2026-09-01") }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("invalid-period");
  });

  it("rejects a period longer than the maximum (spec: 194 days)", () => {
    // The spec's own numbers: startsAt 2026-08-19, endsAt 2027-03-01.
    const result = validateDesignation(
      input({
        startsAt: new Date("2026-08-19T00:00:00Z"),
        endsAt: new Date("2027-03-01T00:00:00Z"),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("over-max-duration");
    expect(result.ok === false && result.error).toBe(
      "El período máximo de cuidado es de 180 días.",
    );
  });

  it("accepts a period of exactly the maximum", () => {
    const startsAt = new Date("2026-09-01T00:00:00Z");
    const endsAt = new Date(startsAt.getTime() + MAX_GRANT_DURATION_DAYS * 24 * 60 * 60 * 1000);

    expect(validateDesignation(input({ startsAt, endsAt }))).toEqual({ ok: true });
  });

  it("rejects a period one millisecond over the maximum", () => {
    const startsAt = new Date("2026-09-01T00:00:00Z");
    const endsAt = new Date(startsAt.getTime() + MAX_GRANT_DURATION_DAYS * 24 * 60 * 60 * 1000 + 1);

    const result = validateDesignation(input({ startsAt, endsAt }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("over-max-duration");
  });

  it("rejects an end date already in the past", () => {
    const result = validateDesignation(
      input({
        startsAt: new Date("2026-07-01T00:00:00Z"),
        endsAt: new Date("2026-08-01T00:00:00Z"),
        now: NOW,
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("end-in-past");
  });

  it("reports the self-designation reason before any period problem", () => {
    // Ordering matters for the message the titular reads: "you cannot name
    // yourself" is actionable, "the period is invalid" sends them to fix the
    // wrong field.
    const result = validateDesignation(
      input({
        titularUserId: "u1",
        inviteeUserId: "u1",
        startsAt: new Date("2026-09-30T00:00:00Z"),
        endsAt: new Date("2026-09-01T00:00:00Z"),
      }),
    );

    expect(result.ok === false && result.reason).toBe("self-designation");
  });

  it("caps at 180 days", () => {
    // Pinned so the PO number cannot drift silently: the SQL side deliberately
    // has NO duration CHECK (design E3), so this constant is the only fence.
    expect(MAX_GRANT_DURATION_DAYS).toBe(180);
  });
});
