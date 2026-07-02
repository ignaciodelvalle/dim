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
