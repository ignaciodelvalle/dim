// Use-case: the INVITEE accepts the invitation.
//
// This is the only place in the module where the actor is not the titular, and
// it is the transaction the whole feature rests on: the `caretaker_designated`
// event and the `ownerships(role='caretaker')` row must commit together. A
// caretaker in the spine with no access is a broken promise; access with no
// event is a lie in an append-only log.
//
// The all-or-nothing property itself is proven against a real database in
// __tests__/caretaker-accept-atomicity.test.ts (the `db` vitest project) — a
// fake transaction cannot roll anything back. What this file proves is that the
// use-case puts BOTH writes inside the one transaction call and aborts the
// whole thing on failure, which is the precondition for that DB test to mean
// anything.

import { describe, expect, it, vi } from "vitest";

import { acceptCaretakerGrant } from "../accept-caretaker-grant";
import {
  CARETAKER_ID,
  PET,
  TITULAR_ID,
  fakeTransaction,
  makeFakeRepo,
  makeGrant,
} from "./_fake-repo";

const NOW = new Date("2026-08-21T10:00:00Z");

function deps(repo = makeFakeRepo()) {
  return { repo, now: () => NOW, transaction: fakeTransaction };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    grantPublicToken: "CG-abc123",
    callerUserId: CARETAKER_ID,
    callerEmail: "ana@example.com",
    publicContactConsent: false,
    ...overrides,
  };
}

function repoWithPendingGrant(overrides: Record<string, unknown> = {}) {
  const pending = makeGrant();
  return makeFakeRepo({
    findGrantByToken: vi.fn().mockResolvedValue(pending),
    findGrantByIdForUpdate: vi.fn().mockResolvedValue(pending),
    ...overrides,
  });
}

