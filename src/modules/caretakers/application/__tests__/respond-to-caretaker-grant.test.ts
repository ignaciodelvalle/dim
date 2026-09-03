// The two ways a PENDING invitation dies without ever becoming an arrangement:
// the invitee rejects it, or the titular withdraws it.
//
// Kept in one file because the invariant they share is the interesting part:
// neither writes a spine event and neither touches `ownerships`. A pending
// invitation is workflow state — if rejecting one emitted `caretaker_ended`,
// the append-only log would record an arrangement that never existed.

import { describe, expect, it, vi } from "vitest";

import { cancelCaretakerGrant } from "../cancel-caretaker-grant";
import { rejectCaretakerGrant } from "../reject-caretaker-grant";
import { CARETAKER_ID, PET, TITULAR_ID, makeFakeRepo, makeGrant } from "./_fake-repo";

const NOW = new Date("2026-08-22T09:00:00Z");

function deps(repo = makeFakeRepo()) {
  return { repo, now: () => NOW };
}

function repoWithPending(overrides: Record<string, unknown> = {}) {
  return makeFakeRepo({
    findGrantByToken: vi.fn().mockResolvedValue(makeGrant()),
    ...overrides,
  });
}

describe("rejectCaretakerGrant", () => {
  const input = {
    grantPublicToken: "CG-abc123",
    callerUserId: CARETAKER_ID,
    callerEmail: "ana@example.com",
    callerEmailConfirmed: true,
  };

  it("moves a pending invitation to rejected under the expectedStatus guard", async () => {
    const repo = repoWithPending();
    const result = await rejectCaretakerGrant(input, deps(repo));

    expect(result.ok).toBe(true);
    expect(repo.updateGrantStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        grantId: "grant-1",
        status: "rejected",
        expectedStatus: "pending",
        respondedAt: NOW,
      }),
    );
  });

  it("writes no spine event and no ownership row", async () => {
    const repo = repoWithPending();
    await rejectCaretakerGrant(input, deps(repo));

    expect(repo.insertAcceptGrant).not.toHaveBeenCalled();
    expect(repo.insertEndGrant).not.toHaveBeenCalled();
  });

  it("refuses when the invitation is not addressed to the caller", async () => {
    const repo = repoWithPending();
    const result = await rejectCaretakerGrant(
      { ...input, callerUserId: "otro", callerEmail: "otro@example.com" },
      deps(repo),
    );

    expect(result).toEqual({ ok: false, error: "Esta invitación no es para tu cuenta." });
    expect(repo.updateGrantStatus).not.toHaveBeenCalled();
  });

  it("refuses an illegal transition instead of writing a status the machine rejects", async () => {
    const repo = repoWithPending({
      findGrantByToken: vi.fn().mockResolvedValue(makeGrant({ status: "accepted" })),
    });

    const result = await rejectCaretakerGrant(input, deps(repo));

    expect(result.ok).toBe(false);
    expect(repo.updateGrantStatus).not.toHaveBeenCalled();
  });

  it("treats a zero-row update as somebody else winning the race", async () => {
    const repo = repoWithPending({ updateGrantStatus: vi.fn().mockResolvedValue(0) });

    const result = await rejectCaretakerGrant(input, deps(repo));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("ya no está disponible");
  });

  it("tells the titular their invitation was declined", async () => {
    const repo = repoWithPending();
    const result = await rejectCaretakerGrant(input, deps(repo));

    expect(result.ok === true && result.notifications[0]).toMatchObject({
      userId: TITULAR_ID,
      notificationType: "caretaker_invitation_rejected",
      relatedPetId: PET.id,
      category: "custody",
      dedupeKey: "caretaker:invitation_rejected:grant-1:titular-1",
    });
  });
});

describe("cancelCaretakerGrant", () => {
  const input = { grantPublicToken: "CG-abc123", titularUserId: TITULAR_ID };

  it("moves a pending invitation to cancelled", async () => {
    const repo = repoWithPending();
    const result = await cancelCaretakerGrant(input, deps(repo));

    expect(result.ok).toBe(true);
    expect(repo.updateGrantStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", expectedStatus: "pending" }),
    );
  });

  it("refuses when the caller is not the titular who issued it", async () => {
    const repo = repoWithPending();
    const result = await cancelCaretakerGrant({ ...input, titularUserId: "otro" }, deps(repo));

    expect(result.ok).toBe(false);
    expect(repo.updateGrantStatus).not.toHaveBeenCalled();
  });

  it("refuses to cancel an ACCEPTED grant — that is an END, not a cancel", async () => {
    // Cancelling would leave the ownership row open and emit no event. The
    // state machine says no, and the DB's biconditional accept CHECK would
    // reject the row anyway; failing here gives the titular the right words.
    const repo = repoWithPending({
      findGrantByToken: vi.fn().mockResolvedValue(makeGrant({ status: "accepted" })),
    });

    const result = await cancelCaretakerGrant(input, deps(repo));

    expect(result.ok).toBe(false);
    expect(repo.updateGrantStatus).not.toHaveBeenCalled();
  });

  it("notifies the invitee only when they have an account", async () => {
    const withAccount = repoWithPending({
      findGrantByToken: vi.fn().mockResolvedValue(makeGrant({ caretakerUserId: CARETAKER_ID })),
    });
    const withoutAccount = repoWithPending();

    const a = await cancelCaretakerGrant(input, deps(withAccount));
    const b = await cancelCaretakerGrant(input, deps(withoutAccount));

    expect(a.ok === true && a.notifications).toHaveLength(1);
    expect(a.ok === true && a.notifications[0].userId).toBe(CARETAKER_ID);
    expect(a.ok === true && a.notifications[0].dedupeKey).toBe(
      "caretaker:invitation_cancelled:grant-1:caretaker-1",
    );
    expect(b.ok === true && b.notifications).toHaveLength(0);
  });
});
