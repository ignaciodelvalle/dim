// ComplianceObligationsPanel — jurisdiction-tier treatment (spec CS2/CS3/CS4).
//
// Table fence: mandatory → the existing urgency styling (red allowed);
// recommended → distinct softer treatment, NEVER "vencida"/overdue styling;
// not_regulated → informational only, never an obligation card, never inside
// the compliance percentage. States derive from the REAL projection so the
// panel test can never drift from deriveComplianceState's contract.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  type ComplianceInput,
  type ComplianceObligations,
  deriveComplianceState,
} from "@/lib/projections/pet-compliance";
import { ComplianceObligationsPanel } from "./ComplianceObligationsPanel";

const NOW = new Date("2026-07-01T12:00:00Z");
const VET = { authorRole: "vet", authorVerified: true, authorOrganizationId: null };

// The LnBadge/LnVstamp danger palette — the "red" the fence bans off
// recommended/informational cards.
const DANGER_TOKEN = "--color-ln-err";

function obligations(
  overrides: Partial<Record<keyof ComplianceObligations, { requirementLevel: string }>> = {},
): ComplianceObligations {
  const mandatory = {
    requirementLevel: "mandatory" as const,
    legalBasis: null,
    authority: null,
    sourceUrl: null,
  };
  return {
    rabies: { ...mandatory, ...overrides.rabies } as ComplianceObligations["rabies"],
    sterilization: {
      ...mandatory,
      ...overrides.sterilization,
    } as ComplianceObligations["sterilization"],
    microchip: { ...mandatory, ...overrides.microchip } as ComplianceObligations["microchip"],
  };
}

// An expired VERIFIED rabies dose — urgent under mandatory, softened otherwise.
function expiredRabiesInput(obl: ComplianceObligations): ComplianceInput {
  return {
    now: NOW,
    events: [
      {
        eventType: "vaccination_administered",
        occurredAt: "2026-01-01T00:00:00Z",
        payload: { vaccine_name: "Antirrábica", next_due_at: "2026-06-01" },
        ...VET,
      },
    ],
    rabiesReminder: null,
    reservedRabiesTurno: null,
    microchipCode: null,
    pppApplies: false,
    obligations: obl,
  };
}

function render(input: ComplianceInput): string {
  return renderToStaticMarkup(
    <ComplianceObligationsPanel state={deriveComplianceState(input)} petPublicToken="TEST-0001" />,
  );
}

describe("ComplianceObligationsPanel — tier treatment table", () => {
  it("mandatory: an expired dose keeps the existing overdue (red) styling", () => {
    const html = render(expiredRabiesInput(obligations()));
    expect(html).toContain(DANGER_TOKEN);
    expect(html).not.toContain("Recomendación de tu jurisdicción");
  });

  it("recommended: same expired dose renders softer — no red, with the disclosure line", () => {
    const html = render(
      expiredRabiesInput(obligations({ rabies: { requirementLevel: "recommended" } })),
    );
    expect(html).not.toContain(DANGER_TOKEN);
    expect(html).toContain("Recomendación de tu jurisdicción — no es una obligación legal.");
  });

  it("not_regulated: a registered chip renders informational with its disclosure line", () => {
    const input: ComplianceInput = {
      now: NOW,
      events: [],
      rabiesReminder: null,
      reservedRabiesTurno: null,
      microchipCode: "982000123456789",
      pppApplies: false,
      obligations: obligations({ microchip: { requirementLevel: "not_regulated" } }),
    };
    const html = render(input);
    expect(html).toContain("Solo informativo — no es una obligación en tu jurisdicción.");
    // Excluded from the compliance percentage: only rabies + sterilization count.
    expect(html).toContain("0 de 2 al día");
  });

  it("not_regulated with nothing on record renders no card at all", () => {
    const input: ComplianceInput = {
      now: NOW,
      events: [],
      rabiesReminder: null,
      reservedRabiesTurno: null,
      microchipCode: null,
      pppApplies: false,
      obligations: obligations({ microchip: { requirementLevel: "not_regulated" } }),
    };
    const html = render(input);
    expect(html).not.toContain('data-obligation="microchip"');
    expect(html).toContain("0 de 2 al día");
  });
});
