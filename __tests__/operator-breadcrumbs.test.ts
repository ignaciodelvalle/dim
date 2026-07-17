import { deriveOperatorCrumbs } from "@/lib/ui/operator-breadcrumbs";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// GOB portal
// ---------------------------------------------------------------------------

describe("deriveOperatorCrumbs — gob portal", () => {
  it("returns a single unlinked root crumb on the portal root", () => {
    const crumbs = deriveOperatorCrumbs("/gob", "gob");
    expect(crumbs).toEqual([{ label: "Panel" }]);
    // Root crumb has NO href when on the root itself.
    expect(crumbs[0]).not.toHaveProperty("href");
  });

  it("returns two crumbs on a known section route", () => {
    const crumbs = deriveOperatorCrumbs("/gob/vigilancia", "gob");
    expect(crumbs).toHaveLength(2);
    // First crumb links to portal root.
    expect(crumbs[0]).toEqual({ label: "Panel", href: "/gob" });
    // Second crumb is the current section (no link — current page).
    expect(crumbs[1]).toEqual({ label: "Vigilancia" });
    expect(crumbs[1]).not.toHaveProperty("href");
  });

  it("maps /gob/maltrato to the nav label 'Maltrato'", () => {
    const crumbs = deriveOperatorCrumbs("/gob/maltrato", "gob");
    expect(crumbs[1]).toEqual({ label: "Maltrato" });
  });

  it("maps /gob/mortalidad to 'Mortalidad'", () => {
    const crumbs = deriveOperatorCrumbs("/gob/mortalidad", "gob");
    expect(crumbs[1]).toEqual({ label: "Mortalidad" });
  });

  it("maps /gob/organizaciones to 'Organizaciones'", () => {
    const crumbs = deriveOperatorCrumbs("/gob/organizaciones", "gob");
    expect(crumbs[1]).toEqual({ label: "Organizaciones" });
  });

  it("maps /gob/servicios to 'Servicios' (nav preset label)", () => {
    const crumbs = deriveOperatorCrumbs("/gob/servicios", "gob");
    expect(crumbs[1]).toEqual({ label: "Servicios" });
  });

  it("maps /gob/vigilancia/investigaciones to 'Investigaciones' (static segment, not Detalle)", () => {
    const crumbs = deriveOperatorCrumbs("/gob/vigilancia/investigaciones", "gob");
    expect(crumbs).toHaveLength(3);
    expect(crumbs[1]).toEqual({ label: "Vigilancia", href: "/gob/vigilancia" });
    expect(crumbs[2]).toEqual({ label: "Investigaciones" });
  });

  it("returns 'Detalle' for dynamic id segment — does NOT echo the raw id", () => {
    const rawId = "b3a1f2c4-e5d6-7890-abcd-ef1234567890";
    const crumbs = deriveOperatorCrumbs(`/gob/maltrato/${rawId}`, "gob");
    expect(crumbs).toHaveLength(3);
    // First crumb links to root.
    expect(crumbs[0]).toEqual({ label: "Panel", href: "/gob" });
    // Section crumb links to the section index.
    expect(crumbs[1]).toEqual({ label: "Maltrato", href: "/gob/maltrato" });
    // Detail crumb is generic — NOT the raw UUID.
    expect(crumbs[2]).toEqual({ label: "Detalle" });
    expect(crumbs[2]?.label).not.toBe(rawId);
  });

  it("does not echo a nanoid/token as a crumb label", () => {
    const token = "xK9mNpQr3sT8vW2y"; // 17-char nanoid-style token
    const crumbs = deriveOperatorCrumbs(`/gob/casos/${token}`, "gob");
    expect(crumbs[2]).toEqual({ label: "Detalle" });
    expect(crumbs[2]?.label).not.toBe(token);
  });

  it("trailing slash is handled gracefully (treated as root)", () => {
    const crumbs = deriveOperatorCrumbs("/gob/", "gob");
    expect(crumbs).toEqual([{ label: "Panel" }]);
  });

  it("first crumb always links to /gob on any non-root page", () => {
    const routes = ["/gob/casos", "/gob/vigilancia", "/gob/analytics", "/gob/usuarios"];
    for (const route of routes) {
      const crumbs = deriveOperatorCrumbs(route, "gob");
      expect(crumbs[0]).toEqual({ label: "Panel", href: "/gob" });
    }
  });
});

