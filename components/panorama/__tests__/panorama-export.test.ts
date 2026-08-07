import { describe, expect, it } from "vitest";

import { buildExportFooter, formatAsOfDate, pinCitationAsOf } from "../panorama-export";

describe("formatAsOfDate", () => {
  // T2.4: one UTC day formatter for every as-of surface — the footer date is
  // the long es-AR shape ("4 de julio de 2026"), matching the dock headline,
  // the context bar and the pinned popup for the SAME cut. UTC day markers in
  // (the scrub axis), UTC day labels out — no previous-day drift.
  it("formats a UTC day marker as the shared long es-AR shape", () => {
    expect(formatAsOfDate(new Date("2026-07-04T00:00:00.000Z"))).toBe("4 de julio de 2026");
  });
});

// "Citar esta vista" v1 — the citation pin. The copied URL must ALWAYS carry an
// explicit asOf (the citation replays the spine, never the live cache/cube
// path), and an operator's existing scrub corte is preserved untouched.
describe("pinCitationAsOf — Citar esta vista v1", () => {
  it("pins the generation day (UTC) into the URL when parked at the live edge", () => {
    const params = new URLSearchParams("layers=denuncias");
    const pinned = pinCitationAsOf(params, null, new Date("2026-08-02T15:30:00.000Z"));
    expect(params.get("asOf")).toBe("2026-08-02");
    // UTC midnight of the generation day — the exact value a URL round-trip
    // restores, so the citing view and the re-opened view are the SAME cut.
    expect(pinned.toISOString()).toBe("2026-08-02T00:00:00.000Z");
    // Never clobbers the rest of the view — the citation IS the current board.
    expect(params.get("layers")).toBe("denuncias");
  });

  it("preserves an existing scrub corte untouched", () => {
    const asOf = new Date("2026-05-01T00:00:00.000Z");
    const params = new URLSearchParams("asOf=2026-05-01&layers=denuncias");
    const pinned = pinCitationAsOf(params, asOf, new Date("2026-08-02T15:30:00.000Z"));
    expect(pinned).toBe(asOf);
    expect(params.get("asOf")).toBe("2026-05-01");
  });
});

describe("buildExportFooter — auditable provenance (§3.6)", () => {
  const base = {
    asOf: new Date("2026-07-04T00:00:00.000Z"),
    scopeLabel: "Nacional",
    periodLabel: "últimos 90 días",
    suppressedCount: 3,
  };

  it("includes data-as-of, source, scope, period and the suppressed-cell count", () => {
    expect(buildExportFooter(base)).toBe(
      "Datos al 4 de julio de 2026 · miMAR · Nacional · últimos 90 días · 3 celdas protegidas por privacidad",
    );
  });

  it("omits the suppressed-cell segment when nothing is suppressed", () => {
    expect(buildExportFooter({ ...base, suppressedCount: 0 })).toBe(
      "Datos al 4 de julio de 2026 · miMAR · Nacional · últimos 90 días",
    );
  });

  it("singularizes a single suppressed cell", () => {
    expect(buildExportFooter({ ...base, suppressedCount: 1 })).toContain(
      "1 celda protegida por privacidad",
    );
  });

  it("falls back to `now` when the view is live (asOf null)", () => {
    const footer = buildExportFooter({
      ...base,
      asOf: null,
      now: new Date("2026-01-15T00:00:00.000Z"),
    });
    expect(footer).toContain("Datos al 15 de enero de 2026");
  });
});

describe("buildExportFooter — the CABA inset caveat (MAP-1)", () => {
  it("says the magnifier is missing, before the machine digest", () => {
    const footer = buildExportFooter({
      asOf: new Date("2026-08-05T12:00:00.000Z"),
      scopeLabel: "Nacional",
      periodLabel: "últimos 90 días",
      suppressedCount: 0,
      cabaInsetOmitted: true,
    });
    expect(footer).toContain("sin el recuadro de CABA");
    // And it tells the reader what to do about it, rather than just apologising.
    expect(footer).toContain("exportá con alcance CABA");
  });

  it("stays out of the strip when the image is complete", () => {
    const footer = buildExportFooter({
      asOf: new Date("2026-08-05T12:00:00.000Z"),
      scopeLabel: "CABA",
      periodLabel: "últimos 90 días",
      suppressedCount: 0,
    });
    expect(footer).not.toContain("recuadro");
  });
});
