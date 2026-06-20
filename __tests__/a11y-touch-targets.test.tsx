/**
 * 2.1 — Touch target tests (44px / min-h-11).
 *
 * Asserts that interactive controls in the specified components render with
 * `min-h-11` (44px) and no longer use the old `min-h-9` (36px) class.
 *
 * Pattern: react-dom/server renderToStaticMarkup (repo convention — no jsdom).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// PetQuickActions
// ---------------------------------------------------------------------------

import { PetQuickActions } from "@/components/pet-profile/PetQuickActions";

describe("PetQuickActions — 44px touch targets (UX 2.1)", () => {
  it("active-status links use min-h-11 and not min-h-9", () => {
    const html = renderToStaticMarkup(
      <PetQuickActions petPublicToken="TK" petStatus="active" preferredVetPhone="123" />,
    );
    expect(html).not.toContain("min-h-9");
    expect(html).toContain("min-h-11");
  });

  it("lost-status links use min-h-11", () => {
    const html = renderToStaticMarkup(
      <PetQuickActions petPublicToken="TK" petStatus="lost" preferredVetPhone={null} />,
    );
    expect(html).not.toContain("min-h-9");
    expect(html).toContain("min-h-11");
  });

  it("disabled vet phone span uses min-h-11", () => {
    const html = renderToStaticMarkup(
      <PetQuickActions petPublicToken="TK" petStatus="active" preferredVetPhone={null} />,
    );
    expect(html).not.toContain("min-h-9");
    expect(html).toContain("min-h-11");
  });
});

// ---------------------------------------------------------------------------
// LnWizardShell — back button
// ---------------------------------------------------------------------------

import { LnWizardShell } from "@/components/ui/WizardShell";

describe("LnWizardShell — 44px back button (UX 2.1)", () => {
  it("back button uses h-11 w-11 and not h-9 w-9", () => {
    const html = renderToStaticMarkup(
      <LnWizardShell currentStep={2} totalSteps={3} onBack={() => {}}>
        <p>content</p>
      </LnWizardShell>,
    );
    // The old class h-9 must be gone; h-11 must be present on the button.
    expect(html).not.toContain("h-9");
    expect(html).toContain("h-11");
  });
});

// ---------------------------------------------------------------------------
// OpRailNav — nav links
// ---------------------------------------------------------------------------

import { OpRailNav } from "@/components/ui/dashboard/OpRailNav";

// OpRailNav uses usePathname — stub it.
vi.mock("next/navigation", () => ({
  usePathname: () => "/gob/dashboard",
}));

describe("OpRailNav — 44px nav links (UX 2.1)", () => {
  it("nav links use min-h-11 and not min-h-9", () => {
    const html = renderToStaticMarkup(
      <OpRailNav nav={[{ href: "/gob/dashboard", label: "Dashboard" }]} />,
    );
    expect(html).not.toContain("min-h-9");
    expect(html).toContain("min-h-11");
  });
});
