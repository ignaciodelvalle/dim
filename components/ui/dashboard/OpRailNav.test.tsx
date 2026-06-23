// D7 — OpRailNav deferred render (plan 2026-06-23-population-cycle-deferred-nav-handoff).
//
// A deferred NavItem renders as a NON-interactive <span> (no <Link>, no href,
// aria-disabled, not focusable, muted token + textual "Próximamente"), and never
// matches as active. A live item still renders a Next <Link> (<a href>).
//
// The rail uses usePathname(); we mock next/navigation (vi.hoisted so the mock
// factory can read a mutable path) and render with renderToStaticMarkup — the
// repo's component-test harness (no @testing-library/react dependency).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ path: "/admin/programa" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
}));

import { type NavSection, OpRailNav } from "@/components/ui/dashboard/OpRailNav";

function render(sections: NavSection[]): string {
  return renderToStaticMarkup(<OpRailNav sections={sections} variant="gob" />);
}

describe("OpRailNav — deferred items (D7)", () => {
  it("renders a live item as a Next <Link> (an <a href>)", () => {
    const html = render([
      {
        label: "Analítica",
        items: [{ href: "/admin/programa", label: "Programa", matchPrefix: "/admin/programa" }],
      },
    ]);
    expect(html).toContain('href="/admin/programa"');
    expect(html).toContain("Programa");
  });

  it("renders a deferred item as a non-interactive <span>: no href, aria-disabled, 'Próximamente'", () => {
    const html = render([
      {
        label: "Analítica",
        items: [
          { href: "#defer-control-poblacional", label: "Control poblacional", deferred: true },
        ],
      },
    ]);
    // No anchor / no href for the deferred sentinel.
    expect(html).not.toContain('href="#defer-control-poblacional"');
    expect(html).not.toContain("<a ");
    // State announced without relying on color: aria-disabled + textual pill.
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Próximamente");
    expect(html).toContain("Control poblacional");
  });

  it("deferred item is not focusable and uses the muted rail token (state not by color alone)", () => {
    const html = render([
      {
        label: "Analítica",
        items: [{ href: "#defer-custodia-transito", label: "Custodia & tránsito", deferred: true }],
      },
    ]);
    // A plain <span> with no tabindex is out of the tab order by default.
    expect(html).not.toContain("tabindex");
    expect(html).toContain("text-ln-op-rail-mute");
  });

  it("deferred item never matches as active, even when pathname equals its sentinel href", () => {
    nav.path = "#defer-control-poblacional";
    const html = render([
      {
        label: "Analítica",
        items: [
          { href: "#defer-control-poblacional", label: "Control poblacional", deferred: true },
        ],
      },
    ]);
    expect(html).not.toContain('aria-current="page"');
    nav.path = "/admin/programa"; // reset for any later test
  });
});
