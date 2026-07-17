// WAVE D1 (Invariant #3) — the PUBLIC credential must show CORRECTED clinical
// values. These pure tests prove that folding an `event_amended` row through the
// badge helpers changes what a QR scanner sees: the vaccine count, the active
// medications, and the rabies-at-risk banner all move with the correction.

import { describe, expect, it } from "vitest";

import { computeVaccinationSummary, hasAnyVaccineRecord } from "@/lib/domain/libreta-health-status";
import { overlayAmendments } from "@/lib/infra/amendment";
import {
  type CredentialEvent,
  deriveActiveMedications,
  deriveRabiesSemaphore,
  isRabiesAtRisk,
} from "./credential-badges";

const vaccination = (
  id: string,
  name: string,
  at: string,
  nextDueAt?: string,
): CredentialEvent => ({
  id,
  eventType: "vaccination_administered",
  occurredAt: at,
  payload: { vaccine_name: name, ...(nextDueAt ? { next_due_at: nextDueAt } : {}) },
});

const amend = (
  id: string,
  targetId: string,
  at: string,
  changes: Array<{ field: string; old: unknown; new: unknown }>,
): CredentialEvent => ({
  id,
  eventType: "event_amended",
  occurredAt: at,
  payload: { target_event_id: targetId, changes, reason: null },
});

// The Tier 2 vaccine summary derives from computeVaccinationSummary — the SAME
// function the owner libreta uses (bug 3, staging validation 2026-07-04). These
// tests pin the two contracts the share view relies on: corrections still
// supersede (Invariant #3), and a zero-record pet reads as "no records", never
// a fabricated count.
describe("tier2 vaccine summary — shared derivation on the public credential", () => {
  const NOW = new Date("2026-03-15T00:00:00Z");

  it("a correction to a vaccine name flows into the shared summary (Invariant #3)", () => {
    // A mistyped off-catalog name corrected to the catalog "Antirrábica"
    // becomes a classified core dose instead of an off-catalog extra.
    const events = [
      vaccination("v1", "Antirabica typo", "2026-02-01", "2027-02-01"),
      amend("a1", "v1", "2026-03-01", [
        { field: "vaccine_name", old: "Antirabica typo", new: "Antirrábica" },
      ]),
    ];
    const summary = computeVaccinationSummary(overlayAmendments(events), "dog", NOW);
    expect(summary.otherCount).toBe(0);
    const rabies = summary.perVaccine.find((v) => v.vaccineName === "Antirrábica");
    expect(rabies?.status).not.toBe("missing");
  });

  it("zero registered doses → hasAnyVaccineRecord false, and nothing counts as due/expired", () => {
    const summary = computeVaccinationSummary([], "dog", NOW);
    expect(hasAnyVaccineRecord(summary)).toBe(false);
    expect(summary.active).toBe(0);
    expect(summary.dueSoon).toBe(0);
    expect(summary.expired).toBe(0);
    // Catalog cores show as missing — visible, but NEVER folded into a count.
    expect(summary.missing).toBeGreaterThan(0);
  });

  it("owner and share agree by construction: same inputs → same summary object", () => {
    const events = [
      vaccination("v1", "Antirrábica", "2026-02-01"),
      vaccination("v2", "Quíntuple", "2026-01-01"),
    ];
    const owner = computeVaccinationSummary(overlayAmendments(events), "dog", NOW);
    const share = computeVaccinationSummary(overlayAmendments(events), "dog", NOW);
    expect(share).toEqual(owner);
  });
});

describe("deriveActiveMedications — corrected drug name is what the scanner sees", () => {
  it("surfaces the CORRECTED drug name, never the mistyped original", () => {
    const events: CredentialEvent[] = [
      {
        id: "m1",
        eventType: "medication_started",
        occurredAt: "2026-01-01",
        payload: { drug_name: "Meloxican typo" },
      },
      amend("a1", "m1", "2026-02-01", [
        { field: "drug_name", old: "Meloxican typo", new: "Meloxicam" },
      ]),
    ];
    expect(deriveActiveMedications(events)).toEqual(["Meloxicam"]);
  });

  it("a stopped medication is excluded", () => {
    const events: CredentialEvent[] = [
      {
        id: "m1",
        eventType: "medication_started",
        occurredAt: "2026-01-01",
        payload: { drug_name: "Meloxicam" },
      },
      {
        id: "m2",
        eventType: "medication_stopped",
        occurredAt: "2026-02-01",
        payload: { medication_started_event_id: "m1" },
      },
    ];
    expect(deriveActiveMedications(events)).toEqual([]);
  });
});