describe("acceptCaretakerGrant", () => {
  it("accepts a pending invitation addressed to the caller's email", async () => {
    const repo = repoWithPendingGrant();
    const result = await acceptCaretakerGrant(input(), deps(repo));

    expect(result.ok).toBe(true);
    expect(repo.insertAcceptGrant).toHaveBeenCalledTimes(1);
    expect(repo.insertAcceptGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        grantId: "grant-1",
        petId: PET.id,
        caretakerUserId: CARETAKER_ID,
        grantPublicToken: "CG-abc123",
        publicContactConsent: false,
        now: NOW,
      }),
      expect.anything(),
    );
  });

  it("performs the event + ownership write inside the transaction, never outside", async () => {
    const repo = repoWithPendingGrant();
    const calls: string[] = [];
    // A plain generic function, not vi.fn(): wrapping a generic in a Mock
    // erases the type parameter and the deps signature stops matching.
    const transaction = async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => {
      calls.push("tx:start");
      const out = await cb({});
      calls.push("tx:end");
      return out;
    };
    repo.insertAcceptGrant.mockImplementation(async () => {
      calls.push("insertAcceptGrant");
      return { ownershipId: "own-1" };
    });

    await acceptCaretakerGrant(input(), { repo, now: () => NOW, transaction });

    expect(calls).toEqual(["tx:start", "insertAcceptGrant", "tx:end"]);
  });

  it("returns a failure and NO notifications when the transaction throws", async () => {
    // The mid-transaction failure the spec cares about. With a real DB nothing
    // is committed; here we prove the use-case does not press on and does not
    // announce a grant that did not happen.
    const repo = repoWithPendingGrant({
      insertAcceptGrant: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const result = await acceptCaretakerGrant(input(), deps(repo));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(
      "No pudimos aceptar la invitación. Volvé a intentarlo en unos minutos.",
    );
  });

  it("re-reads the grant FOR UPDATE inside the tx and aborts if it moved", async () => {
    // The pre-tx read is stale by construction: a concurrent cancel by the
    // titular, or the 7-day expiry cron, may have resolved the row between the
    // two. Without the locked re-check both writers would proceed.
    const repo = repoWithPendingGrant({
      findGrantByIdForUpdate: vi.fn().mockResolvedValue(makeGrant({ status: "cancelled" })),
    });

    const result = await acceptCaretakerGrant(input(), deps(repo));

    expect(result.ok).toBe(false);
    expect(repo.insertAcceptGrant).not.toHaveBeenCalled();
  });

  it("refuses an invitation addressed to somebody else", async () => {
    const repo = repoWithPendingGrant();
    const result = await acceptCaretakerGrant(
      input({ callerUserId: "someone-else", callerEmail: "otro@example.com" }),
      deps(repo),
    );

    expect(result).toEqual({ ok: false, error: "Esta invitación no es para tu cuenta." });
    expect(repo.insertAcceptGrant).not.toHaveBeenCalled();
  });

  it("matches the invitee by user id even when their account email changed", async () => {
    const repo = repoWithPendingGrant({
      findGrantByToken: vi.fn().mockResolvedValue(makeGrant({ caretakerUserId: CARETAKER_ID })),
      findGrantByIdForUpdate: vi
        .fn()
        .mockResolvedValue(makeGrant({ caretakerUserId: CARETAKER_ID })),
    });

    const result = await acceptCaretakerGrant(
      input({ callerEmail: "nuevo@example.com" }),
      deps(repo),
    );

    expect(result.ok).toBe(true);
  });

  it("refuses when the titular tries to accept their own invitation", async () => {
    const repo = repoWithPendingGrant({
      findGrantByToken: vi.fn().mockResolvedValue(makeGrant({ caretakerEmail: "yo@example.com" })),
    });

    const result = await acceptCaretakerGrant(
      input({ callerUserId: TITULAR_ID, callerEmail: "yo@example.com" }),
      deps(repo),
    );

    expect(result).toEqual({ ok: false, error: "No podés aceptar tu propia invitación." });
  });

  it("refuses an invitation that is no longer pending", async () => {
    const repo = repoWithPendingGrant({
      findGrantByToken: vi.fn().mockResolvedValue(makeGrant({ status: "expired" })),
    });

    const result = await acceptCaretakerGrant(input(), deps(repo));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("ya no está disponible");
  });

  it("refuses an invitation whose period already ended", async () => {
    const repo = repoWithPendingGrant({
      findGrantByToken: vi.fn().mockResolvedValue(makeGrant({ endsAt: new Date("2026-08-01") })),
    });

    const result = await acceptCaretakerGrant(input(), deps(repo));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("período de cuidado ya terminó");
  });

  it("returns not-found for an unknown token", async () => {
    const result = await acceptCaretakerGrant(input(), deps(makeFakeRepo()));

    expect(result).toEqual({ ok: false, error: "Invitación no encontrada." });
  });

  it("notifies the titular that the arrangement started", async () => {
    const repo = repoWithPendingGrant();
    const result = await acceptCaretakerGrant(input(), deps(repo));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      userId: TITULAR_ID,
      notificationType: "caretaker_invitation_accepted",
      relatedPetId: PET.id,
      category: "custody",
    });
    expect(result.notifications[0].title).toContain("Pampa");
  });

  // -------------------------------------------------------------------------
  // KEY 2 of the two-key public-contact model (PO 2026-08-19)
  // -------------------------------------------------------------------------

  it("records the caretaker's public-contact consent when they gave it", async () => {
    const repo = repoWithPendingGrant();
    await acceptCaretakerGrant(input({ publicContactConsent: true }), deps(repo));

    expect(repo.insertAcceptGrant).toHaveBeenCalledWith(
      expect.objectContaining({ publicContactConsent: true }),
      expect.anything(),
    );
  });

  it("defaults consent to OFF — silence is never consent", async () => {
    const repo = repoWithPendingGrant();
    // No `publicContactConsent` key at all, the shape a form sends when the
    // checkbox is untouched.
    await acceptCaretakerGrant(
      { grantPublicToken: "CG-abc123", callerUserId: CARETAKER_ID, callerEmail: "ana@example.com" },
      deps(repo),
    );

    expect(repo.insertAcceptGrant).toHaveBeenCalledWith(
      expect.objectContaining({ publicContactConsent: false }),
      expect.anything(),
    );
  });

  it("captures consent in the SAME write as the status flip", async () => {
    // The CHECK constraint forbids `public_contact_consent_at` on a `pending`
    // row, so a second UPDATE after the flip would be the only alternative —
    // and it would leave a window where the grant is accepted with the consent
    // silently missing. One call, one row write.
    const repo = repoWithPendingGrant();
    await acceptCaretakerGrant(input({ publicContactConsent: true }), deps(repo));

    expect(repo.insertAcceptGrant).toHaveBeenCalledTimes(1);
    expect(repo.updateGrantStatus).not.toHaveBeenCalled();
  });
});
