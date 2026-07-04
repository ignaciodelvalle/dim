import { describe, expect, it } from "vitest";

import { buildExportFooter, formatAsOfDate } from "../panorama-export";

describe("formatAsOfDate", () => {
  it("formats a date as es-AR short form without a trailing dot on the month", () => {
    expect(formatAsOfDate(new Date("2026-07-04T12:00:00"))).toBe("4 jul 2026");
  });
});

describe("buildExportFooter — auditable provenance (§3.6)", () => {
  const base = {
    asOf: new Date("2026-07-04T12:00:00"),
    scopeLabel: "Nacional",
    periodLabel: "últimos 90 días",
    suppressedCount: 3,
  };

  it("includes data-as-of, source, scope, period and the suppressed-cell count", () => {
    expect(buildExportFooter(base)).toBe(
      "Datos al 4 jul 2026 · MiMAR · Nacional · últimos 90 días · 3 celdas protegidas por privacidad",
    );
  });

  it("omits the suppressed-cell segment when nothing is suppressed", () => {
    expect(buildExportFooter({ ...base, suppressedCount: 0 })).toBe(
      "Datos al 4 jul 2026 · MiMAR · Nacional · últimos 90 días",
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
      now: new Date("2026-01-15T00:00:00"),
    });
    expect(footer).toContain("Datos al 15 ene 2026");
  });
});
