// Badge-count derivation tests (staging validation 2026-07-04, bug 3).
//
// The conflation that shipped uncaught: "Por vencer" counted `dueSoon +
// missing`, so a freshly created pet with ZERO vaccine records showed
// "3 POR VENCER" (the 3 core catalog vaccines for a dog, never administered).
// These tests pin the honest rule: "por vencer" counts ONLY registered doses
// approaching next_due; zero records renders the empty state.

import { computeVaccinationSummary, hasAnyVaccineRecord } from "@/lib/domain/libreta-health-status";
import { describe, expect, it } from "vitest";
import { deriveVacunasBadgeCounts } from "./VacunasStatusBadges";

const NOW = new Date("2026-03-15T00:00:00Z");

function vaccineEvent(name: string, at: string, nextDue?: string) {
  return {
    eventType: "vaccination_administered",
    occurredAt: at,
    payload: { vaccine_name: name, ...(nextDue ? { next_due_at: nextDue } : {}) },
  };
}

describe("deriveVacunasBadgeCounts — zero-records case", () => {
  it("a fresh dog with no events shows NO fabricated 'por vencer' count", () => {
    const summary = computeVaccinationSummary([], "dog", NOW);
    const counts = deriveVacunasBadgeCounts(summary);
    expect(counts.hasRecords).toBe(false);
    expect(counts.porVencer).toBe(0);
    expect(counts.vigente).toBe(0);
    expect(counts.vencida).toBe(0);
    // The 3 dog core vaccines surface as "sin aplicar", never as "por vencer".
    expect(counts.sinAplicar).toBeGreaterThanOrEqual(3);
  });
});

describe("deriveVacunasBadgeCounts — missing is never folded into 'por vencer'", () => {
  it("one active dose + missing cores → 1 vigente, 0 por vencer", () => {
    // One rabies dose due far in the future; other cores never administered.
    const summary = computeVaccinationSummary(
      [vaccineEvent("Antirrábica", "2026-03-01", "2027-03-01")],
      "dog",
      NOW,
    );
    const counts = deriveVacunasBadgeCounts(summary);
    expect(counts.hasRecords).toBe(true);
    expect(counts.vigente).toBe(1);
    expect(counts.porVencer).toBe(0);
    expect(counts.sinAplicar).toBe(summary.missing);
  });

  it("a registered dose approaching next_due IS 'por vencer'", () => {
    const summary = computeVaccinationSummary(
      [vaccineEvent("Antirrábica", "2025-04-01", "2026-04-01")],
      "dog",
      NOW, // 2026-03-15 → due in 17 days, inside the default 30-day window
    );
    const counts = deriveVacunasBadgeCounts(summary);
    expect(counts.porVencer).toBe(1);
    expect(counts.vigente).toBe(0);
  });
});

describe("owner/share parity — same shared predicate", () => {
  it("hasAnyVaccineRecord drives both surfaces' empty state", () => {
    const empty = computeVaccinationSummary([], "cat", NOW);
    expect(deriveVacunasBadgeCounts(empty).hasRecords).toBe(hasAnyVaccineRecord(empty));

    const withDose = computeVaccinationSummary(
      [vaccineEvent("Triple felina", "2026-03-01")],
      "cat",
      NOW,
    );
    expect(deriveVacunasBadgeCounts(withDose).hasRecords).toBe(hasAnyVaccineRecord(withDose));
  });
});
