// D2 — DemoModeBanner tests.
//
// Tests the pure shouldShowDemoBanner helper (flag on → true; flag off → false)
// and the DemoModeBanner component (renders/hides based on the enabled prop).
// Uses renderToStaticMarkup (the repo's component-test harness — no jsdom).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoModeBanner, shouldShowDemoBanner } from "@/components/ui/DemoModeBanner";

describe("shouldShowDemoBanner()", () => {
  it('returns true when env value is "true"', () => {
    expect(shouldShowDemoBanner("true")).toBe(true);
  });

  it("returns false when env value is undefined", () => {
    expect(shouldShowDemoBanner(undefined)).toBe(false);
  });

  it('returns false when env value is "false"', () => {
    expect(shouldShowDemoBanner("false")).toBe(false);
  });

  it("returns false for any other value", () => {
    expect(shouldShowDemoBanner("1")).toBe(false);
    expect(shouldShowDemoBanner("yes")).toBe(false);
    expect(shouldShowDemoBanner("")).toBe(false);
  });
});

describe("DemoModeBanner component", () => {
  it("renders the banner when enabled=true", () => {
    const html = renderToStaticMarkup(<DemoModeBanner enabled={true} />);
    // <output> is an implicit status live region (semantic, lint-clean).
    expect(html).toContain("<output");
    expect(html).toContain("Entorno de demostración — datos sintéticos");
  });

  it("renders nothing when enabled=false", () => {
    const html = renderToStaticMarkup(<DemoModeBanner enabled={false} />);
    expect(html).toBe("");
  });

  it("banner is not hideable when enabled (no display:none / visibility:hidden)", () => {
    const html = renderToStaticMarkup(<DemoModeBanner enabled={true} />);
    expect(html).not.toContain("display:none");
    expect(html).not.toContain("visibility:hidden");
  });
});
