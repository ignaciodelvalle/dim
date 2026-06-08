// Unit tests for owner-transfer-rules.ts — pure, no DB.
// Written FIRST (RED phase, task 1.2) before creating owner-transfer-rules.ts.

import { describe, expect, it } from "vitest";

import {
  computeTransferExpiresAt,
  isValidTransferEmail,
  validateOwnerTransferReason,
  validatePetStatusForTransfer,
  validateRecipientMatch,
  validateSelfTransfer,
} from "../owner-transfer-rules";

// ---------------------------------------------------------------------------
// isValidTransferEmail
// ---------------------------------------------------------------------------

describe("isValidTransferEmail", () => {
  it("returns true for a valid email", () => {
    expect(isValidTransferEmail("user@example.com")).toBe(true);
  });

  it("returns true for emails with subdomains", () => {
    expect(isValidTransferEmail("a@b.co.ar")).toBe(true);
  });

  it("returns false for missing @", () => {
    expect(isValidTransferEmail("notanemail")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidTransferEmail("")).toBe(false);
  });

  it("returns false for only spaces", () => {
    expect(isValidTransferEmail("   ")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateOwnerTransferReason
// ---------------------------------------------------------------------------

describe("validateOwnerTransferReason", () => {
  it("accepts 'sale'", () => {
    expect(validateOwnerTransferReason("sale")).toMatchObject({ ok: true, value: "sale" });
  });

  it("accepts 'gift'", () => {
    expect(validateOwnerTransferReason("gift")).toMatchObject({ ok: true, value: "gift" });
  });

  it("accepts 'inheritance'", () => {
    expect(validateOwnerTransferReason("inheritance")).toMatchObject({
      ok: true,
      value: "inheritance",
    });
  });

  it("accepts 'other'", () => {
    expect(validateOwnerTransferReason("other")).toMatchObject({ ok: true, value: "other" });
  });

  it("rejects an invalid reason", () => {
    expect(validateOwnerTransferReason("random")).toMatchObject({
      ok: false,
      error: "Motivo inválido.",
    });
  });

  it("rejects empty string", () => {
    expect(validateOwnerTransferReason("")).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// validatePetStatusForTransfer
// ---------------------------------------------------------------------------

describe("validatePetStatusForTransfer", () => {
  it("passes for an active pet with no dispute", () => {
    expect(
      validatePetStatusForTransfer({ status: "active", inCustodyDispute: false }),
    ).toMatchObject({ ok: true });
  });

  it("fails for a deceased pet", () => {
    expect(
      validatePetStatusForTransfer({ status: "deceased", inCustodyDispute: false }),
    ).toMatchObject({ ok: false, error: "No podés transferir una mascota fallecida." });
  });

  it("fails for a lost pet", () => {
    expect(validatePetStatusForTransfer({ status: "lost", inCustodyDispute: false })).toMatchObject(
      { ok: false, error: expect.stringContaining("perdida") },
    );
  });

  it("fails when custody dispute is open", () => {
    expect(
      validatePetStatusForTransfer({ status: "active", inCustodyDispute: true }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("disputa") });
  });
});

// ---------------------------------------------------------------------------
// validateSelfTransfer
// ---------------------------------------------------------------------------

describe("validateSelfTransfer", () => {
  it("passes when caller and recipient are different users", () => {
    expect(validateSelfTransfer("user-a", "user-b")).toMatchObject({ ok: true });
  });

  it("fails when caller and recipient are the same user", () => {
    expect(validateSelfTransfer("user-a", "user-a")).toMatchObject({
      ok: false,
      error: expect.stringContaining("vos mismo"),
    });
  });
});

// ---------------------------------------------------------------------------
// validateRecipientMatch
// ---------------------------------------------------------------------------

describe("validateRecipientMatch", () => {
  it("matches when toOwnerId equals callerId", () => {
    expect(
      validateRecipientMatch({
        toOwnerId: "abc",
        toOwnerEmail: "other@example.com",
        callerId: "abc",
        callerEmail: "caller@example.com",
      }),
    ).toBe(true);
  });

  it("matches when toOwnerId is null and emails match (case-insensitive)", () => {
    expect(
      validateRecipientMatch({
        toOwnerId: null,
        toOwnerEmail: "Recipient@Example.com",
        callerId: "xyz",
        callerEmail: "recipient@example.com",
      }),
    ).toBe(true);
  });

  it("does NOT match on email when toOwnerId is set (even if email matches)", () => {
    expect(
      validateRecipientMatch({
        toOwnerId: "different-id",
        toOwnerEmail: "recipient@example.com",
        callerId: "caller-id",
        callerEmail: "recipient@example.com",
      }),
    ).toBe(false);
  });

  it("returns false when neither id nor email match", () => {
    expect(
      validateRecipientMatch({
        toOwnerId: null,
        toOwnerEmail: "other@example.com",
        callerId: "xyz",
        callerEmail: "caller@example.com",
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeTransferExpiresAt
// ---------------------------------------------------------------------------

describe("computeTransferExpiresAt", () => {
  it("returns a date exactly 7 days after the given now", () => {
    const now = new Date("2024-01-01T00:00:00.000Z");
    const expires = computeTransferExpiresAt(now);
    const diffDays = (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });

  it("works for a different base date (triangulation)", () => {
    const now = new Date("2025-06-15T12:00:00.000Z");
    const expires = computeTransferExpiresAt(now);
    expect(expires.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });
});
