import { describe, expect, it } from "vitest";
import { resolvePetFace } from "./pet-face-nav";

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
      name: "?tab=libreta with no lente — legacy grouped official view",
      tab: "libreta",
      lente: undefined,
      isOwner: true,
      expected: { face: "libreta", lens: "oficial" },
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
      name: "?tab=libreta&lente=oficial — explicit lente wins",
      tab: "libreta",
      lente: "oficial",
      isOwner: true,
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
      name: "invalid lente value falls back to oficial default",
      tab: "libreta",
      lente: "bogus",
      isOwner: true,
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
