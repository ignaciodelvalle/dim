// CitizenTabBar — "Asentar" retarget (owner-ia-redesign P4 + P5).
//
// On a pet-profile route the pet is already known, so the tab-bar capture
// action points at THAT pet's ?sheet=anotar; everywhere else it points at
// /inicio?sheet=anotar (P5: the /inicio home capture card is gone — /inicio now
// server-redirects to the most-urgent pet's credential AND forwards the sheet
// param, so anotar opens in one hop). usePathname is mocked so
// renderToStaticMarkup (repo convention — no jsdom) can drive each route.
//
// Note: the fallback href starts with "/inicio", which is also the "Inicio" nav
// tab's own href, so we can't assert on the raw substring alone — asentarHref()
// isolates the capture button by its unique "Asentar" label to read its true
// target.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { current: null as string | null } }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

import { CitizenTabBar } from "@/components/layout/CitizenTabBar";
import { OWNER_NAV } from "@/components/layout/nav-presets";

function renderAt(pathname: string | null): string {
  pathnameRef.current = pathname;
  return renderToStaticMarkup(<CitizenTabBar nav={OWNER_NAV} />);
}

/** The href of the capture button — the anchor whose label text is "Asentar".
 * Attribute order in the rendered markup is not stable (an active nav item gets
 * an extra aria-current, which shifts class ahead of href), so href is matched
 * anywhere inside the anchor's own segment rather than at its start. */
function asentarHref(html: string): string | null {
  for (const seg of html.split(/<a /).slice(1)) {
    if (/>Asentar</.test(seg)) {
      const m = seg.match(/href="([^"]*)"/);
      return m ? m[1] : null;
    }
  }
  return null;
}

describe("CitizenTabBar — Asentar retarget on pet-profile routes", () => {
  it("retargets to the current pet's ?sheet=anotar on a profile route", () => {
    const html = renderAt("/mis-mascotas/DIM-PAMP-0001");
    expect(asentarHref(html)).toBe("/mis-mascotas/DIM-PAMP-0001?sheet=anotar");
  });

  it("retargets from a profile SUB-route too (same pet's anotar)", () => {
    const html = renderAt("/mis-mascotas/DIM-PAMP-0001/libreta");
    expect(asentarHref(html)).toBe("/mis-mascotas/DIM-PAMP-0001?sheet=anotar");
  });

  it("falls back to /inicio?sheet=anotar on the index route (one-hop capture)", () => {
    expect(asentarHref(renderAt("/mis-mascotas"))).toBe("/inicio?sheet=anotar");
  });

  it("falls back to /inicio?sheet=anotar on reserved index children (nueva, reclamar-dni)", () => {
    expect(asentarHref(renderAt("/mis-mascotas/nueva"))).toBe("/inicio?sheet=anotar");
    expect(asentarHref(renderAt("/mis-mascotas/reclamar-dni"))).toBe("/inicio?sheet=anotar");
  });

  it("falls back to /inicio?sheet=anotar elsewhere and when the pathname is unavailable", () => {
    expect(asentarHref(renderAt("/inicio"))).toBe("/inicio?sheet=anotar");
    expect(asentarHref(renderAt(null))).toBe("/inicio?sheet=anotar");
  });
});
