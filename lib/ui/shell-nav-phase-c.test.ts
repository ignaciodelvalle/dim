// Phase C tests — the stranded-user invariant at the citizen layout boundary.
//
// This is the HEADLINE behavior of Item 7: a logged-in OWNER who lands on a
// PUBLIC surface (/adoptar, /refugios, /denuncias) must ALWAYS keep their role
// chrome — citizen variant + OWNER_NAV, never PUBLIC_NAV — AND get a guaranteed
// ≤1-click return to their role home. resolveShellNav is the pure encoding of
// that rule (D3/D4); these tests pin it directly and also assert the exact
// selection the (public)/layout.tsx boundary makes (citizen nav vs PUBLIC_NAV).
//
// Pure module, no React, no DB.

import { OWNER_NAV, PUBLIC_NAV } from "@/components/layout/nav-presets";
import { type ShellNavResult, type ShellSession, resolveShellNav } from "@/lib/ui/shell-nav";
import { describe, expect, it } from "vitest";

const OWNER: ShellSession = { role: "owner", displayName: "Ana Pérez" };

// Mirror the nav the (public)/layout.tsx boundary actually renders in the
// citizen masthead: role nav for the citizen variant, PUBLIC_NAV otherwise.
function mastheadNavFor(result: ShellNavResult) {
  return result.variant === "citizen" ? result.nav : PUBLIC_NAV;
}

// ---------------------------------------------------------------------------
// The stranded invariant: owner on every public browse surface.
// ---------------------------------------------------------------------------

describe("Phase C — stranded-user invariant (owner on public surfaces)", () => {
  const PUBLIC_SURFACES = ["/adoptar", "/refugios", "/denuncias", "/perdidas"] as const;

  for (const path of PUBLIC_SURFACES) {
    it(`owner on ${path} → citizen + OWNER_NAV (never PUBLIC_NAV) + a 1-click return`, () => {
      const r = resolveShellNav({ session: OWNER, pathname: path });

      // 1. Keeps the citizen role chrome.
      expect(r.variant).toBe("citizen");

      // 2. Keeps the role nav — the public surface NEVER replaces it.
      expect(r.nav).toBe(OWNER_NAV);
      expect(r.nav).not.toBe(PUBLIC_NAV);

      // 3. And the layout boundary renders exactly that role nav in the masthead.
      expect(mastheadNavFor(r)).toBe(OWNER_NAV);

      // 4. Guaranteed ≤1-click return to the role home (D4) — since wave-3 P6
      //    the return IS the nav's own Inicio item (no separate chip, which
      //    would duplicate it; see shell-nav.test.ts "NO separate return
      //    chip"). The invariant holds as long as OWNER_NAV renders Inicio.
      expect(r.showReturn).toBe(false);
      expect(r.nav.some((i) => i.label === "Inicio" && i.href === "/inicio")).toBe(true);
    });
  }

  it("owner on /inicio (their home) → citizen + OWNER_NAV, no redundant return", () => {
    const r = resolveShellNav({ session: OWNER, pathname: "/inicio" });
    expect(r.variant).toBe("citizen");
    expect(r.nav).toBe(OWNER_NAV);
    expect(r.showReturn).toBe(false);
  });

  it("anonymous visitor on /adoptar → citizen + PUBLIC_NAV, no return", () => {
    const r = resolveShellNav({ session: null, pathname: "/adoptar" });
    expect(r.variant).toBe("citizen");
    expect(r.nav).toBe(PUBLIC_NAV);
    expect(mastheadNavFor(r)).toBe(PUBLIC_NAV);
    expect(r.showReturn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Operator-on-public at the (public) boundary: the layout cannot render the
// operator left-rail, so it shows PUBLIC_NAV but MUST still surface the
// resolver's guaranteed return (D4) so an operator is never dead-ended either.
// ---------------------------------------------------------------------------

describe("Phase C — operator wandering onto a public surface keeps a return", () => {
  it("govt on /adoptar → masthead shows PUBLIC_NAV but a return to /mis-mascotas is guaranteed", () => {
    const r = resolveShellNav({
      session: { role: "govt", displayName: "Inspectora" },
      pathname: "/adoptar",
    });
    // Resolver keeps them in the operator variant with an escape hatch…
    expect(r.variant).toBe("operator");
    expect(r.showReturn).toBe(true);
    expect(r.returnHref).toBe("/mis-mascotas");
    // …and the (public) top-bar falls back to PUBLIC_NAV (no operator hrefs in a
    // citizen masthead), never silently dropping the return.
    expect(mastheadNavFor(r)).toBe(PUBLIC_NAV);
  });
});
