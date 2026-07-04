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
//
// Removed (task #43 dedupe, 2026-07-04): LostCaseBlock's header used to
// render its own "Marcar encontrada" button alongside an identical
// always-visible icon in PetActionRow (same ?sheet=marcar-encontrada
// target). The header copy was dropped to fix the duplication; the sole
// surviving control is PetActionRow's icon, whose 44px touch target is
// already covered by the "PetActionRow" describe block below.
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

// ---------------------------------------------------------------------------
// AppCitizenMasthead — hamburger / bell / anon login CTA (native-mobile
// audit 2026-07-04 §9: hamburger was 40px, bell ~18px, login CTA 36px).
// Drawer rows are not asserted here: vaul portals don't render in static
// markup while the drawer is closed.
// ---------------------------------------------------------------------------

import { AppCitizenMasthead } from "@/components/layout/AppCitizenMasthead";

describe("AppCitizenMasthead — 44px masthead controls (native-mobile audit §9)", () => {
  it("hamburger trigger and notification bell carry min-h-11 AND min-w-11", () => {
    const html = renderToStaticMarkup(
      <AppCitizenMasthead
        nav={[{ href: "/inicio", label: "Inicio", matchPrefix: "/inicio" }]}
        user={{ name: "Ana", initials: "AN" }}
        unreadCount={2}
      />,
    );

    const hamburger = html.match(/<button[^>]*aria-label="Abrir menú"[^>]*>/)?.[0];
    expect(hamburger).toBeDefined();
    expect(hamburger).toContain("min-h-11");
    expect(hamburger).toContain("min-w-11");

    const bell = html.match(/<a[^>]*aria-label="Notificaciones[^"]*"[^>]*>/)?.[0];
    expect(bell).toBeDefined();
    expect(bell).toContain("min-h-11");
    expect(bell).toContain("min-w-11");
  });

  it("anonymous login CTA is min-h-11, no longer min-h-[36px]", () => {
    const html = renderToStaticMarkup(<AppCitizenMasthead nav={[]} user={null} />);
    const login = html.match(/<a[^>]*href="\/login"[^>]*>/)?.[0];
    expect(login).toBeDefined();
    expect(login).toContain("min-h-11");
    expect(html).not.toContain("min-h-[36px]");
  });
});

// ---------------------------------------------------------------------------
// CitizenTabBar — bottom tabs must each clear 44px (min-h-12 = 48px).
// ---------------------------------------------------------------------------

import { CitizenTabBar } from "@/components/layout/CitizenTabBar";
import { OWNER_NAV } from "@/components/layout/nav-presets";

describe("CitizenTabBar — 44px tab targets", () => {
  it("all owner tabs render as links with min-h-12", () => {
    const html = renderToStaticMarkup(<CitizenTabBar nav={OWNER_NAV} />);
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBe(OWNER_NAV.length);
    for (const anchor of anchors) {
      expect(anchor).toContain("min-h-12");
    }
  });
});
