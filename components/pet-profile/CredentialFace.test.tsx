// Tests for <CredentialFace> — pet profile two-face redesign (Face 1, 2026-07-01).
//
// Covers the H1 negative case from the spec ("Self-reported event does not
// clear obligation"): a self-reported satisfying event must render
// "Declarada · sin verificar" (tone: neutral), never an "ok"/"Al día" stamp,
// via the re-hosted ComplianceObligationsPanel. Render via react-dom/server
// → HTML string (same pattern as PetAlertStrip.test.tsx).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type ComplianceEvent,
  type ComplianceInput,
  deriveComplianceState,
} from "@/lib/projections/pet-compliance";
import { CredentialFace, type CredentialFaceProps } from "./CredentialFace";

const NOW = new Date("2026-07-01T12:00:00Z");
const SELF = { authorRole: "owner", authorVerified: false, authorOrganizationId: null };
const VET = { authorRole: "vet", authorVerified: true, authorOrganizationId: null };

function complianceInput(overrides: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    now: NOW,
    events: [],
    rabiesReminder: null,
    reservedRabiesTurno: null,
    microchipCode: null,
    pppApplies: false,
    ...overrides,
  };
}

function sterilization(prov: Partial<ComplianceEvent>): ComplianceEvent {
  return {
    eventType: "sterilization_performed",
    occurredAt: "2026-01-01T00:00:00Z",
    payload: {},
    ...prov,
  };
}

const baseProps: Omit<CredentialFaceProps, "complianceState"> = {
  heroProps: { name: "Firulais", breed: "Mestizo" },
  qrSvg: "<svg></svg>",
  publicHref: "/p/abc",
  petPublicToken: "abc",
};

function render(complianceState: ReturnType<typeof deriveComplianceState>): string {
  return renderToStaticMarkup(<CredentialFace {...baseProps} complianceState={complianceState} />);
}

describe("CredentialFace — H1 provenance gate (negative case)", () => {
  it("self-reported sterilization never renders an ok stamp — shows Declarada · sin verificar", () => {
    const state = deriveComplianceState(complianceInput({ events: [sterilization(SELF)] }));
    const card = state.cards.find((c) => c.key === "sterilization");
    // Derivation itself must downgrade to neutral (H1) — asserted independent
    // of rendering so a future component regression can't hide a logic bug.
    expect(card?.tone).toBe("neutral");
    expect(card?.state).toBe("Declarada · sin verificar");

    const html = render(state);
    // The component must actually surface the derived state, not just compute it.
    expect(html).toContain("Declarada · sin verificar");
    // "Registrada" is the ok-only sterilization label — must never appear here.
    expect(html).not.toContain("Registrada");
  });

  it("professional-verified sterilization renders Registrada / ok, counts toward the summary", () => {
    const state = deriveComplianceState(complianceInput({ events: [sterilization(VET)] }));
    const card = state.cards.find((c) => c.key === "sterilization");
    expect(card?.tone).toBe("ok");
    expect(card?.state).toBe("Registrada");

    const html = render(state);
    expect(html).toContain("Registrada");
  });
});

describe("CredentialFace — In-Memoriam skin (ADR-15)", () => {
  // wave-3 D12: the ribbon now renders through the shared LnMemorialChip
  // (components/ui/StatusFlag.tsx) instead of hand-rolling its own box —
  // its canonical label is "En memoria" (Spanish, matching the rest of the
  // app's es-AR-only copy), replacing the former ad-hoc "In Memoriam" text.
  it("renders no memorial ribbon when memorial is absent (default/active pet)", () => {
    const state = deriveComplianceState(complianceInput());
    const html = render(state);
    expect(html).not.toContain("En memoria");
    expect(html).not.toContain('data-section="memorial-ribbon"');
  });

  it("renders the En memoria ribbon with the birth-death year line when memorial is set", () => {
    const state = deriveComplianceState(complianceInput());
    const html = renderToStaticMarkup(
      <CredentialFace
        {...baseProps}
        complianceState={state}
        memorial={{ birthYear: 2015, deathYear: 2026 }}
      />,
    );
    expect(html).toContain("En memoria");
    expect(html).toContain("2015");
    expect(html).toContain("2026");
    expect(html).toContain('data-section="memorial-ribbon"');
  });

  it("falls back to a bare 'En memoria' line when birth/death years are unknown", () => {
    const state = deriveComplianceState(complianceInput());
    const html = renderToStaticMarkup(
      <CredentialFace
        {...baseProps}
        complianceState={state}
        memorial={{ birthYear: null, deathYear: null }}
      />,
    );
    expect(html).toContain("En memoria");
    expect(html).not.toContain("–"); // no year range when years are unknown
  });
});

// QA histórico 2026-07-08 item 2 (round 2): "Rocco Inscripta" — the
// registration badge disagreed with a male pet's sex. It must now render
// "Inscripto" for male, "Inscripta" for female, and the neutral "Inscripto/a"
// when sex is unrecorded — and the same word must agree in BOTH render
// paths (the prominent badge next to the name, and the quiet marker used
// when a situation skin is active).
describe("CredentialFace — Inscripto/a gender agreement", () => {
  it("renders Inscripto for a male pet", () => {
    const state = deriveComplianceState(complianceInput());
    const html = renderToStaticMarkup(
      <CredentialFace {...baseProps} complianceState={state} petSex="male" />,
    );
    expect(html).toContain("Inscripto");
    expect(html).not.toContain("Inscripta");
  });

  it("renders Inscripta for a female pet", () => {
    const state = deriveComplianceState(complianceInput());
    const html = renderToStaticMarkup(
      <CredentialFace {...baseProps} complianceState={state} petSex="female" />,
    );
    expect(html).toContain("Inscripta");
  });

  it("renders the neutral Inscripto/a when sex is unrecorded", () => {
    const state = deriveComplianceState(complianceInput());
    const html = renderToStaticMarkup(
      <CredentialFace {...baseProps} complianceState={state} petSex={null} />,
    );
    expect(html).toContain("Inscripto/a");
  });

  it("genders the quiet marker too, when a situation skin demotes the badge", () => {
    const state = deriveComplianceState(complianceInput());
    const html = renderToStaticMarkup(
      <CredentialFace
        {...baseProps}
        complianceState={state}
        petSex="male"
        situation={{
          key: "perdida",
          tone: "alerta",
          label: "Perdida",
          icon: "perdida",
          isDefault: false,
        }}
      />,
    );
    expect(html).toContain("Inscripto");
    expect(html).not.toContain("Inscripta");
    // Pet-state standardization (PO 2026-07-16): the situation LABEL must NOT
    // render here — the masthead band chip (DocumentChrome) is the single
    // textual carrier of the state. The face keeps only its data-situation
    // tint hook and the demoted registration marker asserted above.
    expect(html).not.toContain("Perdido");
    expect(html).not.toContain("Perdida");
    expect(html).toContain('data-situation="perdida"');
  });
});
