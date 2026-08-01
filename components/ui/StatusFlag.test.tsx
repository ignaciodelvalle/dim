// Smoke tests for <LnStatusFlag>.
// Pattern: renderToStaticMarkup (server-only, no React DOM needed).
//
// The "registered" variant exists so the header chip can stop claiming
// AL DÍA for pets whose compliance panel says otherwise (QA 2026-07-03).
// AL DÍA is reserved for full compliance — see LnPetStatus in Chip.tsx.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LnStatusFlag } from "./StatusFlag";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("<LnStatusFlag>", () => {
  it("renders AL DÍA only for the ok (fully compliant) status", () => {
    expect(render(<LnStatusFlag status="ok" />)).toContain("AL DÍA");
    expect(render(<LnStatusFlag status="registered" />)).not.toContain("AL DÍA");
  });

  it("renders the neutral registered label, inflected for the pet", () => {
    const html = render(<LnStatusFlag status="registered" sex="female" />);
    expect(html).toContain("REGISTRADA");
    expect(html).not.toContain("ln-ok");
  });

  it("keeps the invariable state labels", () => {
    expect(render(<LnStatusFlag status="sick" />)).toContain("EN TRATAMIENTO");
    expect(render(<LnStatusFlag status="pregnant" />)).toContain("PREÑADA");
    expect(render(<LnStatusFlag status="deceased" />)).toContain("EN MEMORIA");
  });

  // -------------------------------------------------------------------------
  // Gender agreement (critique-libreta 2026-07-27 #5)
  // -------------------------------------------------------------------------
  //
  // flagConfig used to hold a FIXED masculine "PERDIDO" beside a FIXED feminine
  // "REGISTRADA", so Luna — a female dog — was flagged PERDIDO on the owner's
  // list while her own credential badge and her lost poster said PERDIDA. The
  // credential had already been swept for this (QA histórico 2026-07-08 #2);
  // the list had not. These tests pin the agreement in both directions, because
  // a one-directional test would stay green against a hard-coded label.

  describe("agrees with the animal's sex", () => {
    it("inflects the lost label", () => {
      expect(render(<LnStatusFlag status="lost" sex="female" />)).toContain("PERDIDA");
      expect(render(<LnStatusFlag status="lost" sex="male" />)).toContain("PERDIDO");
    });

    it("inflects the registered label", () => {
      expect(render(<LnStatusFlag status="registered" sex="female" />)).toContain("REGISTRADA");
      expect(render(<LnStatusFlag status="registered" sex="male" />)).toContain("REGISTRADO");
    });

    it("never renders the masculine form for a female pet", () => {
      // The actual regression: "PERDIDO" is a prefix of nothing else here, but
      // "REGISTRADO" IS a prefix of "REGISTRADA"'s stem, so assert on the whole
      // rendered label rather than on substring containment.
      const lost = render(<LnStatusFlag status="lost" sex="female" />);
      expect(lost).not.toMatch(/>PERDIDO</);
      const registered = render(<LnStatusFlag status="registered" sex="female" />);
      expect(registered).not.toMatch(/>REGISTRADO</);
    });

    it("uses the slashed inclusive form when the sex is not on record", () => {
      // Same fallback the credential's `registeredAdjective` already shows for
      // the same pet — the two surfaces must not disagree. Guessing a gender
      // here would be worse than admitting we do not know it.
      expect(render(<LnStatusFlag status="lost" />)).toContain("PERDIDO/A");
      expect(render(<LnStatusFlag status="lost" sex="unknown" />)).toContain("PERDIDO/A");
      expect(render(<LnStatusFlag status="registered" sex={null} />)).toContain("REGISTRADO/A");
    });

    it("leaves the invariable labels alone whatever the sex", () => {
      // A regression that inflected everything would be as wrong as one that
      // inflected nothing. "Preñada" in particular is a female-only state and
      // must never acquire a masculine form.
      for (const sex of ["male", "female", "unknown", null] as const) {
        expect(render(<LnStatusFlag status="ok" sex={sex} />)).toContain("AL DÍA");
        expect(render(<LnStatusFlag status="sick" sex={sex} />)).toContain("EN TRATAMIENTO");
        expect(render(<LnStatusFlag status="pregnant" sex={sex} />)).toContain("PREÑADA");
        expect(render(<LnStatusFlag status="deceased" sex={sex} />)).toContain("EN MEMORIA");
      }
    });
  });

  // pet-state-header R7.1 audit pin — each flag's token family must match the
  // pet-situation tone family the credential masthead uses for the same state,
  // so a lost pet reads the SAME red on its list row and on its band.
  it("uses the situation tone-family tokens per state (alignment with pet-situation)", () => {
    expect(render(<LnStatusFlag status="lost" />)).toContain("ln-err"); // alerta
    expect(render(<LnStatusFlag status="sick" />)).toContain("ln-warn"); // tratamiento
    expect(render(<LnStatusFlag status="pregnant" />)).toContain("ln-rosa"); // gestacion
    expect(render(<LnStatusFlag status="ok" />)).toContain("ln-ok"); // ok
    expect(render(<LnStatusFlag status="deceased" />)).toContain("ln-memorial"); // memoria
  });
});
