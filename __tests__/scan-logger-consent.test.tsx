// Structure test — ScanLogger consent prompt (Task #45).
//
// Rendering strategy mirrors the repo's other component structure tests:
// react-dom/server → static HTML string, no jsdom. useEffect does not run
// under renderToStaticMarkup, so no scan is fired here — the action module is
// mocked out entirely.
//
// Contract:
//   - Non-lost pets render NOTHING (no location prompt ever).
//   - Lost pets render the visible es-AR consent copy with the pet's name and
//     an explicit share button + a decline button (GPS only on explicit grant).

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/scans", () => ({
  logScanAction: vi.fn(async () => undefined),
}));

import { ScanLogger } from "@/app/(public)/p/[publicToken]/ScanLogger";

describe("ScanLogger — location-consent prompt", () => {
  it("renders nothing for a non-lost pet", () => {
    const html = renderToStaticMarkup(<ScanLogger publicToken="DIM-TEST-0001" />);
    expect(html).toBe("");
  });

  it("renders the visible consent copy with the pet name for a lost pet", () => {
    const html = renderToStaticMarkup(
      <ScanLogger publicToken="DIM-TEST-0001" isLost petName="Luna" />,
    );
    expect(html).toContain("Compartí tu ubicación para ayudar a encontrar a Luna");
    expect(html).toContain("Compartir mi ubicación");
    expect(html).toContain("Ahora no");
    // Transparency copy: anonymity promise is shown to the finder.
    expect(html).toContain("No guardamos quién sos");
  });

  it("falls back to generic copy when the pet name is missing", () => {
    const html = renderToStaticMarkup(<ScanLogger publicToken="DIM-TEST-0001" isLost />);
    expect(html).toContain("Compartí tu ubicación para ayudar a encontrar a esta mascota");
  });
});
