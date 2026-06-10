// Pure-function tests for the libreta health-status helpers.
//
// Covers:
//   • computeVaccinationSummary — core/missing/active/due_soon/expired
//     classification and the next-due derivation from intervalMonths
//   • computeMedicationsActive — open treatments by start/stop id matching
//   • computeLibretaHealthStatus — passes pet metadata through unchanged

import { describe, expect, it } from "vitest";

import {
  computeLibretaHealthStatus,
  computeMedicationsActive,
  computeVaccinationSummary,
} from "@/lib/libreta-health-status";

// Helper: shape a vaccination event the way the libreta page returns it.
function vaxEvent(opts: {
  vaccineName: string;
  occurredAt: string;
  nextDueAt?: string | null;
}) {
  return {
    id: `vax-${Math.random().toString(36).slice(2, 9)}`,
    eventType: "vaccination_administered" as const,
    occurredAt: new Date(opts.occurredAt),
    payload: {
      vaccine_name: opts.vaccineName,
      ...(opts.nextDueAt !== undefined ? { next_due_at: opts.nextDueAt } : {}),
    },
  };
}

function medStartEvent(opts: { id: string; drug: string; occurredAt: string }) {
  return {
    id: opts.id,
    eventType: "medication_started" as const,
    occurredAt: new Date(opts.occurredAt),
    payload: { drug_name: opts.drug },
  };
}

function medStopEvent(opts: { startId: string; occurredAt: string }) {
  return {
    id: `stop-${Math.random().toString(36).slice(2, 9)}`,
    eventType: "medication_stopped" as const,
    occurredAt: new Date(opts.occurredAt),
    payload: { medication_started_event_id: opts.startId },
  };
}

