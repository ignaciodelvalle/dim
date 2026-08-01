import { describe, expect, it } from "vitest";

import { buildExportFooter, formatAsOfDate } from "../panorama-export";

describe("formatAsOfDate", () => {
  // T2.4: one UTC day formatter for every as-of surface — the footer date is
  // the long es-AR shape ("4 de julio de 2026"), matching the dock headline,
  // the context bar and the pinned popup for the SAME cut. UTC day markers in
  // (the scrub axis), UTC day labels out — no previous-day drift.
  it("formats a UTC day marker as the shared long es-AR shape", () => {
    expect(formatAsOfDate(new Date("2026-07-04T00:00:00.000Z"))).toBe("4 de julio de 2026");
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