describe("isRabiesAtRisk — a corrected expiry flips the service-dog warning", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  // NOTE: the public heuristic matches vaccine names literally containing
  // "rabia" (lowercased). It is accent-sensitive and misses the canonical
  // "Antirrábica" — a PRE-EXISTING weakness of this banner (same class the KPI
  // path fixed with an accent-aware regex; see lib/metrics/rabies.ts). Out of
  // WAVE D1 scope; these tests exercise the correction-overlay, not the regex.
  it("expired rabies dose is at risk", () => {
    const events = [vaccination("v1", "Vacuna Rabia", "2025-01-01", "2026-01-01")];
    expect(isRabiesAtRisk(events, now)).toBe(true);
  });

  it("a correction extending next_due_at into the future clears the risk", () => {
    const events = [
      vaccination("v1", "Vacuna Rabia", "2025-01-01", "2026-01-01"),
      amend("a1", "v1", "2026-05-01", [
        { field: "next_due_at", old: "2026-01-01", new: "2027-01-01" },
      ]),
    ];
    // Without the overlay the credential would still warn "vencida"; with it,
    // the corrected future due date clears the banner.
    expect(isRabiesAtRisk(events, now)).toBe(false);
  });

  it("a correction naming the dose 'Rabia' brings it into the rabies check", () => {
    // Originally recorded as a non-rabies name (not flagged) then corrected to
    // an expired rabies dose → now at risk.
    const events = [
      vaccination("v1", "Sextuple typo", "2025-01-01", "2026-01-01"),
      amend("a1", "v1", "2026-05-01", [
        { field: "vaccine_name", old: "Sextuple typo", new: "Vacuna Rabia" },
      ]),
    ];
    expect(isRabiesAtRisk(events, now)).toBe(true);
  });

  it("no vaccinations → not at risk", () => {
    expect(isRabiesAtRisk([], now)).toBe(false);
  });
});

// pet-state-header R4 — the public rabies semaphore. UNLIKE isRabiesAtRisk
// (which keeps its conservative latest-ANY-vaccine service-dog semantics),
// the semaphore filters to RABIES doses FIRST (accent/case-insensitive match)
// and then takes the latest — a later non-rabies vaccine must never mask an
// expired rabies dose.
describe("deriveRabiesSemaphore — tri-state antirrábica vigencia (R4)", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("latest rabies dose with a future next_due_at → vigente", () => {
    const events = [vaccination("v1", "Antirrábica", "2026-01-01", "2027-01-01")];
    expect(deriveRabiesSemaphore(events, now)).toBe("vigente");
  });

  it("latest rabies dose with a past next_due_at → vencida", () => {
    const events = [vaccination("v1", "Antirrábica", "2025-01-01", "2026-01-01")];
    expect(deriveRabiesSemaphore(events, now)).toBe("vencida");
  });

  it("no rabies dose at all → none (even with other vaccines present)", () => {
    expect(deriveRabiesSemaphore([], now)).toBe("none");
    const events = [vaccination("v1", "Quíntuple", "2026-01-01", "2027-01-01")];
    expect(deriveRabiesSemaphore(events, now)).toBe("none");
  });

  it("rabies dose without next_due_at → sin-vencimiento (no vigencia claim)", () => {
    const events = [vaccination("v1", "Antirrábica", "2026-01-01")];
    expect(deriveRabiesSemaphore(events, now)).toBe("sin-vencimiento");
  });

  it("matches rabies names accent- and case-insensitively (Antirrábica / RABIA / antirrabica)", () => {
    for (const name of ["Antirrábica", "ANTIRRABICA", "Vacuna Rabia", "rabia"]) {
      const events = [vaccination("v1", name, "2026-01-01", "2027-01-01")];
      expect(deriveRabiesSemaphore(events, now), name).toBe("vigente");
    }
  });

  it("a LATER non-rabies vaccine does NOT mask an expired rabies dose (the isRabiesAtRisk asymmetry)", () => {
    const events = [
      vaccination("v1", "Antirrábica", "2025-01-01", "2026-01-01"), // expired
      vaccination("v2", "Quíntuple", "2026-05-01", "2027-05-01"), // newer, not rabies
    ];
    // The service-dog heuristic goes dark here (latest vaccine isn't rabies)…
    expect(isRabiesAtRisk(events, now)).toBe(false);
    // …but the semaphore must still say VENCIDA.
    expect(deriveRabiesSemaphore(events, now)).toBe("vencida");
  });

  it("takes the LATEST rabies dose when several exist", () => {
    const events = [
      vaccination("v1", "Antirrábica", "2024-01-01", "2025-01-01"), // old, expired
      vaccination("v2", "Antirrábica", "2026-01-01", "2027-01-01"), // newer, vigente
    ];
    expect(deriveRabiesSemaphore(events, now)).toBe("vigente");
  });

  it("an amended name/date flips the semaphore (Invariant #3)", () => {
    // Correcting a mistyped name into a rabies dose brings it into the check…
    const renamed = [
      vaccination("v1", "Sextuple typo", "2025-01-01", "2026-01-01"),
      amend("a1", "v1", "2026-05-01", [
        { field: "vaccine_name", old: "Sextuple typo", new: "Antirrábica" },
      ]),
    ];
    expect(deriveRabiesSemaphore(renamed, now)).toBe("vencida");

    // …and correcting the due date forward flips vencida → vigente.
    const extended = [
      vaccination("v1", "Antirrábica", "2025-01-01", "2026-01-01"),
      amend("a1", "v1", "2026-05-01", [
        { field: "next_due_at", old: "2026-01-01", new: "2027-01-01" },
      ]),
    ];
    expect(deriveRabiesSemaphore(extended, now)).toBe("vigente");
  });
});
