import { describe, expect, it } from "vitest";

import { parseLayersParam, unknownLayerIds } from "@/components/panorama/panorama-console-helpers";

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
