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
    // ~47h before now = 10:00 AR two calendar days back. The old elapsed
    // floor(47/24)=1 called this "ayer" — WRONG: "ayer" is a calendar word,
    // and this date is the day BEFORE yesterday in Argentina. Calendar-day
    // semantics (calendarDaysAgoInAr) say "hace 2 días". The determinism
    // property (frozen now → stable label) is unchanged.
    const date = new Date("2026-07-02T13:00:00Z");
    expect(formatRelative(date, NOW)).toBe(formatRelative(date, NOW));
    expect(formatRelative(date, NOW)).toBe("hace 2 días");
  });

  it("counts calendar days in AR, not 24h blocks (the libreta 'hoy' repro)", () => {
    // 20:00 AR yesterday viewed at 09:00 AR today is only 13 elapsed hours —
    // the old floor(elapsed/24h)=0 labeled it "hoy". It happened AYER.
    const yesterdayEvening = new Date("2026-07-03T23:00:00Z"); // 20:00 AR 07-03
    expect(formatRelative(yesterdayEvening, NOW)).toBe("ayer");
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

// ---------------------------------------------------------------------------
// "Aplicó" attribution — must never contradict the provenance stamp
// (staging validation 2026-07-04, bug 1: vet-signed vaccine read "Declarado
// por el titular" next to a "Verificado por vet" badge).
// ---------------------------------------------------------------------------

describe("toAsientoView — vaccine 'Aplicó' attribution is consistent with the signature", () => {
  const baseVaccine: HistorialEventRow = {
    id: "evt-vac",
    petId: "pet-1",
    eventType: "vaccination_administered",
    payload: { vaccine_name: "Antirrábica" },
    occurredAt: new Date("2026-07-01T12:00:00Z"),
    notes: null,
    authorRole: "owner",
    authorVerified: false,
    authorOrganizationId: null,
    attachmentUrl: null,
    amendedAt: null,
  };

  function aplicoOf(row: HistorialEventRow): { value: string; missing?: boolean } {
    const view = toAsientoView(row, "TOKEN-1234", NOW);
    const f = view.facts.find((x) => x.key === "Aplicó");
    if (!f) throw new Error("missing Aplicó fact");
    return f;
  }

  it("vet-signed without administered_by never says 'Declarado por el titular'", () => {
    const row: HistorialEventRow = {
      ...baseVaccine,
      authorRole: "vet",
      authorVerified: true,
      authorOrganizationId: "org-1",
      authorOrgName: "Clínica San Roque",
    };
    const view = toAsientoView(row, "TOKEN-1234", NOW);
    expect(view.provenance.verified).toBe(true);
    const aplico = aplicoOf(row);
    expect(aplico.value).not.toContain("Declarado por el titular");
    expect(aplico.value).toBe("Vet. matriculado/a — Clínica San Roque");
    expect(aplico.missing).toBe(false);
    // A verified record must not carry the "falta verificación" warning.
    expect(view.warn).toBeUndefined();
  });

  it("vet-signed with a stamped matrícula attributes 'Vet. M.N. XXX'", () => {
    const row: HistorialEventRow = {
      ...baseVaccine,
      authorRole: "vet",
      authorVerified: true,
      authorOrganizationId: "org-1",
      authorOrgName: "Clínica San Roque",
      vetMatricula: "4821",
    };
    expect(aplicoOf(row).value).toBe("Vet. M.N. 4821");
  });

  it("vet-signed with no org name still attributes the verified signature", () => {
    const row: HistorialEventRow = {
      ...baseVaccine,
      authorRole: "vet",
      authorVerified: true,
      authorOrganizationId: "org-1",
    };
    expect(aplicoOf(row).value).toBe("Vet. matriculado/a (firma verificada)");
  });

  it("org-recorded (no matrícula) attributes the organization, not the titular", () => {
    const row: HistorialEventRow = {
      ...baseVaccine,
      authorRole: "shelter",
      authorVerified: false,
      authorOrganizationId: "org-1",
      authorOrgName: "Refugio Esperanza",
    };
    const aplico = aplicoOf(row);
    expect(aplico.value).toBe("Refugio Esperanza");
    expect(aplico.missing).toBe(false);
  });

  it("explicit administered_by always wins over the signer fallback", () => {
    const row: HistorialEventRow = {
      ...baseVaccine,
      payload: { vaccine_name: "Antirrábica", administered_by: "Dra. Paz — MP 4821" },
      authorRole: "vet",
      authorVerified: true,
      authorOrganizationId: "org-1",
      authorOrgName: "Clínica San Roque",
    };
    expect(aplicoOf(row).value).toBe("Dra. Paz — MP 4821");
  });

  it("owner-declared keeps 'Declarado por el titular' (correct in that case)", () => {
    const aplico = aplicoOf(baseVaccine);
    expect(aplico.value).toBe("Declarado por el titular");
    expect(aplico.missing).toBe(true);
  });

  it("lab-confirmed owner dose stays owner-attributed (tier bumper must not fake a signer)", () => {
    const row: HistorialEventRow = {
      ...baseVaccine,
      payload: { vaccine_name: "Antirrábica", confirmed_by_lab: true },
    };
    expect(aplicoOf(row).value).toBe("Declarado por el titular");
  });
});

// ---------------------------------------------------------------------------
// Sighting attribution — a third-party /p report is NOT an owner note
// (QA A4: a sighting loaded from the public page rendered "NOTA · CARGADO POR
// VOS" in the owner's own libreta, misattributing a stranger's report to the
// titular). A sighting is note_added, kind="sighting", authorRole="scanner".
// ---------------------------------------------------------------------------

describe("toAsientoView — sighting note is attributed to a third party, not the owner", () => {
  const baseSighting: HistorialEventRow = {
    id: "evt-sighting",
    petId: "pet-1",
    eventType: "note_added",
    payload: { category: "otro", kind: "sighting", text: "La vi cerca de la plaza." },
    occurredAt: new Date("2026-07-02T12:00:00Z"),
    notes: null,
    authorRole: "scanner",
    authorVerified: false,
    authorOrganizationId: null,
    attachmentUrl: null,
    amendedAt: null,
  };

  it("never reads 'Cargado por vos' for a scanner-authored sighting", () => {
    const view = toAsientoView(baseSighting, "TOKEN-1234", NOW);
    expect(view.provenance.verified).toBe(false);
    expect(view.provenance.label).toBe("Reportado por un tercero");
    expect(view.provenance.label).not.toBe("Cargado por vos");
  });

  it("uses an 'Avistaje' eyebrow, not 'Nota'", () => {
    const view = toAsientoView(baseSighting, "TOKEN-1234", NOW);
    expect(view.kind).toBe("Avistaje");
    expect(view.handwrittenNote).toBe("La vi cerca de la plaza.");
  });

  it("names the finder in the title when the sighting carries one", () => {
    const row: HistorialEventRow = {
      ...baseSighting,
      payload: { ...(baseSighting.payload as object), finderName: "Vecina del 3B" },
    };
    const view = toAsientoView(row, "TOKEN-1234", NOW);
    expect(view.title).toBe("Avistaje · Vecina del 3B");
  });

  it("still renders an ordinary owner note (no sighting kind) as 'Nota · Cargado por vos'", () => {
    const row: HistorialEventRow = {
      ...baseSighting,
      payload: { category: "recordatorio", text: "Cumple hoy." },
      authorRole: "owner",
    };
    const view = toAsientoView(row, "TOKEN-1234", NOW);
    expect(view.kind).toBe("Nota");
    expect(view.provenance.label).toBe("Cargado por vos");
  });
});
