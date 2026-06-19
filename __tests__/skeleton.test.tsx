// Tests for Wave 2 Item 8 — Loading & skeleton state components.
//
// Coverage:
//   1. <Skeleton> exposes aria-hidden (pure visual atom)
//   2. <OpKpiSkeleton> renders correctly
//   3. <OpCardSkeleton> respects the `rows` prop
//   4. <LnCardSkeleton> renders with ln-line token
//   5. loading.tsx files exist and expose aria-busy="true" + SR "Cargando…"
//      using <output> (semantic equivalent of role="status" per WAI-ARIA)
//   6. prefers-reduced-motion — the global CSS rule collapses the animation;
//      the shimmer class is present; JSDOM/CSS applies the media query at runtime
//
// Pattern: renderToStaticMarkup (same as existing UI tests in this repo).
// No e2e timing tests per spec.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LnCardSkeleton } from "@/components/ui/LnCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { OpCardSkeleton } from "@/components/ui/dashboard/OpCardSkeleton";
import { OpKpiSkeleton } from "@/components/ui/dashboard/OpKpiSkeleton";

import InicioLoading from "@/app/(app)/inicio/loading";
import PetProfileLoading from "@/app/(app)/mis-mascotas/[publicToken]/loading";
import AdoptarLoading from "@/app/(public)/adoptar/loading";
import CasoLoading from "@/app/(public)/casos/[publicCode]/loading";
import PublicPetLoading from "@/app/(public)/p/[publicToken]/loading";
import RefugioLoading from "@/app/(public)/refugios/[orgToken]/loading";
import AdminLoading from "@/app/admin/loading";
// Loading pages
import GobLoading from "@/app/gob/loading";
import VigilanciaLoading from "@/app/gob/vigilancia/loading";
import OrgLoading from "@/app/org/[orgToken]/loading";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

// ---------------------------------------------------------------------------
// Skeleton atom
// ---------------------------------------------------------------------------

describe("<Skeleton>", () => {
  it("renders a block element with shimmer class", () => {
    const html = render(<Skeleton />);
    expect(html).toContain("skeleton-shimmer");
  });

  it("is aria-hidden (pure visual)", () => {
    const html = render(<Skeleton />);
    expect(html).toContain('aria-hidden="true"');
  });

  it("applies custom w/h/radius via inline style", () => {
    const html = render(<Skeleton w="120px" h="20px" radius="8px" />);
    // React serializes inline styles without spaces: "width:120px"
    expect(html).toContain("width:120px");
    expect(html).toContain("height:20px");
    expect(html).toContain("border-radius:8px");
  });

  it("carries the shimmer class for CSS animation targeting", () => {
    const html = render(<Skeleton />);
    expect(html).toMatch(/skeleton-shimmer/);
  });
});

// ---------------------------------------------------------------------------
// Operator skeleton components
// ---------------------------------------------------------------------------

describe("<OpKpiSkeleton>", () => {
  it("renders without crashing", () => {
    const html = render(<OpKpiSkeleton />);
    expect(html.length).toBeGreaterThan(0);
  });

  it("is aria-hidden (visual atom — accessibility wrapper in loading.tsx)", () => {
    const html = render(<OpKpiSkeleton />);
    expect(html).toContain('aria-hidden="true"');
  });

  it("contains operator shimmer class", () => {
    const html = render(<OpKpiSkeleton />);
    expect(html).toMatch(/op-skeleton-shimmer/);
  });
});

describe("<OpCardSkeleton>", () => {
  it("renders with default rows", () => {
    const html = render(<OpCardSkeleton />);
    expect(html.length).toBeGreaterThan(0);
    // At minimum the header skeleton + body skeletons should be present
    const matches = html.match(/skeleton-shimmer/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders more elements with more rows", () => {
    const html2 = render(<OpCardSkeleton rows={2} />);
    const html6 = render(<OpCardSkeleton rows={6} />);
    const count2 = (html2.match(/skeleton-shimmer/g) ?? []).length;
    const count6 = (html6.match(/skeleton-shimmer/g) ?? []).length;
    expect(count6).toBeGreaterThan(count2);
  });

  it("contains operator shimmer class", () => {
    const html = render(<OpCardSkeleton />);
    expect(html).toMatch(/op-skeleton-shimmer/);
  });
});

// ---------------------------------------------------------------------------
// Owner skeleton component
// ---------------------------------------------------------------------------

describe("<LnCardSkeleton>", () => {
  it("renders without crashing", () => {
    const html = render(<LnCardSkeleton />);
    expect(html.length).toBeGreaterThan(0);
  });

  it("uses ln-line token (owner/public surface)", () => {
    const html = render(<LnCardSkeleton />);
    expect(html).toContain("color-ln-line");
  });

  it("does NOT use op-skeleton-shimmer class", () => {
    const html = render(<LnCardSkeleton />);
    expect(html).not.toMatch(/op-skeleton-shimmer/);
  });
});

// ---------------------------------------------------------------------------
// loading.tsx files — <output> element (implicit role="status") + aria-busy + SR text
// <output> is the semantic HTML element for status/live regions (WAI-ARIA).
// Biome lint/a11y/useSemanticElements enforces this over <div role="status">.
// ---------------------------------------------------------------------------

const loadingPages: [string, () => React.ReactElement][] = [
  ["GobLoading", () => <GobLoading />],
  ["AdminLoading", () => <AdminLoading />],
  ["OrgLoading", () => <OrgLoading />],
  ["VigilanciaLoading", () => <VigilanciaLoading />],
  ["InicioLoading", () => <InicioLoading />],
  ["PetProfileLoading", () => <PetProfileLoading />],
  ["PublicPetLoading", () => <PublicPetLoading />],
  ["AdoptarLoading", () => <AdoptarLoading />],
  ["RefugioLoading", () => <RefugioLoading />],
  ["CasoLoading", () => <CasoLoading />],
];

describe.each(loadingPages)("%s", (_name, factory) => {
  it("uses <output> element (semantic role=status for live regions)", () => {
    const html = render(factory());
    // <output> is the WAI-ARIA semantic element for role="status"
    expect(html).toMatch(/<output/);
  });

  it('has aria-busy="true"', () => {
    const html = render(factory());
    expect(html).toContain('aria-busy="true"');
  });

  it("includes SR-only Cargando… text", () => {
    const html = render(factory());
    expect(html).toContain("Cargando");
  });
});
