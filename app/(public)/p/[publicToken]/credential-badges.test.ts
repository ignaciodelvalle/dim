// WAVE D1 (Invariant #3) — the PUBLIC credential must show CORRECTED clinical
// values. These pure tests prove that folding an `event_amended` row through the
// badge helpers changes what a QR scanner sees: the vaccine count, the active
// medications, and the rabies-at-risk banner all move with the correction.

import { describe, expect, it } from "vitest";

import {
  type CredentialEvent,
  countActiveVaccineNames,
  deriveActiveMedications,
  isRabiesAtRisk,
} from "./credential-badges";

const vaccination = (
  id: string,
  name: string,
  at: string,
  validUntil?: string,
): CredentialEvent => ({
  id,
  eventType: "vaccination_administered",
  occurredAt: at,
  payload: { vaccine_name: name, ...(validUntil ? { valid_until: validUntil } : {}) },
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

describe("countActiveVaccineNames — corrections supersede on the public credential", () => {
  it("counts distinct corrected vaccine names", () => {
    const events = [
      vaccination("v1", "Antirrábica", "2026-01-01"),
      vaccination("v2", "Quíntuple", "2026-02-01"),
    ];
    expect(countActiveVaccineNames(events)).toBe(2);
  });

  it("a correction that DEDUPES two doses drops the distinct count", () => {
    // Two different names → 2. Correcting v2's name to match v1 → 1 distinct.
    const events = [
      vaccination("v1", "Antirrábica", "2026-01-01"),
      vaccination("v2", "Antirabica typo", "2026-02-01"),
      amend("a1", "v2", "2026-03-01", [
        { field: "vaccine_name", old: "Antirabica typo", new: "Antirrábica" },
      ]),
    ];
    expect(countActiveVaccineNames(events)).toBe(1);
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

  it("a correction extending valid_until into the future clears the risk", () => {
    const events = [
      vaccination("v1", "Vacuna Rabia", "2025-01-01", "2026-01-01"),
      amend("a1", "v1", "2026-05-01", [
        { field: "valid_until", old: "2026-01-01", new: "2027-01-01" },
      ]),
    ];
    // Without the overlay the credential would still warn "vencida"; with it,
    // the corrected future expiry clears the banner.
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
