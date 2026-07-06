// Purity / determinism tests for the libreta asiento relative-time renderer.
//
// The credential/libreta hydration-freeze residual (F1 `now`-subclass): a
// relative-time renderer that computes `now` at render produces a different
// label on a second evaluation once wall-clock drifts, which — for a value
// that must match between the server render and the client hydration render —
// is a hydration mismatch. The systemic fix threads a SINGLE mount-stable
// `now` (LibretaFace) into every call. These tests lock in the property that
// makes that fix sound: given a FIXED `now`, the label is a pure, stable
// function of (date, now) with no hidden dependency on the ambient clock.

import type { HistorialEventRow } from "@/src/modules/pets/application/tab-data/types";
import { describe, expect, it } from "vitest";
import { formatRelative, toAsientoView } from "./asiento-fields";

const NOW = new Date("2026-07-04T12:00:00Z");

describe("formatRelative — pure given a fixed now", () => {
  it("is deterministic: same (date, now) yields the same label across calls", () => {
    const date = new Date("2026-06-20T12:00:00Z");
    const a = formatRelative(date, NOW);
    const b = formatRelative(date, NOW);
    expect(a).toBe(b);
  });

  it("does not read the ambient wall clock (advancing real time changes nothing)", () => {
    const date = new Date("2026-07-01T12:00:00Z");
    const first = formatRelative(date, NOW);
    // Simulate time passing between two renders that share the SAME frozen now.
    const laterCallSameNow = formatRelative(date, NOW);
    expect(laterCallSameNow).toBe(first);
  });

  it("buckets the elapsed span correctly", () => {
    expect(formatRelative(new Date("2026-07-04T09:00:00Z"), NOW)).toBe("hoy");
    expect(formatRelative(new Date("2026-07-03T09:00:00Z"), NOW)).toBe("ayer");
    expect(formatRelative(new Date("2026-07-01T12:00:00Z"), NOW)).toBe("hace 3 días");
    expect(formatRelative(new Date("2026-06-25T12:00:00Z"), NOW)).toBe("hace 1 semana");
    expect(formatRelative(new Date("2026-06-04T12:00:00Z"), NOW)).toBe("hace 1 mes");
    expect(formatRelative(new Date("2025-07-04T12:00:00Z"), NOW)).toBe("hace 1 año");
  });

  it("a value straddling a day boundary is stable when now is frozen", () => {
    // ~47h before now: floor(47/24) = 1 → "ayer". A drifting clock could push
    // this to "hace 2 días" mid-session; a frozen now must not.
    const date = new Date("2026-07-02T13:00:00Z");
    expect(formatRelative(date, NOW)).toBe(formatRelative(date, NOW));
    expect(formatRelative(date, NOW)).toBe("ayer");
  });
});

describe("toAsientoView — whenRelative is deterministic under a fixed now", () => {
  const row: HistorialEventRow = {
    id: "evt-1",
    petId: "pet-1",
    eventType: "weight_recorded",
    payload: { kg: "12.4" },
    occurredAt: new Date("2026-07-01T12:00:00Z"),
    notes: null,
    authorRole: "owner",
    authorVerified: false,
    authorOrganizationId: null,
    attachmentUrl: null,
    amendedAt: null,
  };

  it("produces the same whenRelative for the same now across calls", () => {
    const a = toAsientoView(row, "TOKEN-1234", NOW);
    const b = toAsientoView(row, "TOKEN-1234", NOW);
    expect(a.whenRelative).toBe(b.whenRelative);
    expect(a.whenRelative).toBe("hace 3 días");
  });
});
