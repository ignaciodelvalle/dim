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

// PetQuickActions — 44px touch-target coverage removed with the component
// itself (two-face redesign, 2026-07-01, Phase 4: PetQuickActions was
// replaced by the Anotar CTA + action row on the pet-profile Credencial
// face; no remaining caller — see design deletion list + apply-progress).

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

// ---------------------------------------------------------------------------
// LostCaseBlock — Marcar encontrada button (pet-document-redesign S2, NFR-3)
// ---------------------------------------------------------------------------

import { LostCaseBlock, type LostCaseBlockPet } from "@/components/pet-profile/LostCaseBlock";

const lostCaseBlockPet: LostCaseBlockPet = {
  id: "pet-1",
  name: "Firulais",
  publicToken: "abc123",
  sex: "male",
  discloseFirstNameWhenLost: true,
  disclosePhoneWhenLost: false,
  discloseEmailWhenLost: false,
  discloseLastLocationWhenLost: true,
  allowFinderFormWhenLost: true,
};

const lostCaseBlockEpisode = {
  id: "ep-1",
  publicCode: "LOS-00042",
  openedAt: new Date("2026-06-20T10:00:00Z"),
  jurisdictionLocality: "La Plata",
  placeName: "Plaza Italia",
  ownerNote: null,
  sightingsCount: 0,
  lastSeenLat: null,
  lastSeenLng: null,
};

describe("LostCaseBlock — Marcar encontrada button uses min-h-11 (44px, UX 2.1 / NFR-3)", () => {
  it("owner variant's Marcar encontrada button carries min-h-11", () => {
    const html = renderToStaticMarkup(
      <LostCaseBlock
        pet={lostCaseBlockPet}
        photoUrl={null}
        episode={lostCaseBlockEpisode}
        scans={[]}
        ownerFirstName="Ana"
        isOwner={true}
      />,
    );
    expect(html).toContain("min-h-11");
  });
});

// ---------------------------------------------------------------------------
// PetActionRow — icon-only 5-icon bar at 320px (pet-document-redesign
// ADR-12b/ADR-17b, Phase 4). Full coverage lives in
// components/pet-profile/PetActionRow.test.tsx; this asserts the
// cross-cutting 44px invariant this sweep exists to guard.
// ---------------------------------------------------------------------------

import { PetActionRow } from "@/components/pet-profile/PetActionRow";

describe("PetActionRow — 5-icon bar clears 44px at 320px (UX 2.1)", () => {
  it("all 5 icon links (owner, active) carry min-h-11 AND min-w-11", () => {
    const html = renderToStaticMarkup(
      <PetActionRow petPublicToken="abc" isOwner isDeceased={false} petStatus="active" />,
    );
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    // 5 × 44px + gap-2 (8px) × 4 = 220 + 32 = 252px, fits inside 320px with
    // the page's own px-4 (16px) gutters on each side (252 + 32 = 284 ≤ 320).
    expect(anchors.length).toBe(5);
    for (const anchor of anchors) {
      expect(anchor).toContain("min-h-11");
      expect(anchor).toContain("min-w-11");
    }
  });
});
