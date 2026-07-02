import { describe, expect, it } from "vitest";
import { buildFromLostRedirectTarget, resolvePetFace } from "./pet-face-nav";

describe("resolvePetFace", () => {
  const cases: Array<{
    name: string;
    tab: string | undefined;
    lente: string | undefined;
    isOwner: boolean;
    expected: { face: "credencial" | "libreta"; lens: "todo" | "vacunas" | "oficial" };
  }> = [
    {
      name: "no tab param — default to Credencial",
      tab: undefined,
      lente: undefined,
      isOwner: true,
      expected: { face: "credencial", lens: "todo" },
    },
    {
      name: "?tab=credencial",
      tab: "credencial",
      lente: undefined,
      isOwner: true,
      expected: { face: "credencial", lens: "todo" },
    },
    {
      name: "?tab=resumen (legacy default)",
      tab: "resumen",
      lente: undefined,
      isOwner: true,
      expected: { face: "credencial", lens: "todo" },
    },
    {
      name: "?tab=vacunas",
      tab: "vacunas",
      lente: undefined,
      isOwner: true,
      expected: { face: "libreta", lens: "vacunas" },
    },
    {
      name: "?tab=historial",
      tab: "historial",
      lente: undefined,
      isOwner: true,
      expected: { face: "libreta", lens: "todo" },
    },
    {
      name: "?tab=libreta with no lente (owner) — legacy grouped official view clamps to todo",
      tab: "libreta",
      lente: undefined,
      isOwner: true,
      expected: { face: "libreta", lens: "todo" },
    },
    {
      name: "?tab=libreta&lente=vacunas — explicit lente wins",
      tab: "libreta",
      lente: "vacunas",
      isOwner: true,
      expected: { face: "libreta", lens: "vacunas" },
    },
    {
      name: "?tab=libreta&lente=todo — explicit lente wins (owner)",
      tab: "libreta",
      lente: "todo",
      isOwner: true,
      expected: { face: "libreta", lens: "todo" },
    },
    {
      name: "?tab=libreta&lente=oficial (owner) — legacy deep link clamps to todo",
      tab: "libreta",
      lente: "oficial",
      isOwner: true,
      expected: { face: "libreta", lens: "todo" },
    },
    {
      name: "?tab=libreta&lente=oficial (org viewer) — explicit lente wins, not clamped",
      tab: "libreta",
      lente: "oficial",
      isOwner: false,
      expected: { face: "libreta", lens: "oficial" },
    },
    {
      name: "org viewer + libreta + lente=todo — clamped to vacunas",
      tab: "libreta",
      lente: "todo",
      isOwner: false,
      expected: { face: "libreta", lens: "vacunas" },
    },
    {
      name: "org viewer + historial (resolves todo) — clamped to vacunas",
      tab: "historial",
      lente: undefined,
      isOwner: false,
      expected: { face: "libreta", lens: "vacunas" },
    },
    {
      name: "org viewer + libreta + no lente (oficial) — not clamped",
      tab: "libreta",
      lente: undefined,
      isOwner: false,
      expected: { face: "libreta", lens: "oficial" },
    },
    {
      name: "invalid lente value (owner) falls back to oficial default, then clamps to todo",
      tab: "libreta",
      lente: "bogus",
      isOwner: true,
      expected: { face: "libreta", lens: "todo" },
    },
    {
      name: "invalid lente value (org viewer) falls back to oficial default, not clamped",
      tab: "libreta",
      lente: "bogus",
      isOwner: false,
      expected: { face: "libreta", lens: "oficial" },
    },
    {
      name: "unknown tab value falls back to Credencial",
      tab: "bogus-tab",
      lente: undefined,
      isOwner: true,
      expected: { face: "credencial", lens: "todo" },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(resolvePetFace({ tab: c.tab, lente: c.lente, isOwner: c.isOwner })).toEqual(
        c.expected,
      );
    });
  }
});

// pet-document-redesign REQ-6.3: `?fromLost=1` becomes a no-op redirect —
// the D9 LostCockpit bypass has no target since the cockpit was deleted.
describe("buildFromLostRedirectTarget", () => {
  it("returns null when fromLost is absent (no redirect)", () => {
    expect(buildFromLostRedirectTarget("abc123", {})).toBeNull();
    expect(buildFromLostRedirectTarget("abc123", { tab: "vacunas" })).toBeNull();
  });

  it("strips fromLost and redirects to the plain profile URL when it's the only param", () => {
    expect(buildFromLostRedirectTarget("abc123", { fromLost: "1" })).toBe("/mis-mascotas/abc123");
  });

  it("preserves every other param (e.g. legacy ?tab= deep links keep working)", () => {
    const target = buildFromLostRedirectTarget("abc123", { fromLost: "1", tab: "vacunas" });
    expect(target).toBe("/mis-mascotas/abc123?tab=vacunas");
  });

  it("no dead param retained — fromLost never appears in the redirect target", () => {
    const target = buildFromLostRedirectTarget("abc123", {
      fromLost: "1",
      tab: "libreta",
      lente: "oficial",
    });
    expect(target).not.toContain("fromLost");
    expect(target).toContain("tab=libreta");
    expect(target).toContain("lente=oficial");
  });
});
