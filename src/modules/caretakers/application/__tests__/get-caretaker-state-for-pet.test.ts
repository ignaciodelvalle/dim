// Read model: "what is this pet's caretaker situation right now?"
//
// The owner cockpit, the caretaker's own list and the public credential all ask
// this. It is a READ, so it lives in the application layer and is imported
// DIRECTLY by the page — never routed through a `pets` use-case, because that
// import is exactly the edge that would invert the module fence (design H).

import { describe, expect, it, vi } from "vitest";

import { getCaretakerStateForPet } from "../get-caretaker-state-for-pet";
import { CARETAKER_ID, makeAcceptedGrant, makeFakeRepo, makeGrant } from "./_fake-repo";

const NOW = new Date("2026-08-25T12:00:00Z");

function deps(repo = makeFakeRepo()) {
  return { repo, now: () => NOW };
}

describe("getCaretakerStateForPet", () => {
  it("reports no arrangement when the pet has no open grant", async () => {
    const state = await getCaretakerStateForPet("pet-1", deps());

    expect(state).toEqual({ active: null, pending: null });
  });

  it("reports the active caretaker with their display name and end date", async () => {
    const repo = makeFakeRepo({
      findOpenGrantsForPet: vi.fn().mockResolvedValue([makeAcceptedGrant()]),
    });

    const state = await getCaretakerStateForPet("pet-1", deps(repo));

    expect(state.active).toMatchObject({
      grantPublicToken: "CG-abc123",
      caretakerUserId: CARETAKER_ID,
      caretakerName: "Ana Pérez",
      endsAt: new Date("2026-09-15T00:00:00Z"),
      publicContactConsentAt: null,
    });
  });

  it("reports a pending invitation separately from an active one", async () => {
    const repo = makeFakeRepo({
      findOpenGrantsForPet: vi.fn().mockResolvedValue([makeGrant({ status: "pending" })]),
    });

    const state = await getCaretakerStateForPet("pet-1", deps(repo));

    expect(state.active).toBeNull();
    expect(state.pending).toMatchObject({
      grantPublicToken: "CG-abc123",
      caretakerEmail: "ana@example.com",
    });
  });

  it("surfaces both when a pending invite coexists with an active arrangement", async () => {
    const repo = makeFakeRepo({
      findOpenGrantsForPet: vi
        .fn()
        .mockResolvedValue([makeGrant({ status: "pending" }), makeAcceptedGrant()]),
    });

    const state = await getCaretakerStateForPet("pet-1", deps(repo));

    expect(state.active).not.toBeNull();
    expect(state.pending).not.toBeNull();
  });

  it("treats an accepted grant whose period already passed as NOT active", async () => {
    // The cron closes these, but it runs once a day. Between `ends_at` and the
    // next 04:00 the row still says `accepted` — and if this read said "active"
    // the cockpit would keep promising access the RLS layer no longer grants.
    const repo = makeFakeRepo({
      findOpenGrantsForPet: vi
        .fn()
        .mockResolvedValue([makeAcceptedGrant({ endsAt: new Date("2026-08-01T00:00:00Z") })]),
    });

    const state = await getCaretakerStateForPet("pet-1", deps(repo));

    expect(state.active).toBeNull();
  });

  it("carries the caretaker's public-contact consent so the titular's toggle can gate on it", async () => {
    const consentedAt = new Date("2026-08-21T10:00:00Z");
    const repo = makeFakeRepo({
      findOpenGrantsForPet: vi
        .fn()
        .mockResolvedValue([makeAcceptedGrant({ publicContactConsentAt: consentedAt })]),
    });

    const state = await getCaretakerStateForPet("pet-1", deps(repo));

    expect(state.active?.publicContactConsentAt).toEqual(consentedAt);
  });

  it("falls back to a neutral label when the caretaker has no display name", async () => {
    const repo = makeFakeRepo({
      findOpenGrantsForPet: vi.fn().mockResolvedValue([makeAcceptedGrant()]),
      findDisplayName: vi.fn().mockResolvedValue(null),
    });

    const state = await getCaretakerStateForPet("pet-1", deps(repo));

    expect(state.active?.caretakerName).toBe("Tu cuidador/a");
  });
});
