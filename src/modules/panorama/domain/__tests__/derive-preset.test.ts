import { describe, expect, it } from "vitest";
import { derivePreset } from "../derive-preset";
import { PANORAMA_PRESETS, presetLayerIds } from "../presets";
import type { EncodingId } from "../view-state";

describe("derivePreset", () => {
  it("derives every preset from its EXACT layer set (auto encoding)", () => {
    // Selecting a preset sets layers to its config; the derived value reports it.
    for (const preset of PANORAMA_PRESETS) {
      expect(derivePreset(presetLayerIds(preset), null, PANORAMA_PRESETS)).toBe(preset.id);
    }
  });

  it("is order- and duplicate-independent (a SET, not a sequence)", () => {
    // brotes-activos = [cobertura, zoonosis]; reversed + duplicated still matches.
    expect(
      derivePreset(["zoonosis", "cobertura", "cobertura"], null, PANORAMA_PRESETS),
    ).toBe("brotes-activos");
  });

  it("returns null ('personalizada') for a hand-edited set matching no preset", () => {
    // cumplimiento is [cobertura]; adding an unrelated layer leaves every preset.
    expect(derivePreset(["cobertura", "denuncias"], null, PANORAMA_PRESETS)).toBeNull();
    // A partial of a multi-layer preset that is no other preset's full set.
    expect(derivePreset(["zoonosis"], null, PANORAMA_PRESETS)).toBeNull();
  });

  it("returns null for the empty layer set (all layers off)", () => {
    expect(derivePreset([], null, PANORAMA_PRESETS)).toBeNull();
  });

  it("derives HONESTLY to another preset when a chip swap lands on its config", () => {
    // Start on "Brotes activos" ([cobertura, zoonosis]); toggling zoonosis OFF
    // lands on [cobertura] — which IS "cumplimiento"'s exact config. The badge
    // must follow truthfully, not cling to the old preset or force null.
    expect(derivePreset(["cobertura"], null, PANORAMA_PRESETS)).toBe("cumplimiento");
    // And the reverse edit (adding zoonosis to cumplimiento) lands on brotes-activos.
    expect(derivePreset(["cobertura", "zoonosis"], null, PANORAMA_PRESETS)).toBe(
      "brotes-activos",
    );
  });

  it("returns null when an explicit encoding override is set (custom view)", () => {
    // Even a layer set that matches a preset is 'personalizada' once the operator
    // picks a non-'auto' encoding — no preset owns an explicit encoding in P1.
    const explicit: EncodingId = "bivariate";
    expect(derivePreset(["cobertura", "zoonosis"], explicit, PANORAMA_PRESETS)).toBeNull();
  });

  it("matches against the passed catalogue only", () => {
    // Empty catalogue → nothing can match.
    expect(derivePreset(["cobertura"], null, [])).toBeNull();
  });
});
