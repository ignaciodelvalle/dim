// buildAllSuppressedNotice — the "everything on this map is hidden" disclosure.
//
// PRE-PUSH REVIEW 2026-07-30. The card's gate is `suppressedCount === 0 → null`.
// The province-grain loaders did not COUNT their suppressed cells (the envelope
// field was optional and the cube path hardcoded 0), so a province map whose
// every polygon was k-anon hatched reported 0 and rendered NO notice at all.
// The values were protected and the operator was told nothing — half-done
// privacy work. These cases pin both halves of the gate at PROVINCE grain, the
// one the defect lived in.

import { describe, expect, it } from "vitest";

import { buildAllSuppressedNotice } from "./all-suppressed-notice";

const CAPTION = { id: "cobertura" as const };

/** A province feature as buildProvinceChoroplethFeatures emits it (geometry null,
 * the k-anon decision carried on `properties.suppressed`). */
const feature = (suppressed: boolean) => ({ properties: { suppressed } });

const activeLayers = (...flags: boolean[]) => [
  { id: "cobertura", features: { features: flags.map(feature) } },
];

const KPIS = [{ id: "cobertura" as const, label: "Cobertura antirrábica", value: "61%" }];

describe("buildAllSuppressedNotice — province grain", () => {
  it("renders the notice when EVERY province cell is hatched and the count is disclosed", () => {
    const notice = buildAllSuppressedNotice({
      captionLayer: CAPTION,
      states: { cobertura: { active: true, loading: false, suppressedCount: 2 } },
      activeLayers: activeLayers(true, true),
      kpis: KPIS,
    });
    expect(notice).not.toBeNull();
    expect(notice).toContain("privacidad");
  });

  it("stays silent when at least one province paints a real value", () => {
    expect(
      buildAllSuppressedNotice({
        captionLayer: CAPTION,
        states: { cobertura: { active: true, loading: false, suppressedCount: 1 } },
        activeLayers: activeLayers(true, false),
        kpis: KPIS,
      }),
    ).toBeNull();
  });

  // THE REGRESSION, stated as a test: a fully-hatched map whose envelope reports
  // 0 suppressed cells produces NO notice. That is exactly what the province
  // loaders (and the cube province path) shipped before this fix — the map was
  // 100% grey and nothing on screen said why. If a future loader stops counting,
  // this case documents the consequence rather than letting it pass unnoticed.
  it("a fully-hatched map reporting suppressedCount 0 renders nothing — the defect this fix closes", () => {
    expect(
      buildAllSuppressedNotice({
        captionLayer: CAPTION,
        states: { cobertura: { active: true, loading: false, suppressedCount: 0 } },
        activeLayers: activeLayers(true, true),
        kpis: KPIS,
      }),
    ).toBeNull();
  });

  it("appends the scope aggregate from the layer's own headline KPI", () => {
    const notice = buildAllSuppressedNotice({
      captionLayer: CAPTION,
      states: { cobertura: { active: true, loading: false, suppressedCount: 3 } },
      activeLayers: activeLayers(true, true, true),
      kpis: KPIS,
    });
    expect(notice).toContain("Cobertura antirrábica: 61%");
  });
});
