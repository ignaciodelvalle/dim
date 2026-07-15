// CitizenTabBar — "Asentar" retarget (owner-ia-redesign P4).
//
// On a pet-profile route the pet is already known, so the tab-bar capture
// action points at THAT pet's ?sheet=anotar; everywhere else it keeps deep-
// linking to the home capture card (/inicio#asentar). usePathname is mocked so
// renderToStaticMarkup (repo convention — no jsdom) can drive each route.

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

describe("CitizenTabBar — Asentar retarget on pet-profile routes", () => {
  it("retargets to the current pet's ?sheet=anotar on a profile route", () => {
    const html = renderAt("/mis-mascotas/DIM-PAMP-0001");
    expect(html).toContain('href="/mis-mascotas/DIM-PAMP-0001?sheet=anotar"');
    expect(html).not.toContain('href="/inicio#asentar"');
  });

  it("retargets from a profile SUB-route too (same pet's anotar)", () => {
    const html = renderAt("/mis-mascotas/DIM-PAMP-0001/libreta");
    expect(html).toContain('href="/mis-mascotas/DIM-PAMP-0001?sheet=anotar"');
  });

  it("keeps /inicio#asentar on the index route", () => {
    expect(renderAt("/mis-mascotas")).toContain('href="/inicio#asentar"');
  });

  it("keeps /inicio#asentar on reserved index children (nueva, reclamar-dni)", () => {
    expect(renderAt("/mis-mascotas/nueva")).toContain('href="/inicio#asentar"');
    expect(renderAt("/mis-mascotas/reclamar-dni")).toContain('href="/inicio#asentar"');
  });

  it("keeps /inicio#asentar elsewhere and when the pathname is unavailable", () => {
    expect(renderAt("/inicio")).toContain('href="/inicio#asentar"');
    expect(renderAt(null)).toContain('href="/inicio#asentar"');
  });
});
