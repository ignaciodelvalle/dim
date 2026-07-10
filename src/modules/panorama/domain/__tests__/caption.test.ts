// Unit tests for the pure per-view caption builder (panorama-ia-v2 P0).
//
// captionFor(layer, level, period) turns the layer's declarative `caption`
// material + `renderPolicy[level]` into the plain es-AR sentence shown between
// the preset row and the suppression notice. Pure — no DB, no React, no Next.

import { describe, expect, it } from "vitest";

import { captionFor } from "@/src/modules/panorama/domain/caption";
import { getLayer } from "@/src/modules/panorama/domain/layers";
import type { PanoramaLayer, PanoramaPeriod } from "@/src/modules/panorama/domain/types";

// Exactly 90 days (2026-04-05 → 2026-07-04) so the period phrase is "últimos 90 días".
const period90d: PanoramaPeriod = { from: "2026-04-05", to: "2026-07-04" };

function layer(id: Parameters<typeof getLayer>[0]): PanoramaLayer {
  const l = getLayer(id);
  if (!l) throw new Error(`missing layer ${id}`);
  return l;
}

describe("captionFor", () => {
  it("rate + choropleth-fill + current window at province → área/Relleno + Meta", () => {
    expect(captionFor(layer("cobertura"), "province", period90d)).toBe(
      "Cada área es una provincia. Relleno = cobertura antirrábica, estado actual. Meta 80%.",
    );
  });

  it("density + graduated-symbol + period window at locality → burbuja/Tamaño + últimos N días", () => {
    expect(captionFor(layer("mordeduras"), "locality", period90d)).toBe(
      "Cada burbuja es una división (departamento/partido, o barrio en CABA). Tamaño = eventos de mordedura / antirrábica, últimos 90 días.",
    );
  });

  it("omits the Meta clause when the layer has no complianceTarget", () => {
    expect(captionFor(layer("mordeduras"), "province", period90d)).not.toContain("Meta");
  });

  it("appends the Meta clause with the layer's complianceTarget when set", () => {
    expect(captionFor(layer("esterilizacion"), "province", period90d)).toContain("Meta 70%.");
  });

  it("names the unit per level (provincia vs the detail division)", () => {
    expect(captionFor(layer("cobertura"), "province", period90d)).toContain("es una provincia");
    // A choropleth layer's DETAIL tier draws + aggregates at the administrative
    // DIVISION (departamento/partido, barrio in CABA), not the far-finer locality —
    // the caption names that unit honestly (PO "Option A").
    expect(captionFor(layer("esterilizacion"), "locality", period90d)).toContain(
      "es una división (departamento/partido, o barrio en CABA)",
    );
  });

  it("folded aggregated-point layers name the detail division (PO Option A)", () => {
    // The count/signal point layers now fold their detail tier to the department
    // (barrio in CABA) too, so their caption names the division like the choropleths.
    expect(captionFor(layer("mordeduras"), "locality", period90d)).toContain(
      "es una división (departamento/partido, o barrio en CABA)",
    );
    expect(captionFor(layer("zoonosis"), "locality", period90d)).toContain(
      "es una división (departamento/partido, o barrio en CABA)",
    );
  });

  it("reunificacion still names the locality (its RATE is not folded yet)", () => {
    // reunificacion carries a ratePct that cannot be summed across localities, so
    // its detail tier stays at the locality — the caption stays "localidad".
    expect(captionFor(layer("reunificacion"), "locality", period90d)).toContain("es una localidad");
  });

  it("reference (clustered-points) layers produce a non-empty caption without a Meta clause", () => {
    const c = captionFor(layer("refugios"), "province", period90d);
    expect(c.length).toBeGreaterThan(0);
    expect(c).toContain("refugios registrados");
    expect(c).not.toContain("Meta");
  });
});
