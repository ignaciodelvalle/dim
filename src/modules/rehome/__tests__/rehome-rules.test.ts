// Pure rules of the rehome-by-titular request and accept paths.
// Layer: Unit (no DB, no Next.js). Spec REQ-1, REQ-16; design ADR-1 steps 1-4.

import { describe, expect, it } from "vitest";

import {
  REHOME_ELIGIBLE_ORG_TYPES,
  validateAcceptPreconditions,
  validateDeclinePreconditions,
  validateRequestOpen,
  validateSponsorTarget,
} from "../domain/rehome-rules";

describe("validateSponsorTarget — who may be asked to sponsor", () => {
  it("accepts a verified shelter and a verified rescue network", () => {
    expect(validateSponsorTarget({ orgType: "shelter", verified: true })).toEqual({ ok: true });
    expect(validateSponsorTarget({ orgType: "rescue_network", verified: true })).toEqual({
      ok: true,
    });
    expect([...REHOME_ELIGIBLE_ORG_TYPES].sort()).toEqual(["rescue_network", "shelter"]);
  });

  it("rejects a missing org", () => {
    const r = validateSponsorTarget(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Organización no encontrada.");
  });

  it("rejects a verified org of the wrong type (a vet clinic cannot sponsor)", () => {
    const r = validateSponsorTarget({ orgType: "vet", verified: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/refugio o una red de rescate/);
  });

  it("rejects an unverified shelter", () => {
    const r = validateSponsorTarget({ orgType: "shelter", verified: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("La organización no está verificada.");
  });
});

describe("validateRequestOpen — one request per pet at a time (REQ-16)", () => {
  const clean = { petStatus: "active", hasOpenRequest: false, hasOpenSponsorship: false };

  it("allows a first request on an active pet", () => {
    expect(validateRequestOpen(clean)).toEqual({ ok: true });
  });

  it("rejects while a request is still pending", () => {
    const r = validateRequestOpen({ ...clean, hasOpenRequest: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/solicitud de nuevo hogar pendiente/);
  });

  it("rejects while an accepted sponsorship is still running", () => {
    const r = validateRequestOpen({ ...clean, hasOpenSponsorship: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya tiene una organización acompañando/);
  });

  it("rejects a deceased pet", () => {
    const r = validateRequestOpen({ ...clean, petStatus: "deceased" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fallecida/);
  });
});

describe("validateAcceptPreconditions — ADR-1 steps 1 to 4, in order", () => {
  const ORG = "org-a";
  const NOW = new Date("2026-08-21T12:00:00Z");
  const good = {
    caseKind: "rehome_request",
    caseStatus: "open",
    caseReceiverOrganizationId: ORG,
    actingOrganizationId: ORG,
    actingOrg: { orgType: "shelter", verified: true },
    titularOwnerRowLive: true,
    liveShelterCustodyCount: 0,
    pet: {
      status: "active",
      inCustodyDispute: false,
      rabiesObservationStatus: null,
      adoptionIneligibleUntil: null,
    },
    now: NOW,
  };

  it("passes the clean case", () => {
    expect(validateAcceptPreconditions(good)).toEqual({ ok: true });
  });

  // WU3 review, L-3. Step 6 of the accept calls setEligibility(true), which
  // nulls adoption_ineligible_until / _reason. A time-boxed ineligibility — a
  // quarantine, a treatment, a legal hold WITH a date — set by whichever org
  // last held the animal is a fact about the animal that outlives that org's
  // custody; the accept must not erase it while it is in force. An open-ended
  // ineligibility (no date) is NOT a blocker: the org that set it no longer
  // holds custody (step 3 asserts zero live custody), so nobody could lift
  // it, and a pet blocked forever with no lifter is the worse failure.
  it("step 4: rejects while a time-boxed ineligibility is still in force — the accept would erase it", () => {
    const r = validateAcceptPreconditions({
      ...good,
      pet: { ...good.pet, adoptionIneligibleUntil: new Date("2026-09-30T00:00:00Z") },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no apta para adopción hasta/);
  });

  it("step 4: an ineligibility whose date already passed no longer blocks", () => {
    const r = validateAcceptPreconditions({
      ...good,
      pet: { ...good.pet, adoptionIneligibleUntil: new Date("2026-08-21T11:59:59Z") },
    });
    expect(r).toEqual({ ok: true });
  });

  it("step 4: the time-box is checked after custody (step 3), not before", () => {
    const r = validateAcceptPreconditions({
      ...good,
      liveShelterCustodyCount: 1,
      pet: { ...good.pet, adoptionIneligibleUntil: new Date("2026-09-30T00:00:00Z") },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/bajo custodia de una organización/);
  });

  // The catalog (adoption-listing-read.ts) lists a pet only when the custodian
  // org is verified AND a shelter/rescue network. Accepting without asserting
  // both would grant custody, publish, notify "ya figura en la búsqueda" — and
  // the pet would never appear, with no undo until the titular withdraws.
  it("step 1b: rejects an acting org that is no longer verified — the catalog would never list the pet", () => {
    const r = validateAcceptPreconditions({
      ...good,
      actingOrg: { orgType: "shelter", verified: false },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("La organización no está verificada.");
  });

  it("step 1b: rejects an acting org of a type the catalog does not list", () => {
    const r = validateAcceptPreconditions({
      ...good,
      actingOrg: { orgType: "clinic", verified: true },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/refugio o una red de rescate/);
  });

  it("step 1b: rejects when the acting org row cannot be re-read at all", () => {
    const r = validateAcceptPreconditions({ ...good, actingOrg: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Organización no encontrada.");
  });

  it("step 1b sits between the case checks and the titular check", () => {
    // Closed case + de-verified org: step 1 wins.
    const closed = validateAcceptPreconditions({
      ...good,
      caseStatus: "closed",
      actingOrg: { orgType: "shelter", verified: false },
    });
    expect(closed.ok).toBe(false);
    if (!closed.ok) expect(closed.error).toMatch(/ya fue respondida/);
    // De-verified org + ex-owner: the org's own problem is reported first.
    const deverified = validateAcceptPreconditions({
      ...good,
      actingOrg: { orgType: "shelter", verified: false },
      titularOwnerRowLive: false,
    });
    expect(deverified.ok).toBe(false);
    if (!deverified.ok) expect(deverified.error).toMatch(/no está verificada/);
  });

  it("step 1: rejects a case that is not an open rehome_request addressed to this org", () => {
    const wrongKind = validateAcceptPreconditions({ ...good, caseKind: "adoption_listing" });
    const closed = validateAcceptPreconditions({ ...good, caseStatus: "closed" });
    const otherOrg = validateAcceptPreconditions({ ...good, caseReceiverOrganizationId: "org-b" });
    expect(wrongKind.ok).toBe(false);
    expect(closed.ok).toBe(false);
    expect(otherOrg.ok).toBe(false);
    if (!closed.ok) expect(closed.error).toMatch(/ya fue respondida/);
    if (!otherOrg.ok) expect(otherOrg.error).toMatch(/otra organización/);
  });

  it("step 2: rejects when the titular who consented no longer holds a live owner row", () => {
    const r = validateAcceptPreconditions({ ...good, titularOwnerRowLive: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya no es titular/);
  });

  it("step 3: rejects when any org already holds live custody (one org at a time)", () => {
    const r = validateAcceptPreconditions({ ...good, liveShelterCustodyCount: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/bajo custodia de una organización/);
  });

  it("step 4: rejects the catalog preconditions with a reason instead of a silent non-listing", () => {
    const lost = validateAcceptPreconditions({ ...good, pet: { ...good.pet, status: "lost" } });
    const dead = validateAcceptPreconditions({ ...good, pet: { ...good.pet, status: "deceased" } });
    const dispute = validateAcceptPreconditions({
      ...good,
      pet: { ...good.pet, inCustodyDispute: true },
    });
    const rabies = validateAcceptPreconditions({
      ...good,
      pet: { ...good.pet, rabiesObservationStatus: "in_progress" },
    });
    for (const r of [lost, dead, dispute, rabies]) expect(r.ok).toBe(false);
    if (!lost.ok) expect(lost.error).toMatch(/perdida/);
    if (!dispute.ok) expect(dispute.error).toMatch(/disputa de custodia/);
    if (!rabies.ok) expect(rabies.error).toMatch(/observación sanitaria/);
  });

  it("reports the earliest failing step, not the last", () => {
    // A closed case addressed to another org with a dead pet: step 1 wins.
    const r = validateAcceptPreconditions({
      ...good,
      caseStatus: "closed",
      caseReceiverOrganizationId: "org-b",
      pet: { ...good.pet, status: "deceased" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya fue respondida/);
  });
});

describe("validateDeclinePreconditions — only step 1 applies", () => {
  it("declining needs an open rehome_request addressed to this org and nothing about the animal", () => {
    const base = {
      caseKind: "rehome_request",
      caseStatus: "open",
      caseReceiverOrganizationId: "org-a",
      actingOrganizationId: "org-a",
    };
    expect(validateDeclinePreconditions(base)).toEqual({ ok: true });
    expect(validateDeclinePreconditions({ ...base, caseStatus: "closed" }).ok).toBe(false);
    expect(validateDeclinePreconditions({ ...base, actingOrganizationId: "org-b" }).ok).toBe(false);
  });
});