// ---------------------------------------------------------------------------
// ADMIN portal
// ---------------------------------------------------------------------------

describe("deriveOperatorCrumbs — admin portal", () => {
  it("returns a single unlinked root crumb on the portal root", () => {
    const crumbs = deriveOperatorCrumbs("/admin", "admin");
    expect(crumbs).toEqual([{ label: "Panel" }]);
    expect(crumbs[0]).not.toHaveProperty("href");
  });

  it("returns two crumbs on a known section route", () => {
    const crumbs = deriveOperatorCrumbs("/admin/moderacion", "admin");
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toEqual({ label: "Panel", href: "/admin" });
    expect(crumbs[1]).toEqual({ label: "Moderación" });
    expect(crumbs[1]).not.toHaveProperty("href");
  });

  it("maps /admin/usuarios to 'Usuarios'", () => {
    const crumbs = deriveOperatorCrumbs("/admin/usuarios", "admin");
    expect(crumbs[1]).toEqual({ label: "Usuarios" });
  });

  it("maps /admin/auditoria to 'Auditoría'", () => {
    const crumbs = deriveOperatorCrumbs("/admin/auditoria", "admin");
    expect(crumbs[1]).toEqual({ label: "Auditoría" });
  });

  it("maps /admin/organizaciones to 'Organizaciones'", () => {
    const crumbs = deriveOperatorCrumbs("/admin/organizaciones", "admin");
    expect(crumbs[1]).toEqual({ label: "Organizaciones" });
  });

  it("maps /admin/jurisdicciones to 'Jurisdicciones'", () => {
    const crumbs = deriveOperatorCrumbs("/admin/jurisdicciones", "admin");
    expect(crumbs[1]).toEqual({ label: "Jurisdicciones" });
  });

  it("returns 'Detalle' for dynamic id segment — does NOT echo the raw id", () => {
    const rawId = "a1b2c3d4-0000-1111-2222-333344445555";
    const crumbs = deriveOperatorCrumbs(`/admin/moderacion/${rawId}`, "admin");
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]).toEqual({ label: "Panel", href: "/admin" });
    expect(crumbs[1]).toEqual({ label: "Moderación", href: "/admin/moderacion" });
    expect(crumbs[2]).toEqual({ label: "Detalle" });
    expect(crumbs[2]?.label).not.toBe(rawId);
  });

  it("does not echo a long public token as a crumb label", () => {
    const token = "offeringTokenXYZ99"; // 18 chars
    const crumbs = deriveOperatorCrumbs(`/admin/servicios/${token}`, "admin");
    expect(crumbs[2]).toEqual({ label: "Detalle" });
    expect(crumbs[2]?.label).not.toBe(token);
  });

  it("first crumb always links to /admin on any non-root page", () => {
    const routes = [
      "/admin/cola",
      "/admin/casos",
      "/admin/moderacion",
      "/admin/usuarios",
      "/admin/auditoria",
    ];
    for (const route of routes) {
      const crumbs = deriveOperatorCrumbs(route, "admin");
      expect(crumbs[0]).toEqual({ label: "Panel", href: "/admin" });
    }
  });

  it("handles a deep static sub-path (two known segments) without leaking ids", () => {
    // /admin/jurisdicciones/ar — "ar" is a short static code, not an id
    const crumbs = deriveOperatorCrumbs("/admin/jurisdicciones/ar", "admin");
    // Should NOT return "Detalle" for a 2-char code that isn't an id.
    // It returns [Dashboard, Jurisdicciones, Ar] — a capitalised sub-label.
    expect(crumbs).toHaveLength(3);
    expect(crumbs[2]?.label).not.toBe("Detalle");
    expect(crumbs[2]?.label).not.toBe("ar"); // capitalised at minimum
  });
});
