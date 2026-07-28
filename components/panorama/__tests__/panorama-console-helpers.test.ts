import { describe, expect, it } from "vitest";

import {
  buildViewMeta,
  initialState,
  parseLayersParam,
  unknownLayerIds,
} from "@/components/panorama/panorama-console-helpers";

/**
 * `?layers=` fidelity.
 *
 * parseLayersParam DROPS ids it cannot resolve — correct for rendering (an
 * unknown id cannot be drawn) but silent, which is wrong under Panorama's
 * "compartir vista" identity: a link written before a layer was renamed reopens
 * with a smaller board and no hint that anything was lost, so the operator
 * reads a complete-looking view that is not the one they were sent.
 *
 * `unknownLayerIds` is the other half — what was lost, so the console can say so.
 */
describe("unknownLayerIds", () => {
  it("names the ids a shared link asked for that no longer exist", () => {
    expect(unknownLayerIds("zoonosis,brotes_zoonosis,mordeduras")).toEqual(["brotes_zoonosis"]);
  });

  it("says nothing when every id resolves", () => {
    expect(unknownLayerIds("zoonosis,mordeduras")).toEqual([]);
  });

  it("says nothing for an absent or empty param", () => {
    expect(unknownLayerIds(null)).toEqual([]);
    expect(unknownLayerIds("")).toEqual([]);
  });

  it("agrees with parseLayersParam — what one drops is what the other names", () => {
    // The two must partition the input; a gap between them is how a layer goes
    // missing with nobody reporting it.
    const raw = "zoonosis,nope,mordeduras,tampoco";
    expect(parseLayersParam(raw)).toEqual(["zoonosis", "mordeduras"]);
    expect(unknownLayerIds(raw)).toEqual(["nope", "tampoco"]);
  });
});

// P1-F4 (external design review): two clocks on one screen. The view card said
// "Estado actual" — it has the rule — while the dock stamped "últimos 90 días"
// over the same numbers, and the most quotable figure on the console (the
// Registros badge) sat next to the wrong one. The dock also never declared the
// asOf cut at all.
describe("buildViewMeta — one clock, and it declares the as-of cut", () => {
  const SINCE = new Date("2026-04-01T00:00:00Z");
  const UNTIL = new Date("2026-06-30T00:00:00Z");

  function statesWith(active: string[]) {
    const states = initialState();
    for (const id of active) {
      const s = states[id as keyof typeof states];
      if (s) states[id as keyof typeof states] = { ...s, active: true };
    }
    return states;
  }

  it("says 'estado actual' when every active layer is current-state", () => {
    // microchip is a current-state layer (temporal: false).
    const meta = buildViewMeta({
      province: null,
      locality: null,
      since: SINCE,
      until: UNTIL,
      periodParam: "90d",
      states: statesWith(["microchip"]),
      asOf: null,
    });
    expect(meta.periodLabel).toBe("estado actual");
  });

  it("keeps the period when at least one active layer is temporal", () => {
    const meta = buildViewMeta({
      province: null,
      locality: null,
      since: SINCE,
      until: UNTIL,
      periodParam: "90d",
      // desierto-veterinario is the temporal one here; mortalidad is
      // current-state despite the intuition (layers.ts declares it temporal:false).
      states: statesWith(["microchip", "desierto-veterinario"]),
      asOf: null,
    });
    expect(meta.periodLabel).not.toBe("estado actual");
  });

  it("appends the as-of cut when one is active", () => {
    const meta = buildViewMeta({
      province: null,
      locality: null,
      since: SINCE,
      until: UNTIL,
      periodParam: "90d",
      states: statesWith(["desierto-veterinario"]),
      asOf: new Date("2026-05-15T00:00:00Z"),
    });
    expect(meta.periodLabel).toContain("· al ");
  });

  it("declares the as-of cut even on a current-state view", () => {
    const meta = buildViewMeta({
      province: null,
      locality: null,
      since: SINCE,
      until: UNTIL,
      periodParam: "90d",
      states: statesWith(["microchip"]),
      asOf: new Date("2026-05-15T00:00:00Z"),
    });
    expect(meta.periodLabel).toContain("estado actual");
    expect(meta.periodLabel).toContain("· al ");
  });
});
