// Structure test — MarkLostWizard affirmative disclosure step (privacy
// hardening 2026-07-04, Ley 25.326 consent gap).
//
// Rendering strategy mirrors the repo's other component structure tests:
// react-dom/server → static HTML string, no jsdom.
//
// Contract:
//   - The wizard ALWAYS submits explicit disclosure values via hidden inputs
//     (so setPetLostAction never falls back to the permissive DB defaults).
//   - Owner-PII toggles (first name, phone, email, last location) default to
//     "false" — affirmative opt-in, not opt-out.
//   - The finder form (no owner PII) defaults to "true".
//   - The disclosure step is part of the step labels.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// LocationFields relies on hooks and dynamic imports; stub it for SSR render.
vi.mock("@/components/LocationFields", () => ({
  LocationFields: () => React.createElement("div", { "data-testid": "location-fields" }),
}));

import { MarkLostWizard } from "@/app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard";

const BASE_PROPS = {
  action: vi.fn(async () => ({ error: null })),
  petName: "Luna",
  petPublicToken: "DIM-TEST-0001",
  petHasMicrochip: true,
  petHasTattoo: false,
  petColor: null,
  petDistinguishingFeatures: null,
  petJurisdictionProvince: null,
  petJurisdictionLocality: null,
};

function hiddenInputValue(html: string, name: string): string | null {
  const match = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`));
  return match ? match[1] : null;
}

describe("MarkLostWizard — affirmative disclosure consent", () => {
  it("always submits explicit disclosure values with PII toggles OFF by default", () => {
    const html = renderToStaticMarkup(<MarkLostWizard {...BASE_PROPS} />);

    // Owner PII: affirmative opt-in — defaults are "false".
    expect(hiddenInputValue(html, "disclose_first_name_when_lost")).toBe("false");
    expect(hiddenInputValue(html, "disclose_phone_when_lost")).toBe("false");
    expect(hiddenInputValue(html, "disclose_email_when_lost")).toBe("false");
    expect(hiddenInputValue(html, "disclose_last_location_when_lost")).toBe("false");
    // Finder form exposes no owner data — stays available by default.
    expect(hiddenInputValue(html, "allow_finder_form_when_lost")).toBe("true");
  });

  it("includes the disclosure step in the flow (chip/tattoo pets: 2 steps)", () => {
    const html = renderToStaticMarkup(<MarkLostWizard {...BASE_PROPS} />);
    expect(html).toContain("Paso 1 de 2");
  });

  it("includes the disclosure step after the details step (no chip/tattoo: 3 steps)", () => {
    const html = renderToStaticMarkup(
      <MarkLostWizard {...BASE_PROPS} petHasMicrochip={false} petHasTattoo={false} />,
    );
    expect(html).toContain("Paso 1 de 3");
  });

  it("renders the affirmative consent copy and the five disclosure toggles", () => {
    const html = renderToStaticMarkup(<MarkLostWizard {...BASE_PROPS} />);
    expect(html).toContain("No se comparte nada que no actives ac");
    expect(html).toContain("Tu nombre");
    expect(html).toContain("Tu tel");
    expect(html).toContain("Tu email");
    expect(html).toContain("ltima ubicaci");
    expect(html).toContain("Formulario para avisarte");
  });
});
