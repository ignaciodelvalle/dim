// Panorama ViewState URL boundary — round-trip property tests (task #50 P1a).
//
// The property `viewStateFromParams(viewStateToParams(v)) ≡ v` (over the
// serialized fields) is the structural fix for the H14 deep-link round-trip
// defect: any param read-but-never-written (or written-but-never-read) fails RED
// here instead of shipping as a coherence break. Ephemeral fields (basis /
// encoding / representation) are held at defaults so the FULL value round-trips.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEW_STATE,
  type PanoramaViewState,
  makeViewState,
  toPeriodSearchParams,
  toScopeFilter,
} from "@/src/modules/panorama/domain/view-state";
import {
  viewStateFromParams,
  viewStateToParams,
} from "@/src/modules/panorama/domain/view-state-url";

/** Round-trip a value through the URL boundary. */
function roundTrip(v: PanoramaViewState): PanoramaViewState {
  return viewStateFromParams(viewStateToParams(v));
}

// ---------------------------------------------------------------------------
// A matrix of views varying every SERIALIZED field (ephemerals at defaults).
// ---------------------------------------------------------------------------

const VIEWS: Record<string, PanoramaViewState> = {
  "bare national default": DEFAULT_VIEW_STATE,
  "province scope": makeViewState({ scope: { kind: "province", province: "AR-C" } }),
  "locality scope": makeViewState({
    scope: { kind: "locality", province: "AR-C", locality: "Palermo" },
  }),
  "preset period 90d": makeViewState({ period: { kind: "preset", preset: "90d" } }),
  "custom period": makeViewState({
    period: { kind: "custom", from: "2026-01-01", to: "2026-03-31" },
  }),
  "with asOf scrub cut": makeViewState({ asOf: "2026-05-01T00:00:00.000Z" }),
  "with layers": makeViewState({ layers: ["cobertura", "zoonosis"] }),
  "verified only": makeViewState({ verifiedOnly: true }),
  "with preset": makeViewState({ preset: "brotes-activos" }),
  "with camera frame": makeViewState({ camera: { zoom: 8.5, lat: -34.6, lng: -58.4 } }),
  "the full deep link (H14)": makeViewState({
    scope: { kind: "locality", province: "AR-B", locality: "La Plata" },
    period: { kind: "preset", preset: "30d" },
    asOf: "2026-04-15T00:00:00.000Z",
    layers: ["denuncias", "decomisos"],
    verifiedOnly: true,
    preset: "bienestar",
    camera: { zoom: 9, lat: -34.9, lng: -57.95 },
  }),
};

describe("view-state URL boundary — round-trip (H14 fence)", () => {
  for (const [name, view] of Object.entries(VIEWS)) {
    it(`round-trips: ${name}`, () => {
      expect(roundTrip(view)).toEqual(view);
    });
  }
});

// ---------------------------------------------------------------------------
// Minimal URL — an unchanged view yields the minimal param surface today's
// console emits (no gratuitous verified=0 / national scope noise).
// ---------------------------------------------------------------------------

