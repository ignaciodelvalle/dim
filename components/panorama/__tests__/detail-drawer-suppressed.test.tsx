// @vitest-environment jsdom
//
// v+1 map review finding #1 (honesty) — clicking a k-anon-suppressed division
// must open the DetailDrawer with the PROTECTED copy, never a bogus "0".
//
// Before the fix, SituationalMap's division click handler passed
// `suppressed: false` unconditionally, so a hatched (protected) barrio rendered
// `String(value ?? 0)` === "0" — indistinguishable from a genuine zero and a
// privacy-honesty regression. The handler now forwards the REAL suppressed state
// (the same set the hatch layer + hover popup read); this test guards the drawer
// end of that contract: given a suppressed division payload, the body shows the
// "Suprimido (privacidad · k‑anon)" branch and never "0".
//
// Testing FeatureBody in isolation (not the full DetailDrawer) avoids the native
// <dialog>.showModal() jsdom gap and the unit-history fetch (which only fires
// when the payload carries a `province` — division clicks never do).

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeatureBody } from "@/components/panorama/DetailDrawer";

vi.mock("next/navigation", () => ({
  usePathname: () => "/gob/panorama",
}));

afterEach(cleanup);

// The exact shape the (fixed) SituationalMap division click handler emits for a
// suppressed division: locality name, no value, level "locality", suppressed true.
const suppressedDivisionPayload = {
  locality: "Palermo",
  departmentName: "Palermo",
  value: null,
  level: "locality",
  suppressed: true,
} as const;

describe("DetailDrawer FeatureBody — suppressed division (finding #1)", () => {
  it("renders the k-anon protected copy, never '0', for a suppressed cobertura cell", () => {
    render(<FeatureBody layerId="cobertura" properties={{ ...suppressedDivisionPayload }} />);

    // Honest privacy copy — mirrors the suppressed-point drawer branch.
    expect(screen.getByText(/Suprimido \(privacidad · k‑anon\)/)).toBeInTheDocument();
    // The regression sentinel: a suppressed cell must NEVER surface a count.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("still shows the real value for a NON-suppressed division (no over-suppression)", () => {
    render(
      <FeatureBody
        layerId="cobertura"
        properties={{
          locality: "Palermo",
          departmentName: "Palermo",
          value: 42,
          level: "locality",
          suppressed: false,
        }}
      />,
    );

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByText(/Suprimido/)).not.toBeInTheDocument();
  });
});