describe("computeVaccinationSummary", () => {
  const now = new Date("2026-05-26T12:00:00.000Z");

  it("returns all core vaccines as missing for a fresh dog with no events", () => {
    const summary = computeVaccinationSummary([], "dog", now);
    expect(summary.active).toBe(0);
    expect(summary.expired).toBe(0);
    expect(summary.dueSoon).toBe(0);
    // Catalog has dog cores: Antirrábica, Séxtuple, Quíntuple → 3 missing.
    expect(summary.missing).toBeGreaterThanOrEqual(3);
    expect(summary.perVaccine.find((v) => v.vaccineName === "Antirrábica")?.status).toBe("missing");
  });

  it("classifies a recent rabies dose as active", () => {
    const events = [vaxEvent({ vaccineName: "Antirrábica", occurredAt: "2026-05-01T00:00:00Z" })];
    const summary = computeVaccinationSummary(events, "dog", now);
    const row = summary.perVaccine.find((v) => v.vaccineName === "Antirrábica");
    expect(row?.status).toBe("active");
    expect(row?.lastDoseAt?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(row?.nextDueAt).toBeInstanceOf(Date); // derived from intervalMonths=12
  });

  it("classifies a dose due within 30 days as due_soon", () => {
    // Catalog interval is 12 months. A dose ~11 months back puts next-due in ~30 days.
    const events = [vaxEvent({ vaccineName: "Antirrábica", occurredAt: "2025-06-15T00:00:00Z" })];
    const summary = computeVaccinationSummary(events, "dog", now);
    const row = summary.perVaccine.find((v) => v.vaccineName === "Antirrábica");
    expect(row?.status).toBe("due_soon");
  });

  it("classifies an over-interval dose as expired", () => {
    const events = [vaxEvent({ vaccineName: "Antirrábica", occurredAt: "2024-01-01T00:00:00Z" })];
    const summary = computeVaccinationSummary(events, "dog", now);
    const row = summary.perVaccine.find((v) => v.vaccineName === "Antirrábica");
    expect(row?.status).toBe("expired");
    expect(summary.expired).toBeGreaterThan(0);
  });

  it("honors an explicit next_due_at over the catalog interval", () => {
    const events = [
      vaxEvent({
        vaccineName: "Antirrábica",
        occurredAt: "2026-04-01T00:00:00Z",
        nextDueAt: "2026-06-10T00:00:00Z", // ~14 days from now → due_soon
      }),
    ];
    const summary = computeVaccinationSummary(events, "dog", now);
    const row = summary.perVaccine.find((v) => v.vaccineName === "Antirrábica");
    expect(row?.status).toBe("due_soon");
    expect(row?.nextDueAt?.toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });

  it("uses the latest dose when multiple events for the same vaccine exist", () => {
    const events = [
      vaxEvent({ vaccineName: "Antirrábica", occurredAt: "2023-01-01T00:00:00Z" }),
      vaxEvent({ vaccineName: "Antirrábica", occurredAt: "2026-05-20T00:00:00Z" }),
    ];
    const summary = computeVaccinationSummary(events, "dog", now);
    const row = summary.perVaccine.find((v) => v.vaccineName === "Antirrábica");
    expect(row?.status).toBe("active");
    expect(row?.lastDoseAt?.toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });

  it("ignores free-text vaccine names not in the catalog", () => {
    const events = [
      vaxEvent({ vaccineName: "Made-Up Vaccine", occurredAt: "2026-05-01T00:00:00Z" }),
    ];
    const summary = computeVaccinationSummary(events, "dog", now);
    // Doesn't appear in perVaccine, so cores remain missing.
    expect(summary.perVaccine.find((v) => v.vaccineName === "Made-Up Vaccine")).toBeUndefined();
  });

  it("surfaces non-core vaccines once the owner has logged a dose", () => {
    const events = [
      vaxEvent({
        vaccineName: "Tos de las perreras (Bordetella)",
        occurredAt: "2026-05-01T00:00:00Z",
      }),
    ];
    const summary = computeVaccinationSummary(events, "dog", now);
    const row = summary.perVaccine.find((v) => v.vaccineName.startsWith("Tos de las perreras"));
    expect(row).toBeDefined();
    expect(row?.status).toBe("active");
  });
});

describe("computeMedicationsActive", () => {
  it("returns nothing when no medication events exist", () => {
    expect(computeMedicationsActive([])).toEqual([]);
  });

  it("returns started events that have no matching stop", () => {
    const events = [
      medStartEvent({ id: "start-1", drug: "Apoquel 16mg", occurredAt: "2026-01-10T00:00:00Z" }),
      medStartEvent({
        id: "start-2",
        drug: "Cefalexina 500mg",
        occurredAt: "2026-04-15T00:00:00Z",
      }),
    ];
    const active = computeMedicationsActive(events);
    expect(active.map((a) => a.drug)).toEqual(["Apoquel 16mg", "Cefalexina 500mg"]);
  });

  it("excludes a started event once a stop references it by id", () => {
    const events = [
      medStartEvent({ id: "start-1", drug: "Apoquel 16mg", occurredAt: "2026-01-10T00:00:00Z" }),
      medStartEvent({
        id: "start-2",
        drug: "Cefalexina 500mg",
        occurredAt: "2026-04-15T00:00:00Z",
      }),
      medStopEvent({ startId: "start-2", occurredAt: "2026-05-01T00:00:00Z" }),
    ];
    const active = computeMedicationsActive(events);
    expect(active.map((a) => a.drug)).toEqual(["Apoquel 16mg"]);
  });

  it("does not match by drug name — different starts of the same drug stay open until each is stopped", () => {
    const events = [
      medStartEvent({ id: "start-1", drug: "Apoquel", occurredAt: "2025-01-01T00:00:00Z" }),
      medStartEvent({ id: "start-2", drug: "Apoquel", occurredAt: "2026-01-01T00:00:00Z" }),
      medStopEvent({ startId: "start-1", occurredAt: "2025-06-01T00:00:00Z" }),
    ];
    const active = computeMedicationsActive(events);
    expect(active.map((a) => a.startEventId)).toEqual(["start-2"]);
  });

  it("returns active items oldest first", () => {
    const events = [
      medStartEvent({ id: "start-newer", drug: "B", occurredAt: "2026-04-01T00:00:00Z" }),
      medStartEvent({ id: "start-older", drug: "A", occurredAt: "2026-01-01T00:00:00Z" }),
    ];
    const active = computeMedicationsActive(events);
    expect(active.map((a) => a.startEventId)).toEqual(["start-older", "start-newer"]);
  });
});

describe("computeLibretaHealthStatus", () => {
  it("passes pet condition fields through unchanged", () => {
    const status = computeLibretaHealthStatus(
      {
        species: "dog",
        permanentConditions: ["dermatitis_atopica", "otra"],
        permanentConditionsOther: "Sensible a pollo",
      },
      [],
      new Date("2026-05-26T00:00:00Z"),
    );
    expect(status.permanentConditions).toEqual(["dermatitis_atopica", "otra"]);
    expect(status.permanentConditionsOther).toBe("Sensible a pollo");
  });

  it("defaults permanentConditions to an empty list when the pet has none", () => {
    const status = computeLibretaHealthStatus(
      { species: "cat", permanentConditions: null, permanentConditionsOther: null },
      [],
    );
    expect(status.permanentConditions).toEqual([]);
    expect(status.permanentConditionsOther).toBeNull();
  });
});
