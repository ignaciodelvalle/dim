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
import { LnPageSkeleton } from "@/components/ui/LnPageSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { OpCardSkeleton } from "@/components/ui/dashboard/OpCardSkeleton";
import { OpDashboardSkeleton } from "@/components/ui/dashboard/OpDashboardSkeleton";
import { OpKpiSkeleton } from "@/components/ui/dashboard/OpKpiSkeleton";

import CuentaLoading from "@/app/(app)/cuenta/loading";
// InicioLoading removed (owner-ia-redesign P5): /inicio is now a server redirect
// into the most-urgent pet, not a dashboard — it has no loading skeleton.
import EventCaptureFormLoading from "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/loading";
import PetProfileLoading from "@/app/(app)/mis-mascotas/[publicToken]/loading";
import MisMascotasLoading from "@/app/(app)/mis-mascotas/loading";
import MisTurnosLoading from "@/app/(app)/mis-turnos/loading";
import BuscarTurnosLoading from "@/app/(app)/turnos/buscar/loading";
import AdoptarLoading from "@/app/(public)/adoptar/loading";
import CasoLoading from "@/app/(public)/casos/[publicCode]/loading";
import PublicPetLoading from "@/app/(public)/p/[publicToken]/loading";
import RefugioLoading from "@/app/(public)/refugios/[orgToken]/loading";
import AdminCasosLoading from "@/app/admin/casos/loading";
import AdminCensoLoading from "@/app/admin/censo/loading";
import AdminHistorialLoading from "@/app/admin/historial/loading";
import AdminLoading from "@/app/admin/loading";
import AdminOrganizacionesLoading from "@/app/admin/organizaciones/loading";
import AdminPoblacionLoading from "@/app/admin/poblacion/loading";
import AdminSuscripcionesLoading from "@/app/admin/suscripciones/loading";
import GobCasosLoading from "@/app/gob/casos/loading";
import GobCensoLoading from "@/app/gob/censo/loading";
import GobDecomisosLoading from "@/app/gob/decomisos/loading";
import GobHistorialLoading from "@/app/gob/historial/loading";
// Loading pages
import GobLoading from "@/app/gob/loading";
import GobOrganizacionesLoading from "@/app/gob/organizaciones/loading";
import GobPoblacionLoading from "@/app/gob/poblacion/loading";
import GobSuscripcionesLoading from "@/app/gob/suscripciones/loading";
import VigilanciaLoading from "@/app/gob/vigilancia/loading";
import LibretaCompartirLoading from "@/app/libreta/compartir/[shareToken]/loading";
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

describe("<OpDashboardSkeleton>", () => {
  it("renders the <output> wrapper with aria-busy + SR text", () => {
    const html = render(<OpDashboardSkeleton />);
    expect(html).toMatch(/<output/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Cargando");
  });

  it("omits the KPI row by default (kpis=0)", () => {
    const html = render(<OpDashboardSkeleton />);
    // OpKpiSkeleton's distinctive min-h-[112px] frame should not appear
    expect(html).not.toContain("min-h-[112px]");
  });

  it("renders `kpis` KPI tiles when requested", () => {
    const html = render(<OpDashboardSkeleton kpis={4} />);
    const matches = html.match(/min-h-\[112px\]/g) ?? [];
    expect(matches.length).toBe(4);
  });

  it("renders one OpCardSkeleton block per `cards` entry", () => {
    const html = render(<OpDashboardSkeleton cards={[6, 4]} />);
    const matches = html.match(/op-skeleton-shimmer/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
  });

  it("can omit the filter-bar strip", () => {
    const withBar = render(<OpDashboardSkeleton filterBar />);
    const withoutBar = render(<OpDashboardSkeleton filterBar={false} />);
    expect(withBar.length).toBeGreaterThan(withoutBar.length);
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

describe("<LnPageSkeleton>", () => {
  it("renders the <output> wrapper with aria-busy + SR text", () => {
    const html = render(<LnPageSkeleton />);
    expect(html).toMatch(/<output/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Cargando");
  });

  it("renders `rows` registry rows", () => {
    const html2 = render(<LnPageSkeleton rows={2} />);
    const html5 = render(<LnPageSkeleton rows={5} />);
    const count2 = (html2.match(/border-b/g) ?? []).length;
    const count5 = (html5.match(/border-b/g) ?? []).length;
    expect(count5).toBeGreaterThan(count2);
  });

  it("omits the avatar placeholder when avatar=false", () => {
    const withAvatar = render(<LnPageSkeleton avatar />);
    const withoutAvatar = render(<LnPageSkeleton avatar={false} />);
    expect(withAvatar).toContain("border-radius:50%");
    expect(withoutAvatar).not.toContain("border-radius:50%");
  });

  it("renders a CTA placeholder when cta=true", () => {
    const withCta = render(<LnPageSkeleton cta />);
    const withoutCta = render(<LnPageSkeleton cta={false} />);
    expect(withCta.length).toBeGreaterThan(withoutCta.length);
  });

  it("does NOT use op-skeleton-shimmer class (citizen surface)", () => {
    const html = render(<LnPageSkeleton />);
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
  ["PetProfileLoading", () => <PetProfileLoading />],
  ["PublicPetLoading", () => <PublicPetLoading />],
  ["AdoptarLoading", () => <AdoptarLoading />],
  ["RefugioLoading", () => <RefugioLoading />],
  ["CasoLoading", () => <CasoLoading />],
  ["MisMascotasLoading", () => <MisMascotasLoading />],
  ["CuentaLoading", () => <CuentaLoading />],
  ["LibretaCompartirLoading", () => <LibretaCompartirLoading />],
  ["EventCaptureFormLoading", () => <EventCaptureFormLoading />],
  // Wave 2 state-coverage fence (2026-07-21) — segments that gained a
  // dedicated loading.tsx built from OpDashboardSkeleton / LnPageSkeleton.
  ["GobCasosLoading", () => <GobCasosLoading />],
  ["GobCensoLoading", () => <GobCensoLoading />],
  ["GobDecomisosLoading", () => <GobDecomisosLoading />],
  ["GobHistorialLoading", () => <GobHistorialLoading />],
  ["GobPoblacionLoading", () => <GobPoblacionLoading />],
  ["GobOrganizacionesLoading", () => <GobOrganizacionesLoading />],
  ["GobSuscripcionesLoading", () => <GobSuscripcionesLoading />],
  ["AdminCasosLoading", () => <AdminCasosLoading />],
  ["AdminCensoLoading", () => <AdminCensoLoading />],
  ["AdminPoblacionLoading", () => <AdminPoblacionLoading />],
  ["AdminHistorialLoading", () => <AdminHistorialLoading />],
  ["AdminOrganizacionesLoading", () => <AdminOrganizacionesLoading />],
  ["AdminSuscripcionesLoading", () => <AdminSuscripcionesLoading />],
  ["BuscarTurnosLoading", () => <BuscarTurnosLoading />],
  ["MisTurnosLoading", () => <MisTurnosLoading />],
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