describe("view-state URL boundary — minimal serialization", () => {
  it("the bare national default emits only the period preset", () => {
    const p = viewStateToParams(DEFAULT_VIEW_STATE);
    expect(p.get("period")).toBe("3y");
    expect(p.has("province")).toBe(false);
    expect(p.has("locality")).toBe(false);
    expect(p.has("verified")).toBe(false);
    expect(p.has("layers")).toBe(false);
    expect(p.has("asOf")).toBe(false);
    expect(p.has("preset")).toBe(false);
  });

  it("verifiedOnly=false is omitted; =true is verified=1", () => {
    expect(viewStateToParams(makeViewState({ verifiedOnly: false })).has("verified")).toBe(false);
    expect(viewStateToParams(makeViewState({ verifiedOnly: true })).get("verified")).toBe("1");
  });

  it("NEVER emits the ephemeral fields (basis / encoding / representation)", () => {
    const p = viewStateToParams(
      makeViewState({ basis: "transaction", encoding: "glow", representation: "timeline" }),
    );
    expect(p.has("basis")).toBe(false);
    expect(p.has("encoding")).toBe(false);
    expect(p.has("representation")).toBe(false);
    expect(p.has("mode")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deserialization robustness — a crafted / malformed URL never throws and falls
// back cleanly (it must never widen data scope; server-side narrowing enforces).
// ---------------------------------------------------------------------------

describe("view-state URL boundary — robustness", () => {
  it("accepts a plain searchParams record (SSR shape) as well as URLSearchParams", () => {
    const v = viewStateFromParams({ province: "AR-C", period: "90d", layers: "cobertura" });
    expect(v.scope).toEqual({ kind: "province", province: "AR-C" });
    expect(v.period).toEqual({ kind: "preset", preset: "90d" });
    expect(v.layers).toEqual(["cobertura"]);
  });

  it("drops unknown layer ids and de-dupes", () => {
    const v = viewStateFromParams({ layers: "cobertura,not-a-layer,cobertura,zoonosis" });
    expect(v.layers).toEqual(["cobertura", "zoonosis"]);
  });

  it("ignores an unknown period preset (→ default) and an unknown preset id (→ null)", () => {
    expect(viewStateFromParams({ period: "banana" }).period).toEqual(DEFAULT_VIEW_STATE.period);
    expect(viewStateFromParams({ preset: "nope" }).preset).toBeNull();
  });

  it("locality without a province degrades to national (no illegal state)", () => {
    expect(viewStateFromParams({ locality: "Palermo" }).scope).toEqual({ kind: "national" });
  });

  it("a partial custom range (from without to) falls back to the default period", () => {
    expect(viewStateFromParams({ period: "custom", from: "2026-01-01" }).period).toEqual(
      DEFAULT_VIEW_STATE.period,
    );
  });

  it("a non-finite camera coordinate drops the whole frame", () => {
    expect(viewStateFromParams({ z: "8", lat: "abc", lng: "-58" }).camera).toBeNull();
    expect(viewStateFromParams({ z: "8", lat: "-34.6", lng: "-58.4" }).camera).toEqual({
      zoom: 8,
      lat: -34.6,
      lng: -58.4,
    });
  });

  it("seed supplies the ephemeral fields + first-visit defaults; the URL overrides serialized fields", () => {
    const v = viewStateFromParams(
      { province: "AR-C" },
      { basis: "transaction", representation: "stats", preset: "sintomas" },
    );
    expect(v.basis).toBe("transaction"); // from seed (ephemeral)
    expect(v.representation).toBe("stats"); // from seed (ephemeral)
    expect(v.scope).toEqual({ kind: "province", province: "AR-C" }); // from URL
    expect(v.preset).toBe("sintomas"); // seed default (no ?preset in URL)
  });
});

// ---------------------------------------------------------------------------
// Converters to the existing domain shapes (P1b wiring seams).
// ---------------------------------------------------------------------------

describe("view-state converters", () => {
  it("toScopeFilter projects onto the existing PanoramaScope shape", () => {
    expect(toScopeFilter(DEFAULT_VIEW_STATE)).toEqual({
      country: "AR",
      province: null,
      locality: null,
    });
    expect(toScopeFilter(makeViewState({ scope: { kind: "province", province: "AR-C" } }))).toEqual(
      { country: "AR", province: "AR-C", locality: null },
    );
    expect(
      toScopeFilter(
        makeViewState({ scope: { kind: "locality", province: "AR-C", locality: "Palermo" } }),
      ),
    ).toEqual({ country: "AR", province: "AR-C", locality: "Palermo" });
  });

  it("toPeriodSearchParams feeds resolveAnalyticsPeriod's contract", () => {
    expect(
      toPeriodSearchParams(makeViewState({ period: { kind: "preset", preset: "90d" } })),
    ).toEqual({ period: "90d" });
    expect(
      toPeriodSearchParams(
        makeViewState({ period: { kind: "custom", from: "2026-01-01", to: "2026-03-31" } }),
      ),
    ).toEqual({ period: "custom", from: "2026-01-01", to: "2026-03-31" });
  });
});
