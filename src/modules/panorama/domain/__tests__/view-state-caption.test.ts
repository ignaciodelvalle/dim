// "Explain this view" — proof the ViewState value is complete (task #50 P5).

import { describe, expect, it } from "vitest";

import { DEFAULT_VIEW_STATE, makeViewState } from "@/src/modules/panorama/domain/view-state";
import { explainViewState } from "@/src/modules/panorama/domain/view-state-caption";

describe("explainViewState", () => {
  it("describes a bare national default view", () => {
    expect(explainViewState(DEFAULT_VIEW_STATE)).toBe(
      "Vista personalizada — Argentina (todas las provincias), últimos 3 años.",
    );
  });

  it("names the preset and lists the active layers", () => {
    const v = makeViewState({
      preset: "brotes-activos",
      layers: ["cobertura", "zoonosis"],
      period: { kind: "preset", preset: "90d" },
    });
    expect(explainViewState(v)).toBe(
      "Brotes activos — Argentina (todas las provincias), últimos 90 días. Capas: Cobertura antirrábica (perros, 12m), Zoonosis / señales.",
    );
  });

  it("uses the display-name resolvers for a locality scope", () => {
    const v = makeViewState({
      scope: { kind: "locality", province: "AR-C", locality: "palermo" },
      preset: "bienestar",
      layers: ["denuncias"],
    });
    const names = {
      provinceLabel: (code: string) => (code === "AR-C" ? "CABA" : undefined),
      localityLabel: (_p: string, l: string) => (l === "palermo" ? "Palermo" : undefined),
    };
    expect(explainViewState(v, names)).toBe(
      "Bienestar y fiscalización — Palermo, CABA, últimos 3 años. Capas: Denuncias de bienestar.",
    );
  });

  it("describes a scrub cut with its bitemporal basis", () => {
    const v = makeViewState({
      preset: "sintomas",
      layers: ["sintomas", "zoonosis"],
      asOf: "2026-05-01T00:00:00.000Z",
      basis: "transaction",
    });
    expect(explainViewState(v)).toContain("al 1 de mayo de 2026 (tiempo de transacción)");
  });

  it("defaults the scrub basis phrase to 'validez'", () => {
    const v = makeViewState({ asOf: "2026-05-01T00:00:00.000Z", basis: "valid" });
    expect(explainViewState(v)).toContain("(tiempo de validez)");
  });

  it("surfaces the verified-only filter", () => {
    const v = makeViewState({ verifiedOnly: true });
    expect(explainViewState(v)).toContain("solo con firma veterinaria");
  });

  it("describes a custom period range in es-AR", () => {
    const v = makeViewState({
      period: { kind: "custom", from: "2026-01-01T00:00:00.000Z", to: "2026-03-31T00:00:00.000Z" },
    });
    expect(explainViewState(v)).toContain("del 1 de enero de 2026 al 31 de marzo de 2026");
  });

  it("names the bounded operator's jurisdiction instead of the nation (Finding #1)", () => {
    // A govt operator carries a `national` ViewState scope (no explicit drill) but
    // their data is scoped — the footer must NOT say "todas las provincias".
    const v = makeViewState({ layers: ["perdidas"] });
    expect(
      explainViewState(v, { boundedScopeLabel: "Tierra del Fuego, Santa Cruz, CABA" }),
    ).toContain("Tierra del Fuego, Santa Cruz, CABA");
    expect(
      explainViewState(v, { boundedScopeLabel: "Tierra del Fuego, Santa Cruz, CABA" }),
    ).not.toContain("todas las provincias");
  });

  it("qualifies the national phrase with the department grain the map shows (Finding #1)", () => {
    // Admin at national scope but the map auto-disaggregated to department grain —
    // the footer must reflect the grain, not imply province-level coverage.
    const v = makeViewState({ layers: ["perdidas"] });
    expect(explainViewState(v, { renderLevel: "locality" })).toContain(
      "Argentina · nivel departamento",
    );
    // Province grain keeps the full-coverage phrase (honest there).
    expect(explainViewState(v, { renderLevel: "province" })).toContain(
      "Argentina (todas las provincias)",
    );
  });

  it("boundedScopeLabel wins over the renderLevel qualifier", () => {
    const v = makeViewState({ layers: ["perdidas"] });
    expect(explainViewState(v, { boundedScopeLabel: "Salta", renderLevel: "locality" })).toContain(
      "Salta",
    );
  });

  it("skips unknown layer ids without throwing", () => {
    const v = makeViewState({ layers: ["cobertura"] });
    // A well-formed value only ever holds valid ids (the URL boundary filters),
    // but the caption must be defensive regardless.
    expect(explainViewState(v)).toContain("Capas: Cobertura antirrábica (perros, 12m).");
  });
});
